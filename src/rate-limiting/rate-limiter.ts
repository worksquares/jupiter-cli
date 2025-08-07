/**
 * Rate Limiter
 * Manages API rate limits with multiple strategies
 */

import { EventEmitter } from 'eventemitter3';
import { Logger } from '../utils/logger';
import {
  RateLimitRule,
  RateLimitState,
  RateLimitEntry,
  RateLimitConfig,
  RateLimitEvents,
  RateLimitCheckResult,
  RateLimitStats,
  RateLimitStatus,
  RateLimitWindow,
  RateLimitStrategy,
  RateLimitMetadata,
  TokenBucket,
  SlidingWindowEntry
} from './types';

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Partial<RateLimitConfig> = {
  storage: 'memory',
  warningThreshold: 80,
  enableBurst: true,
  enablePenalty: true,
  globalFallback: false
};

/**
 * Base rate limit strategy
 */
abstract class RateLimitStrategyBase {
  protected logger: Logger;

  constructor(protected rule: RateLimitRule) {
    this.logger = new Logger(`RateLimitStrategy:${rule.name}`);
  }

  abstract check(metadata?: RateLimitMetadata): RateLimitCheckResult;
  abstract increment(weight?: number, metadata?: RateLimitMetadata): void;
  abstract reset(): void;
  abstract getState(): RateLimitState;
}

/**
 * Fixed window rate limit strategy
 */
class FixedWindowStrategy extends RateLimitStrategyBase {
  private entry: RateLimitEntry;

  constructor(rule: RateLimitRule) {
    super(rule);
    this.entry = this.createEntry();
  }

  check(metadata?: RateLimitMetadata): RateLimitCheckResult {
    this.updateWindow();
    
    const state = this.getState();
    const allowed = state.remaining > 0 && !this.entry.blocked;

    return {
      allowed,
      state,
      rule: this.rule,
      waitTime: allowed ? 0 : this.getWaitTime(),
      reason: allowed ? undefined : 'Rate limit exceeded'
    };
  }

  increment(weight: number = 1, metadata?: RateLimitMetadata): void {
    this.updateWindow();
    
    this.entry.count += weight;
    this.entry.lastRequest = new Date();

    // Check if exceeded
    if (this.entry.count > this.rule.limit && this.rule.penaltyDuration) {
      this.entry.blocked = true;
      this.entry.blockedUntil = new Date(Date.now() + this.rule.penaltyDuration);
    }
  }

  reset(): void {
    this.entry = this.createEntry();
  }

  getState(): RateLimitState {
    this.updateWindow();
    
    const remaining = Math.max(0, this.rule.limit - this.entry.count);
    const percentage = (this.entry.count / this.rule.limit) * 100;

    let status: RateLimitStatus;
    if (this.entry.blocked) {
      status = RateLimitStatus.Exceeded;
    } else if (percentage >= 100) {
      status = RateLimitStatus.Exceeded;
    } else if (percentage >= 80) {
      status = RateLimitStatus.Warning;
    } else if (percentage >= 50) {
      status = RateLimitStatus.Limited;
    } else {
      status = RateLimitStatus.Allowed;
    }

    return {
      status,
      remaining,
      limit: this.rule.limit,
      resetsAt: this.entry.windowEnd,
      retryAfter: this.entry.blocked && this.entry.blockedUntil ? 
        Math.ceil((this.entry.blockedUntil.getTime() - Date.now()) / 1000) : 
        undefined
    };
  }

  private createEntry(): RateLimitEntry {
    const now = new Date();
    const windowDuration = this.getWindowDuration();
    
    return {
      ruleId: this.rule.id,
      count: 0,
      windowStart: now,
      windowEnd: new Date(now.getTime() + windowDuration),
      lastRequest: now,
      blocked: false
    };
  }

  private updateWindow(): void {
    const now = new Date();
    
    // Check if blocked
    if (this.entry.blocked && this.entry.blockedUntil) {
      if (now >= this.entry.blockedUntil) {
        this.entry.blocked = false;
        this.entry.blockedUntil = undefined;
      }
    }

    // Check if window expired
    if (now >= this.entry.windowEnd) {
      this.entry = this.createEntry();
    }
  }

  private getWindowDuration(): number {
    switch (this.rule.window) {
      case RateLimitWindow.Second:
        return 1000;
      case RateLimitWindow.Minute:
        return 60 * 1000;
      case RateLimitWindow.Hour:
        return 60 * 60 * 1000;
      case RateLimitWindow.Day:
        return 24 * 60 * 60 * 1000;
      case RateLimitWindow.Custom:
        return this.rule.windowDuration || 60000;
    }
  }

  private getWaitTime(): number {
    if (this.entry.blocked && this.entry.blockedUntil) {
      return Math.max(0, this.entry.blockedUntil.getTime() - Date.now());
    }
    return Math.max(0, this.entry.windowEnd.getTime() - Date.now());
  }
}

/**
 * Sliding window rate limit strategy
 */
class SlidingWindowStrategy extends RateLimitStrategyBase {
  private entries: SlidingWindowEntry[] = [];
  private blocked: boolean = false;
  private blockedUntil?: Date;

  check(metadata?: RateLimitMetadata): RateLimitCheckResult {
    this.cleanup();
    
    const state = this.getState();
    const allowed = state.remaining > 0 && !this.blocked;

    return {
      allowed,
      state,
      rule: this.rule,
      waitTime: allowed ? 0 : this.getWaitTime(),
      reason: allowed ? undefined : 'Rate limit exceeded'
    };
  }

  increment(weight: number = 1, metadata?: RateLimitMetadata): void {
    this.cleanup();
    
    this.entries.push({
      timestamp: new Date(),
      weight,
      metadata
    });

    // Check if exceeded
    const totalWeight = this.entries.reduce((sum, e) => sum + (e.weight || 1), 0);
    if (totalWeight > this.rule.limit && this.rule.penaltyDuration) {
      this.blocked = true;
      this.blockedUntil = new Date(Date.now() + this.rule.penaltyDuration);
    }
  }

  reset(): void {
    this.entries = [];
    this.blocked = false;
    this.blockedUntil = undefined;
  }

  getState(): RateLimitState {
    this.cleanup();
    
    const totalWeight = this.entries.reduce((sum, e) => sum + (e.weight || 1), 0);
    const remaining = Math.max(0, this.rule.limit - totalWeight);
    const percentage = (totalWeight / this.rule.limit) * 100;

    let status: RateLimitStatus;
    if (this.blocked) {
      status = RateLimitStatus.Exceeded;
    } else if (percentage >= 100) {
      status = RateLimitStatus.Exceeded;
    } else if (percentage >= 80) {
      status = RateLimitStatus.Warning;
    } else if (percentage >= 50) {
      status = RateLimitStatus.Limited;
    } else {
      status = RateLimitStatus.Allowed;
    }

    const windowDuration = this.getWindowDuration();
    const resetsAt = new Date(Date.now() + windowDuration);

    return {
      status,
      remaining,
      limit: this.rule.limit,
      resetsAt,
      retryAfter: this.blocked && this.blockedUntil ? 
        Math.ceil((this.blockedUntil.getTime() - Date.now()) / 1000) : 
        undefined
    };
  }

  private cleanup(): void {
    const now = Date.now();
    const windowDuration = this.getWindowDuration();
    
    // Remove old entries
    this.entries = this.entries.filter(
      entry => now - entry.timestamp.getTime() < windowDuration
    );

    // Check if unblocked
    if (this.blocked && this.blockedUntil && now >= this.blockedUntil.getTime()) {
      this.blocked = false;
      this.blockedUntil = undefined;
    }
  }

  private getWindowDuration(): number {
    switch (this.rule.window) {
      case RateLimitWindow.Second:
        return 1000;
      case RateLimitWindow.Minute:
        return 60 * 1000;
      case RateLimitWindow.Hour:
        return 60 * 60 * 1000;
      case RateLimitWindow.Day:
        return 24 * 60 * 60 * 1000;
      case RateLimitWindow.Custom:
        return this.rule.windowDuration || 60000;
    }
  }

  private getWaitTime(): number {
    if (this.blocked && this.blockedUntil) {
      return Math.max(0, this.blockedUntil.getTime() - Date.now());
    }
    
    // Find oldest entry that would need to expire
    if (this.entries.length > 0) {
      const oldestEntry = this.entries[0];
      const windowDuration = this.getWindowDuration();
      return Math.max(0, oldestEntry.timestamp.getTime() + windowDuration - Date.now());
    }
    
    return 0;
  }
}

/**
 * Token bucket rate limit strategy
 */
class TokenBucketStrategy extends RateLimitStrategyBase {
  private bucket: TokenBucket;
  private blocked: boolean = false;
  private blockedUntil?: Date;

  constructor(rule: RateLimitRule) {
    super(rule);
    
    const refillRate = this.calculateRefillRate();
    this.bucket = {
      capacity: rule.burst || rule.limit,
      tokens: rule.burst || rule.limit,
      refillRate,
      lastRefill: new Date()
    };
  }

  check(metadata?: RateLimitMetadata): RateLimitCheckResult {
    this.refill();
    
    const state = this.getState();
    const allowed = this.bucket.tokens >= 1 && !this.blocked;

    return {
      allowed,
      state,
      rule: this.rule,
      waitTime: allowed ? 0 : this.getWaitTime(),
      reason: allowed ? undefined : 'Insufficient tokens'
    };
  }

  increment(weight: number = 1, metadata?: RateLimitMetadata): void {
    this.refill();
    
    this.bucket.tokens = Math.max(0, this.bucket.tokens - weight);

    // Check if should block
    if (this.bucket.tokens <= 0 && this.rule.penaltyDuration) {
      this.blocked = true;
      this.blockedUntil = new Date(Date.now() + this.rule.penaltyDuration);
    }
  }

  reset(): void {
    this.bucket.tokens = this.bucket.capacity;
    this.bucket.lastRefill = new Date();
    this.blocked = false;
    this.blockedUntil = undefined;
  }

  getState(): RateLimitState {
    this.refill();
    
    const remaining = Math.floor(this.bucket.tokens);
    const percentage = ((this.bucket.capacity - this.bucket.tokens) / this.bucket.capacity) * 100;

    let status: RateLimitStatus;
    if (this.blocked) {
      status = RateLimitStatus.Exceeded;
    } else if (remaining <= 0) {
      status = RateLimitStatus.Exceeded;
    } else if (percentage >= 80) {
      status = RateLimitStatus.Warning;
    } else if (percentage >= 50) {
      status = RateLimitStatus.Limited;
    } else {
      status = RateLimitStatus.Allowed;
    }

    // Calculate when bucket will be full
    const tokensNeeded = this.bucket.capacity - this.bucket.tokens;
    const timeToFull = tokensNeeded / this.bucket.refillRate * 1000;
    const resetsAt = new Date(Date.now() + timeToFull);

    return {
      status,
      remaining,
      limit: this.rule.limit,
      resetsAt,
      retryAfter: this.blocked && this.blockedUntil ? 
        Math.ceil((this.blockedUntil.getTime() - Date.now()) / 1000) : 
        undefined
    };
  }

  private refill(): void {
    const now = Date.now();
    
    // Check if unblocked
    if (this.blocked && this.blockedUntil && now >= this.blockedUntil.getTime()) {
      this.blocked = false;
      this.blockedUntil = undefined;
    }

    // Calculate tokens to add
    const timePassed = now - this.bucket.lastRefill.getTime();
    const tokensToAdd = (timePassed / 1000) * this.bucket.refillRate;
    
    this.bucket.tokens = Math.min(
      this.bucket.capacity,
      this.bucket.tokens + tokensToAdd
    );
    
    this.bucket.lastRefill = new Date(now);
  }

  private calculateRefillRate(): number {
    const windowDuration = this.getWindowDuration();
    return this.rule.limit / (windowDuration / 1000);
  }

  private getWindowDuration(): number {
    switch (this.rule.window) {
      case RateLimitWindow.Second:
        return 1000;
      case RateLimitWindow.Minute:
        return 60 * 1000;
      case RateLimitWindow.Hour:
        return 60 * 60 * 1000;
      case RateLimitWindow.Day:
        return 24 * 60 * 60 * 1000;
      case RateLimitWindow.Custom:
        return this.rule.windowDuration || 60000;
    }
  }

  private getWaitTime(): number {
    if (this.blocked && this.blockedUntil) {
      return Math.max(0, this.blockedUntil.getTime() - Date.now());
    }
    
    // Calculate time until we have 1 token
    if (this.bucket.tokens < 1) {
      const tokensNeeded = 1 - this.bucket.tokens;
      return Math.ceil((tokensNeeded / this.bucket.refillRate) * 1000);
    }
    
    return 0;
  }
}

/**
 * Rate limiter implementation
 */
export class RateLimiter extends EventEmitter<RateLimitEvents> {
  private config: RateLimitConfig;
  private strategies: Map<string, RateLimitStrategyBase> = new Map();
  private logger: Logger;
  private stats: {
    totalRequests: number;
    allowedRequests: number;
    deniedRequests: number;
    warningCount: number;
    hourlyRequests: Map<number, { requests: number; denied: number }>;
  };
  private currentState?: RateLimitState;

  constructor(config: RateLimitConfig) {
    super();
    this.logger = new Logger('RateLimiter');
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.stats = {
      totalRequests: 0,
      allowedRequests: 0,
      deniedRequests: 0,
      warningCount: 0,
      hourlyRequests: new Map()
    };

    // Initialize strategies
    this.initializeStrategies();
  }

  /**
   * Check if request is allowed
   */
  async check(metadata?: RateLimitMetadata): Promise<RateLimitCheckResult> {
    this.stats.totalRequests++;
    
    // Check all rules
    const results: RateLimitCheckResult[] = [];
    
    for (const strategy of this.strategies.values()) {
      const result = strategy.check(metadata);
      results.push(result);
      
      // Emit warning if needed
      if (result.state.status === RateLimitStatus.Warning) {
        this.stats.warningCount++;
        this.emit('limit:warning', result.rule!, result.state);
      }
    }

    // Find the most restrictive result
    const finalResult = results.reduce((most, current) => {
      if (!current.allowed && most.allowed) return current;
      if (!current.allowed && !most.allowed) {
        return current.waitTime! > most.waitTime! ? current : most;
      }
      return most;
    });

    // Update stats
    const hour = new Date().getHours();
    const hourStats = this.stats.hourlyRequests.get(hour) || { requests: 0, denied: 0 };
    hourStats.requests++;
    
    if (finalResult.allowed) {
      this.stats.allowedRequests++;
    } else {
      this.stats.deniedRequests++;
      hourStats.denied++;
      this.emit('limit:exceeded', finalResult.rule!, finalResult.state);
    }
    
    this.stats.hourlyRequests.set(hour, hourStats);

    // Update global state
    if (this.currentState?.status !== finalResult.state.status) {
      this.currentState = finalResult.state;
      this.emit('status:changed', finalResult.state);
    }

    return finalResult;
  }

  /**
   * Increment rate limit counters
   */
  async increment(weight: number = 1, metadata?: RateLimitMetadata): Promise<void> {
    for (const strategy of this.strategies.values()) {
      strategy.increment(weight, metadata);
    }
  }

  /**
   * Reset specific rule or all rules
   */
  reset(ruleId?: string): void {
    if (ruleId) {
      const strategy = this.strategies.get(ruleId);
      if (strategy) {
        strategy.reset();
        const rule = this.config.rules.find(r => r.id === ruleId);
        if (rule) {
          this.emit('limit:reset', rule);
        }
      }
    } else {
      // Reset all
      for (const [id, strategy] of this.strategies) {
        strategy.reset();
        const rule = this.config.rules.find(r => r.id === id);
        if (rule) {
          this.emit('limit:reset', rule);
        }
      }
    }
  }

  /**
   * Get current state for all rules
   */
  getState(): Map<string, RateLimitState> {
    const states = new Map<string, RateLimitState>();
    
    for (const [id, strategy] of this.strategies) {
      states.set(id, strategy.getState());
    }
    
    return states;
  }

  /**
   * Get statistics
   */
  getStatistics(): RateLimitStats {
    const rules = this.config.rules.map(rule => {
      const strategy = this.strategies.get(rule.id);
      const state = strategy?.getState();
      const usage = state ? rule.limit - state.remaining : 0;
      const percentage = (usage / rule.limit) * 100;
      
      return { rule, usage, percentage };
    });

    const hourlyDistribution = Array.from(this.stats.hourlyRequests.entries())
      .map(([hour, stats]) => ({ hour, ...stats }))
      .sort((a, b) => a.hour - b.hour);

    return {
      totalRequests: this.stats.totalRequests,
      allowedRequests: this.stats.allowedRequests,
      deniedRequests: this.stats.deniedRequests,
      warningCount: this.stats.warningCount,
      currentStatus: this.currentState?.status || RateLimitStatus.Allowed,
      rules,
      hourlyDistribution
    };
  }

  /**
   * Update global state (for external rate limit updates)
   */
  updateGlobalState(state: RateLimitState): void {
    this.currentState = state;
    this.emit('status:changed', state);
  }

  /**
   * Initialize strategies for all rules
   */
  private initializeStrategies(): void {
    for (const rule of this.config.rules) {
      const strategy = this.createStrategy(rule);
      this.strategies.set(rule.id, strategy);
    }
  }

  /**
   * Create strategy based on rule configuration
   */
  private createStrategy(rule: RateLimitRule, strategy?: RateLimitStrategy): RateLimitStrategyBase {
    // Default to fixed window
    const strategyType = strategy || RateLimitStrategy.FixedWindow;
    
    switch (strategyType) {
      case RateLimitStrategy.SlidingWindow:
        return new SlidingWindowStrategy(rule);
      
      case RateLimitStrategy.TokenBucket:
        return new TokenBucketStrategy(rule);
      
      case RateLimitStrategy.FixedWindow:
      default:
        return new FixedWindowStrategy(rule);
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.strategies.clear();
    this.removeAllListeners();
  }
}
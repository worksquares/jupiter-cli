/**
 * Global Rate Limit Manager
 * Manages rate limits across different API providers and services
 */

import { EventEmitter } from 'eventemitter3';
import { Logger } from '../utils/logger';
import { RateLimiter } from './rate-limiter';
import {
  RateLimitConfig,
  RateLimitRule,
  RateLimitState,
  RateLimitCheckResult,
  RateLimitWindow,
  RateLimitStatus,
  RateLimitMetadata
} from './types';

/**
 * Provider-specific rate limit configuration
 */
interface ProviderRateLimitConfig {
  provider: string;
  rules: RateLimitRule[];
  customLimiter?: RateLimiter;
}

/**
 * Global rate limit events
 */
interface GlobalRateLimitEvents {
  'provider:limited': (provider: string, state: RateLimitState) => void;
  'provider:warning': (provider: string, state: RateLimitState) => void;
  'global:status-changed': (status: RateLimitStatus) => void;
  'fallback:available': (available: boolean) => void;
}

/**
 * Default rate limit configurations for common providers
 */
const DEFAULT_PROVIDER_CONFIGS: Record<string, RateLimitRule[]> = {
  cosmos: [
    {
      id: 'cosmos-requests-per-minute',
      name: 'Cosmos API Requests/Min',
      limit: 60,
      window: RateLimitWindow.Minute
    },
    {
      id: 'cosmos-tokens-per-hour',
      name: 'Cosmos API Tokens/Hour',
      limit: 100000,
      window: RateLimitWindow.Hour
    }
  ],
  openai: [
    {
      id: 'openai-requests-per-minute',
      name: 'OpenAI API Requests/Min',
      limit: 60,
      window: RateLimitWindow.Minute
    },
    {
      id: 'openai-tokens-per-minute',
      name: 'OpenAI API Tokens/Min',
      limit: 90000,
      window: RateLimitWindow.Minute
    }
  ],
  anthropic: [
    {
      id: 'anthropic-requests-per-minute',
      name: 'Anthropic API Requests/Min',
      limit: 50,
      window: RateLimitWindow.Minute
    }
  ]
};

/**
 * Global rate limit manager implementation
 */
export class GlobalRateLimitManager extends EventEmitter<GlobalRateLimitEvents> {
  private limiters: Map<string, RateLimiter> = new Map();
  private globalState: RateLimitState;
  private logger: Logger;
  private fallbackAvailable: boolean = false;
  private statusListeners: Set<(state: RateLimitState) => void> = new Set();

  constructor() {
    super();
    this.logger = new Logger('GlobalRateLimitManager');
    
    // Initialize global state
    this.globalState = {
      status: RateLimitStatus.Allowed,
      remaining: 999999,
      limit: 999999,
      resetsAt: new Date(Date.now() + 3600000),
      unifiedRateLimitFallbackAvailable: false
    };
  }

  /**
   * Initialize with provider configurations
   */
  initialize(configs?: ProviderRateLimitConfig[]): void {
    // Add default configurations
    for (const [provider, rules] of Object.entries(DEFAULT_PROVIDER_CONFIGS)) {
      this.addProvider(provider, rules);
    }

    // Add custom configurations
    if (configs) {
      for (const config of configs) {
        if (config.customLimiter) {
          this.limiters.set(config.provider, config.customLimiter);
        } else {
          this.addProvider(config.provider, config.rules);
        }
      }
    }

    this.logger.info(`Initialized with ${this.limiters.size} providers`);
  }

  /**
   * Add a provider with rate limit rules
   */
  addProvider(provider: string, rules: RateLimitRule[]): void {
    const config: RateLimitConfig = {
      rules,
      warningThreshold: 80,
      enableBurst: true,
      enablePenalty: false
    };

    const limiter = new RateLimiter(config);
    
    // Setup event handlers
    limiter.on('limit:warning', (rule, state) => {
      this.emit('provider:warning', provider, state);
      this.updateGlobalState();
    });

    limiter.on('limit:exceeded', (rule, state) => {
      this.emit('provider:limited', provider, state);
      this.updateGlobalState();
    });

    limiter.on('status:changed', (state) => {
      this.updateGlobalState();
    });

    this.limiters.set(provider, limiter);
    this.logger.info(`Added rate limiter for provider: ${provider}`);
  }

  /**
   * Remove a provider
   */
  removeProvider(provider: string): void {
    const limiter = this.limiters.get(provider);
    if (limiter) {
      limiter.dispose();
      this.limiters.delete(provider);
      this.updateGlobalState();
    }
  }

  /**
   * Check rate limit for a provider
   */
  async checkProvider(
    provider: string,
    metadata?: RateLimitMetadata
  ): Promise<RateLimitCheckResult> {
    const limiter = this.limiters.get(provider);
    if (!limiter) {
      // No rate limit configured for provider
      return {
        allowed: true,
        state: this.globalState,
        reason: 'No rate limit configured'
      };
    }

    const result = await limiter.check(metadata);
    
    // Update global state after check
    this.updateGlobalState();
    
    return result;
  }

  /**
   * Increment rate limit for a provider
   */
  async incrementProvider(
    provider: string,
    weight: number = 1,
    metadata?: RateLimitMetadata
  ): Promise<void> {
    const limiter = this.limiters.get(provider);
    if (limiter) {
      await limiter.increment(weight, metadata);
      this.updateGlobalState();
    }
  }

  /**
   * Check and increment in one operation
   */
  async checkAndIncrement(
    provider: string,
    weight: number = 1,
    metadata?: RateLimitMetadata
  ): Promise<RateLimitCheckResult> {
    const result = await this.checkProvider(provider, metadata);
    
    if (result.allowed) {
      await this.incrementProvider(provider, weight, metadata);
    }
    
    return result;
  }

  /**
   * Get current state for all providers
   */
  getAllStates(): Map<string, Map<string, RateLimitState>> {
    const allStates = new Map<string, Map<string, RateLimitState>>();
    
    for (const [provider, limiter] of this.limiters) {
      allStates.set(provider, limiter.getState());
    }
    
    return allStates;
  }

  /**
   * Get global state
   */
  getGlobalState(): RateLimitState {
    return { ...this.globalState };
  }

  /**
   * Update global state from external source
   */
  updateExternalState(state: Partial<RateLimitState>): void {
    this.globalState = {
      ...this.globalState,
      ...state
    };

    if (state.unifiedRateLimitFallbackAvailable !== undefined) {
      this.fallbackAvailable = state.unifiedRateLimitFallbackAvailable;
      this.emit('fallback:available', this.fallbackAvailable);
    }

    this.emit('global:status-changed', this.globalState.status);
    
    // Notify all listeners
    for (const listener of this.statusListeners) {
      listener(this.globalState);
    }
  }

  /**
   * Subscribe to status changes
   */
  subscribeToStatusChanges(callback: (state: RateLimitState) => void): () => void {
    this.statusListeners.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  /**
   * Reset rate limits for a provider or all providers
   */
  reset(provider?: string): void {
    if (provider) {
      const limiter = this.limiters.get(provider);
      if (limiter) {
        limiter.reset();
      }
    } else {
      // Reset all
      for (const limiter of this.limiters.values()) {
        limiter.reset();
      }
    }
    
    this.updateGlobalState();
  }

  /**
   * Get statistics for a provider or all providers
   */
  getStatistics(provider?: string): any {
    if (provider) {
      const limiter = this.limiters.get(provider);
      return limiter ? limiter.getStatistics() : null;
    }

    // Get all statistics
    const stats: Record<string, any> = {};
    for (const [name, limiter] of this.limiters) {
      stats[name] = limiter.getStatistics();
    }
    
    return stats;
  }

  /**
   * Check if fallback is available
   */
  isFallbackAvailable(): boolean {
    return this.fallbackAvailable;
  }

  /**
   * Get recommended provider based on rate limits
   */
  getRecommendedProvider(excludeProviders?: string[]): string | null {
    let bestProvider: string | null = null;
    let bestScore = -1;

    for (const [provider, limiter] of this.limiters) {
      if (excludeProviders?.includes(provider)) {
        continue;
      }

      const states = limiter.getState();
      let providerScore = 0;

      // Calculate score based on remaining capacity
      for (const state of states.values()) {
        if (state.status === RateLimitStatus.Exceeded) {
          providerScore = -1;
          break;
        }

        const capacityRatio = state.remaining / state.limit;
        providerScore += capacityRatio;
      }

      if (providerScore > bestScore) {
        bestScore = providerScore;
        bestProvider = provider;
      }
    }

    return bestProvider;
  }

  /**
   * Update global state based on all provider states
   */
  private updateGlobalState(): void {
    let worstStatus = RateLimitStatus.Allowed;
    let minRemaining = Number.MAX_SAFE_INTEGER;
    let minLimit = Number.MAX_SAFE_INTEGER;
    let earliestReset = new Date(Date.now() + 3600000);

    // Aggregate all provider states
    for (const limiter of this.limiters.values()) {
      const states = limiter.getState();
      
      for (const state of states.values()) {
        // Find worst status
        if (this.getStatusPriority(state.status) > this.getStatusPriority(worstStatus)) {
          worstStatus = state.status;
        }

        // Find minimum remaining
        if (state.remaining < minRemaining) {
          minRemaining = state.remaining;
          minLimit = state.limit;
        }

        // Find earliest reset
        if (state.resetsAt < earliestReset) {
          earliestReset = state.resetsAt;
        }
      }
    }

    const previousStatus = this.globalState.status;
    
    this.globalState = {
      status: worstStatus,
      remaining: minRemaining,
      limit: minLimit,
      resetsAt: earliestReset,
      unifiedRateLimitFallbackAvailable: this.fallbackAvailable
    };

    if (previousStatus !== worstStatus) {
      this.emit('global:status-changed', worstStatus);
    }

    // Notify listeners
    for (const listener of this.statusListeners) {
      listener(this.globalState);
    }
  }

  /**
   * Get numeric priority for status (higher = worse)
   */
  private getStatusPriority(status: RateLimitStatus): number {
    switch (status) {
      case RateLimitStatus.Allowed:
        return 0;
      case RateLimitStatus.Limited:
        return 1;
      case RateLimitStatus.Warning:
        return 2;
      case RateLimitStatus.Exceeded:
        return 3;
      default:
        return 0;
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    for (const limiter of this.limiters.values()) {
      limiter.dispose();
    }
    
    this.limiters.clear();
    this.statusListeners.clear();
    this.removeAllListeners();
  }
}

// Create singleton instance
export const globalRateLimitManager = new GlobalRateLimitManager();
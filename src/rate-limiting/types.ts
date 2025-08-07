/**
 * Rate Limiting Types
 * Types and interfaces for API rate limiting management
 */

/**
 * Rate limit status
 */
export enum RateLimitStatus {
  Allowed = 'allowed',
  Limited = 'limited',
  Exceeded = 'exceeded',
  Warning = 'warning'
}

/**
 * Rate limit window type
 */
export enum RateLimitWindow {
  Second = 'second',
  Minute = 'minute',
  Hour = 'hour',
  Day = 'day',
  Custom = 'custom'
}

/**
 * Rate limit rule
 */
export interface RateLimitRule {
  id: string;
  name: string;
  limit: number;
  window: RateLimitWindow;
  windowDuration?: number; // For custom windows (in milliseconds)
  burst?: number; // Allow burst capacity
  penaltyDuration?: number; // How long to block after exceeding
}

/**
 * Rate limit state
 */
export interface RateLimitState {
  status: RateLimitStatus;
  remaining: number;
  limit: number;
  resetsAt: Date;
  retryAfter?: number; // Seconds until retry allowed
  unifiedRateLimitFallbackAvailable?: boolean;
}

/**
 * Rate limit tracking entry
 */
export interface RateLimitEntry {
  ruleId: string;
  count: number;
  windowStart: Date;
  windowEnd: Date;
  lastRequest: Date;
  blocked?: boolean;
  blockedUntil?: Date;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  rules: RateLimitRule[];
  storage?: 'memory' | 'redis' | 'file';
  storageOptions?: any;
  warningThreshold?: number; // Percentage (0-100)
  enableBurst?: boolean;
  enablePenalty?: boolean;
  globalFallback?: boolean;
}

/**
 * Rate limit events
 */
export interface RateLimitEvents {
  'limit:warning': (rule: RateLimitRule, state: RateLimitState) => void;
  'limit:exceeded': (rule: RateLimitRule, state: RateLimitState) => void;
  'limit:reset': (rule: RateLimitRule) => void;
  'limit:blocked': (rule: RateLimitRule, duration: number) => void;
  'limit:unblocked': (rule: RateLimitRule) => void;
  'status:changed': (state: RateLimitState) => void;
}

/**
 * Rate limit check result
 */
export interface RateLimitCheckResult {
  allowed: boolean;
  state: RateLimitState;
  rule?: RateLimitRule;
  waitTime?: number; // Milliseconds to wait before retry
  reason?: string;
}

/**
 * Rate limit statistics
 */
export interface RateLimitStats {
  totalRequests: number;
  allowedRequests: number;
  deniedRequests: number;
  warningCount: number;
  currentStatus: RateLimitStatus;
  rules: Array<{
    rule: RateLimitRule;
    usage: number;
    percentage: number;
  }>;
  hourlyDistribution: Array<{
    hour: number;
    requests: number;
    denied: number;
  }>;
}

/**
 * Token bucket algorithm state
 */
export interface TokenBucket {
  capacity: number;
  tokens: number;
  refillRate: number;
  lastRefill: Date;
}

/**
 * Sliding window log entry
 */
export interface SlidingWindowEntry {
  timestamp: Date;
  weight?: number;
  metadata?: any;
}

/**
 * Rate limit strategy
 */
export enum RateLimitStrategy {
  FixedWindow = 'fixed-window',
  SlidingWindow = 'sliding-window',
  TokenBucket = 'token-bucket',
  LeakyBucket = 'leaky-bucket'
}

/**
 * Rate limit metadata
 */
export interface RateLimitMetadata {
  apiProvider?: string;
  endpoint?: string;
  userId?: string;
  ipAddress?: string;
  requestId?: string;
  tags?: string[];
}
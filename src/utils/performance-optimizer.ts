/**
 * Performance Optimizer - Manages performance optimizations
 */

import { LRUCache } from 'lru-cache';
import PQueue from 'p-queue';
import { PerformanceConfig } from '../core/types';
import { Logger } from './logger';

export interface PerformanceMetrics {
  avgResponseTime: number;
  throughput: number;
  errorRate: number;
  cacheHitRate: number;
  queueLength: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
}

export interface Optimization {
  name: string;
  description: string;
  apply: () => Promise<void>;
  revert?: () => Promise<void>;
  impact: number;
}

export class PerformanceOptimizer {
  private config: PerformanceConfig;
  private logger: Logger;
  private cache: LRUCache<string, any>;
  private queue: PQueue;
  private metrics: Map<string, number[]>;
  private optimizations: Map<string, Optimization>;
  private appliedOptimizations: Set<string>;

  constructor(config: PerformanceConfig) {
    this.config = config;
    this.logger = new Logger('PerformanceOptimizer');
    
    // Initialize cache
    this.cache = new LRUCache({
      max: config.cacheSize || 1000,
      ttl: 1000 * 60 * 60 // 1 hour
    });

    // Initialize queue
    this.queue = new PQueue({
      concurrency: config.maxConcurrentTasks || 5,
      timeout: config.taskTimeout || 30000
    });

    this.metrics = new Map();
    this.optimizations = new Map();
    this.appliedOptimizations = new Set();

    this.registerDefaultOptimizations();
  }

  async initialize(): Promise<void> {
    this.logger.info('PerformanceOptimizer initialized');
    
    // Start metrics collection
    this.startMetricsCollection();
  }

  /**
   * Execute with timeout
   */
  async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Operation timed out')), timeout)
      )
    ]);
  }

  /**
   * Execute with caching
   */
  async executeWithCache<T>(
    key: string,
    operation: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Check cache
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this.recordMetric('cache_hit', 1);
      return cached as T;
    }

    this.recordMetric('cache_miss', 1);

    // Execute operation
    const result = await operation();

    // Cache result
    this.cache.set(key, result, { ttl });

    return result;
  }

  /**
   * Batch operations
   */
  async batchOperations<T, R>(
    items: T[],
    operation: (batch: T[]) => Promise<R[]>,
    batchSize?: number
  ): Promise<R[]> {
    const size = batchSize || this.config.batchSize || 10;
    const results: R[] = [];

    for (let i = 0; i < items.length; i += size) {
      const batch = items.slice(i, i + size);
      const batchResults = await operation(batch);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Queue operation
   */
  async queueOperation<T>(
    operation: () => Promise<T>,
    priority?: number
  ): Promise<T> {
    return await this.queue.add(operation, { priority }) as T;
  }

  /**
   * Analyze performance
   */
  async analyze(): Promise<PerformanceMetrics> {
    const metrics: PerformanceMetrics = {
      avgResponseTime: this.calculateAverage('response_time'),
      throughput: this.calculateThroughput(),
      errorRate: this.calculateErrorRate(),
      cacheHitRate: this.calculateCacheHitRate(),
      queueLength: this.queue.size,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };

    this.logger.debug('Performance metrics', metrics);
    return metrics;
  }

  /**
   * Optimize based on metrics
   */
  async optimize(metrics: PerformanceMetrics): Promise<Optimization[]> {
    const recommendations: Optimization[] = [];

    // Check if cache size should be increased
    if (metrics.cacheHitRate < 0.7 && !this.appliedOptimizations.has('increase_cache')) {
      recommendations.push(this.optimizations.get('increase_cache')!);
    }

    // Check if concurrency should be adjusted
    if (metrics.queueLength > 10 && !this.appliedOptimizations.has('increase_concurrency')) {
      recommendations.push(this.optimizations.get('increase_concurrency')!);
    }

    // Check if memory usage is high
    const memoryUsagePercent = metrics.memoryUsage.heapUsed / metrics.memoryUsage.heapTotal;
    if (memoryUsagePercent > 0.8 && !this.appliedOptimizations.has('optimize_memory')) {
      recommendations.push(this.optimizations.get('optimize_memory')!);
    }

    // Sort by impact
    recommendations.sort((a, b) => b.impact - a.impact);

    return recommendations;
  }

  /**
   * Apply optimization
   */
  async applyOptimization(optimization: Optimization): Promise<void> {
    this.logger.info(`Applying optimization: ${optimization.name}`);
    
    try {
      await optimization.apply();
      this.appliedOptimizations.add(optimization.name);
      this.logger.info(`Optimization applied: ${optimization.name}`);
    } catch (error) {
      this.logger.error(`Failed to apply optimization: ${optimization.name}`, error);
      throw error;
    }
  }

  /**
   * Prefetch data
   */
  async prefetch<T>(
    keys: string[],
    fetcher: (key: string) => Promise<T>
  ): Promise<void> {
    if (!this.config.prefetchEnabled) return;

    const promises = keys.map(key => 
      this.executeWithCache(key, () => fetcher(key))
    );

    await Promise.allSettled(promises);
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics(): {
    size: number;
    hitRate: number;
    keys: string[];
  } {
    return {
      size: this.cache.size,
      hitRate: this.calculateCacheHitRate(),
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * Clear cache
   */
  clearCache(pattern?: string): void {
    if (pattern) {
      const keys = Array.from(this.cache.keys());
      for (const key of keys) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  /**
   * Private helper methods
   */
  private registerDefaultOptimizations(): void {
    // Increase cache size
    this.optimizations.set('increase_cache', {
      name: 'increase_cache',
      description: 'Increase cache size to improve hit rate',
      apply: async () => {
        const newSize = this.cache.max * 2;
        // this.cache.max = newSize;
        this.config.cacheSize = newSize;
      },
      revert: async () => {
        const originalSize = this.cache.max / 2;
        // this.cache.max = originalSize;
        this.config.cacheSize = originalSize;
      },
      impact: 0.7
    });

    // Increase concurrency
    this.optimizations.set('increase_concurrency', {
      name: 'increase_concurrency',
      description: 'Increase concurrent task limit',
      apply: async () => {
        const newConcurrency = this.queue.concurrency * 1.5;
        this.queue.concurrency = Math.floor(newConcurrency);
        this.config.maxConcurrentTasks = Math.floor(newConcurrency);
      },
      revert: async () => {
        const originalConcurrency = this.queue.concurrency / 1.5;
        this.queue.concurrency = Math.floor(originalConcurrency);
        this.config.maxConcurrentTasks = Math.floor(originalConcurrency);
      },
      impact: 0.6
    });

    // Optimize memory
    this.optimizations.set('optimize_memory', {
      name: 'optimize_memory',
      description: 'Optimize memory usage',
      apply: async () => {
        // Clear old cache entries
        this.cache.purgeStale();
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      },
      impact: 0.8
    });

    // Enable batching
    this.optimizations.set('enable_batching', {
      name: 'enable_batching',
      description: 'Enable request batching',
      apply: async () => {
        this.config.batchSize = 20;
      },
      revert: async () => {
        this.config.batchSize = 10;
      },
      impact: 0.5
    });
  }

  private startMetricsCollection(): void {
    // Collect metrics every minute
    setInterval(() => {
      this.collectSystemMetrics();
    }, 60000);
  }

  private collectSystemMetrics(): void {
    const usage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    this.recordMetric('memory_heap_used', usage.heapUsed);
    this.recordMetric('memory_heap_total', usage.heapTotal);
    this.recordMetric('cpu_user', cpuUsage.user);
    this.recordMetric('cpu_system', cpuUsage.system);
  }

  private recordMetric(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const values = this.metrics.get(name)!;
    values.push(value);

    // Keep only last 100 values
    if (values.length > 100) {
      values.shift();
    }
  }

  private calculateAverage(metric: string): number {
    const values = this.metrics.get(metric);
    if (!values || values.length === 0) return 0;

    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }

  private calculateThroughput(): number {
    const completed = this.metrics.get('task_completed') || [];
    const timeWindow = 60000; // 1 minute
    const recent = completed.filter(time => Date.now() - time < timeWindow);
    return recent.length;
  }

  private calculateErrorRate(): number {
    const total = (this.metrics.get('task_completed')?.length || 0) + 
                  (this.metrics.get('task_failed')?.length || 0);
    
    if (total === 0) return 0;
    
    const errors = this.metrics.get('task_failed')?.length || 0;
    return errors / total;
  }

  private calculateCacheHitRate(): number {
    const hits = this.metrics.get('cache_hit')?.length || 0;
    const misses = this.metrics.get('cache_miss')?.length || 0;
    const total = hits + misses;
    
    if (total === 0) return 0;
    
    return hits / total;
  }

  /**
   * Record task completion
   */
  recordTaskCompletion(duration: number, success: boolean): void {
    this.recordMetric('response_time', duration);
    this.recordMetric(success ? 'task_completed' : 'task_failed', Date.now());
  }

  /**
   * Get queue statistics
   */
  getQueueStatistics(): {
    size: number;
    pending: number;
    concurrency: number;
  } {
    return {
      size: this.queue.size,
      pending: this.queue.pending,
      concurrency: this.queue.concurrency
    };
  }
}
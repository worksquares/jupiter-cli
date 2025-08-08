/**
 * Cleanup Scheduler
 * Centralized scheduler for all cleanup jobs with monitoring and coordination
 */

import { Logger } from '../utils/logger';
import { JupiterDBClient } from '../database/jupiter-db-client';
import { MemoryCleanupJob, CleanupConfig as MemoryConfig } from './memory-cleanup-job';
import { SessionCleanupJob, SessionCleanupConfig } from './session-cleanup-job';
import { DatabaseCleanupJob, DatabaseCleanupConfig } from './database-cleanup-job';
import { EventEmitter } from 'events';

export interface CleanupSchedulerConfig {
  enabled: boolean;
  
  // Job-specific configs
  memory?: Partial<MemoryConfig>;
  session?: Partial<SessionCleanupConfig>;
  database?: Partial<DatabaseCleanupConfig>;
  
  // Scheduling
  schedule: {
    memory: string | number; // cron expression or interval in ms
    session: string | number;
    database: string | number;
  };
  
  // Monitoring
  monitoring: {
    enabled: boolean;
    alertThreshold: number; // Alert if cleanup takes longer than this (ms)
    metricsInterval: number; // How often to collect metrics (ms)
  };
  
  // Coordination
  coordination: {
    maxConcurrent: number; // Max concurrent cleanup jobs
    priorityOrder: ('memory' | 'session' | 'database')[];
    preventOverlap: boolean; // Prevent same job type from overlapping
  };
}

interface JobStatus {
  name: string;
  status: 'idle' | 'running' | 'failed';
  lastRun?: Date;
  nextRun?: Date;
  lastDuration?: number;
  lastError?: string;
  runCount: number;
  successCount: number;
  failureCount: number;
}

export class CleanupScheduler extends EventEmitter {
  private logger: Logger;
  private jobs: Map<string, any> = new Map();
  private jobStatus: Map<string, JobStatus> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private runningJobs: Set<string> = new Set();
  private metricsInterval: NodeJS.Timeout | null = null;
  
  private defaultConfig: CleanupSchedulerConfig = {
    enabled: true,
    schedule: {
      memory: 3600000, // 1 hour
      session: 900000, // 15 minutes
      database: 7200000 // 2 hours
    },
    monitoring: {
      enabled: true,
      alertThreshold: 300000, // 5 minutes
      metricsInterval: 60000 // 1 minute
    },
    coordination: {
      maxConcurrent: 2,
      priorityOrder: ['session', 'memory', 'database'],
      preventOverlap: true
    }
  };

  constructor(
    private dbClient: JupiterDBClient,
    private config: Partial<CleanupSchedulerConfig> = {}
  ) {
    super();
    this.logger = new Logger('CleanupScheduler');
    this.config = { ...this.defaultConfig, ...config };
    
    // Initialize job status
    this.initializeJobStatus();
    
    // Set up event handlers
    this.setupEventHandlers();
  }

  /**
   * Initialize job status tracking
   */
  private initializeJobStatus(): void {
    const jobNames = ['memory', 'session', 'database'];
    
    for (const name of jobNames) {
      this.jobStatus.set(name, {
        name,
        status: 'idle',
        runCount: 0,
        successCount: 0,
        failureCount: 0
      });
    }
  }

  /**
   * Set up event handlers for monitoring
   */
  private setupEventHandlers(): void {
    this.on('job:start', (jobName: string) => {
      this.logger.info(`Cleanup job started: ${jobName}`);
    });

    this.on('job:complete', (jobName: string, duration: number) => {
      this.logger.info(`Cleanup job completed: ${jobName}`, { duration });
    });

    this.on('job:error', (jobName: string, error: Error) => {
      this.logger.error(`Cleanup job failed: ${jobName}`, error);
    });

    this.on('alert', (message: string, details: any) => {
      this.logger.warn(`Cleanup alert: ${message}`, details);
    });
  }

  /**
   * Start the cleanup scheduler
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info('Cleanup scheduler is disabled');
      return;
    }

    this.logger.info('Starting cleanup scheduler', {
      schedule: this.config.schedule,
      coordination: this.config.coordination
    });

    // Initialize cleanup jobs
    await this.initializeJobs();

    // Schedule jobs
    this.scheduleJobs();

    // Start monitoring if enabled
    if (this.config.monitoring?.enabled) {
      this.startMonitoring();
    }

    this.logger.info('Cleanup scheduler started successfully');
  }

  /**
   * Stop the cleanup scheduler
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping cleanup scheduler');

    // Clear all intervals
    for (const [name, interval] of this.intervals) {
      clearInterval(interval);
      this.logger.debug(`Cleared interval for ${name}`);
    }
    this.intervals.clear();

    // Stop monitoring
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    // Stop all jobs
    for (const [name, job] of this.jobs) {
      if (job.stop) {
        job.stop();
        this.logger.debug(`Stopped job ${name}`);
      }
    }

    this.logger.info('Cleanup scheduler stopped');
  }

  /**
   * Initialize cleanup jobs
   */
  private async initializeJobs(): Promise<void> {
    // Initialize Memory Cleanup Job
    const memoryJob = new MemoryCleanupJob(this.dbClient, this.config.memory);
    this.jobs.set('memory', memoryJob);

    // Initialize Session Cleanup Job
    const sessionJob = new SessionCleanupJob(this.dbClient, this.config.session);
    this.jobs.set('session', sessionJob);

    // Initialize Database Cleanup Job
    const databaseJob = new DatabaseCleanupJob(this.dbClient, this.config.database);
    this.jobs.set('database', databaseJob);

    this.logger.info('Initialized all cleanup jobs');
  }

  /**
   * Schedule jobs based on configuration
   */
  private scheduleJobs(): void {
    const schedule = this.config.schedule || this.defaultConfig.schedule;

    // Schedule Memory Cleanup
    if (schedule.memory) {
      this.scheduleJob('memory', schedule.memory);
    }

    // Schedule Session Cleanup
    if (schedule.session) {
      this.scheduleJob('session', schedule.session);
    }

    // Schedule Database Cleanup
    if (schedule.database) {
      this.scheduleJob('database', schedule.database);
    }
  }

  /**
   * Schedule a specific job
   */
  private scheduleJob(jobName: string, schedule: string | number): void {
    if (typeof schedule === 'number') {
      // Simple interval scheduling
      const interval = setInterval(async () => {
        await this.runJob(jobName);
      }, schedule);
      
      this.intervals.set(jobName, interval);
      
      // Calculate next run time
      const status = this.jobStatus.get(jobName);
      if (status) {
        status.nextRun = new Date(Date.now() + schedule);
      }
      
      this.logger.info(`Scheduled ${jobName} job with interval ${schedule}ms`);
    } else {
      // Cron expression (would need a cron library)
      this.logger.warn(`Cron scheduling not yet implemented for ${jobName}`);
    }
  }

  /**
   * Run a specific cleanup job
   */
  async runJob(jobName: string): Promise<void> {
    const job = this.jobs.get(jobName);
    const status = this.jobStatus.get(jobName);
    
    if (!job || !status) {
      this.logger.error(`Job ${jobName} not found`);
      return;
    }

    // Check if job is already running (prevent overlap if configured)
    if (this.config.coordination?.preventOverlap && this.runningJobs.has(jobName)) {
      this.logger.warn(`Job ${jobName} is already running, skipping`);
      return;
    }

    // Check concurrent job limit
    if (this.runningJobs.size >= (this.config.coordination?.maxConcurrent || 2)) {
      this.logger.warn(`Max concurrent jobs reached, deferring ${jobName}`);
      // Retry after a delay
      setTimeout(() => this.runJob(jobName), 60000);
      return;
    }

    // Update status
    status.status = 'running';
    status.lastRun = new Date();
    status.runCount++;
    this.runningJobs.add(jobName);

    // Emit start event
    this.emit('job:start', jobName);

    const startTime = Date.now();

    try {
      // Run the job
      await job.run();

      // Update success status
      const duration = Date.now() - startTime;
      status.status = 'idle';
      status.lastDuration = duration;
      status.successCount++;
      delete status.lastError;

      // Check for alerts
      if (this.config.monitoring?.alertThreshold && 
          duration > this.config.monitoring.alertThreshold) {
        this.emit('alert', 'Job took longer than expected', {
          jobName,
          duration,
          threshold: this.config.monitoring.alertThreshold
        });
      }

      // Emit complete event
      this.emit('job:complete', jobName, duration);

    } catch (error) {
      // Update error status
      status.status = 'failed';
      status.failureCount++;
      status.lastError = error instanceof Error ? error.message : 'Unknown error';

      // Emit error event
      this.emit('job:error', jobName, error as Error);

    } finally {
      this.runningJobs.delete(jobName);
      
      // Calculate next run time
      const schedule = this.config.schedule?.[jobName as keyof typeof this.config.schedule];
      if (typeof schedule === 'number') {
        status.nextRun = new Date(Date.now() + schedule);
      }
    }
  }

  /**
   * Run all jobs in priority order
   */
  async runAll(): Promise<void> {
    this.logger.info('Running all cleanup jobs');

    const priorityOrder = this.config.coordination?.priorityOrder || 
                         this.defaultConfig.coordination.priorityOrder;

    for (const jobName of priorityOrder) {
      await this.runJob(jobName);
      
      // Small delay between jobs
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Start monitoring
   */
  private startMonitoring(): void {
    const interval = this.config.monitoring?.metricsInterval || 60000;

    this.metricsInterval = setInterval(async () => {
      await this.collectMetrics();
    }, interval);

    this.logger.info(`Started monitoring with interval ${interval}ms`);
  }

  /**
   * Collect and log metrics
   */
  private async collectMetrics(): Promise<void> {
    try {
      // Get database statistics
      const dbStats = await this.getDatabaseStatistics();

      // Get job statistics
      const jobStats = this.getJobStatistics();

      // Log metrics
      this.logger.info('Cleanup metrics', {
        database: dbStats,
        jobs: jobStats,
        running: Array.from(this.runningJobs)
      });

      // Check for issues
      this.checkForIssues(dbStats, jobStats);

    } catch (error) {
      this.logger.error('Failed to collect metrics', error);
    }
  }

  /**
   * Get database statistics
   */
  private async getDatabaseStatistics(): Promise<any> {
    try {
      const stats = await this.dbClient.query(`
        SELECT 
          (SELECT COUNT(*) FROM unified_memory) as memory_count,
          (SELECT COUNT(*) FROM conversation_sessions WHERE status = 'active') as active_sessions,
          (SELECT COUNT(*) FROM websocket_connections WHERE disconnected_at IS NULL) as active_connections,
          (SELECT SUM(DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024 
           FROM information_schema.TABLES 
           WHERE TABLE_SCHEMA = DATABASE()) as total_size_mb,
          (SELECT SUM(DATA_FREE) / 1024 / 1024 
           FROM information_schema.TABLES 
           WHERE TABLE_SCHEMA = DATABASE()) as free_space_mb
      `);

      return stats[0];
    } catch (error) {
      this.logger.error('Failed to get database statistics', error);
      return {};
    }
  }

  /**
   * Get job statistics
   */
  getJobStatistics(): any {
    const stats: any = {};

    for (const [name, status] of this.jobStatus) {
      stats[name] = {
        status: status.status,
        lastRun: status.lastRun,
        nextRun: status.nextRun,
        runCount: status.runCount,
        successRate: status.runCount > 0 ? 
          (status.successCount / status.runCount * 100).toFixed(2) + '%' : 'N/A',
        avgDuration: status.lastDuration,
        lastError: status.lastError
      };
    }

    return stats;
  }

  /**
   * Check for issues and emit alerts
   */
  private checkForIssues(dbStats: any, jobStats: any): void {
    // Check for high memory usage
    if (dbStats.memory_count > 100000) {
      this.emit('alert', 'High memory count detected', {
        count: dbStats.memory_count,
        threshold: 100000
      });
    }

    // Check for too many active sessions
    if (dbStats.active_sessions > 1000) {
      this.emit('alert', 'Too many active sessions', {
        count: dbStats.active_sessions,
        threshold: 1000
      });
    }

    // Check for job failures
    for (const [name, status] of this.jobStatus) {
      if (status.failureCount > 3) {
        this.emit('alert', `Job ${name} has failed multiple times`, {
          failureCount: status.failureCount,
          lastError: status.lastError
        });
      }
    }

    // Check for low free space
    if (dbStats.free_space_mb && dbStats.total_size_mb) {
      const freePercentage = (dbStats.free_space_mb / dbStats.total_size_mb) * 100;
      if (freePercentage < 10) {
        this.emit('alert', 'Low database free space', {
          freeSpaceMB: dbStats.free_space_mb,
          totalSizeMB: dbStats.total_size_mb,
          percentage: freePercentage.toFixed(2) + '%'
        });
      }
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): any {
    return {
      enabled: this.config.enabled,
      running: this.intervals.size > 0,
      jobs: this.getJobStatistics(),
      runningJobs: Array.from(this.runningJobs),
      monitoring: {
        enabled: this.config.monitoring?.enabled,
        metricsInterval: this.config.monitoring?.metricsInterval
      },
      coordination: this.config.coordination
    };
  }

  /**
   * Manually trigger a specific job
   */
  async triggerJob(jobName: string): Promise<void> {
    this.logger.info(`Manually triggering job: ${jobName}`);
    await this.runJob(jobName);
  }

  /**
   * Update job configuration
   */
  updateJobConfig(jobName: string, config: any): void {
    const job = this.jobs.get(jobName);
    if (job && job.updateConfig) {
      job.updateConfig(config);
      this.logger.info(`Updated configuration for job ${jobName}`);
    }
  }

  /**
   * Pause a specific job
   */
  pauseJob(jobName: string): void {
    const interval = this.intervals.get(jobName);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(jobName);
      
      const status = this.jobStatus.get(jobName);
      if (status) {
        delete status.nextRun;
      }
      
      this.logger.info(`Paused job ${jobName}`);
    }
  }

  /**
   * Resume a specific job
   */
  resumeJob(jobName: string): void {
    const schedule = this.config.schedule?.[jobName as keyof typeof this.config.schedule];
    if (schedule) {
      this.scheduleJob(jobName, schedule);
      this.logger.info(`Resumed job ${jobName}`);
    }
  }
}

// Singleton instance
let scheduler: CleanupScheduler | null = null;

export function createCleanupScheduler(
  dbClient: JupiterDBClient,
  config?: Partial<CleanupSchedulerConfig>
): CleanupScheduler {
  if (!scheduler) {
    scheduler = new CleanupScheduler(dbClient, config);
  }
  return scheduler;
}

export function getCleanupScheduler(): CleanupScheduler {
  if (!scheduler) {
    throw new Error('Cleanup scheduler not initialized');
  }
  return scheduler;
}
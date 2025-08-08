/**
 * Memory Cleanup Job
 * Automated cleanup of old and low-importance memories to optimize performance
 */

import { Logger } from '../utils/logger';
import { JupiterDBClient } from '../database/jupiter-db-client';
import { v4 as uuidv4 } from 'uuid';

export interface CleanupConfig {
  // Retention settings
  retentionDays: number;
  importanceThreshold: number;
  maxMemoriesPerType: number;
  
  // Cleanup intervals (in ms)
  runInterval: number;
  batchSize: number;
  
  // Memory types to clean
  typesToClean: string[];
  
  // Archive settings
  archiveEnabled: boolean;
  archiveTableName?: string;
}

export interface CleanupStats {
  startedAt: Date;
  completedAt?: Date;
  memoriesScanned: number;
  memoriesDeleted: number;
  memoriesArchived: number;
  spaceFreed: number; // in bytes
  errors: string[];
}

export class MemoryCleanupJob {
  private logger: Logger;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private stats: CleanupStats | null = null;
  
  private defaultConfig: CleanupConfig = {
    retentionDays: 30,
    importanceThreshold: 0.3,
    maxMemoriesPerType: 10000,
    runInterval: 3600000, // 1 hour
    batchSize: 1000,
    typesToClean: ['working', 'episodic', 'semantic', 'procedural'],
    archiveEnabled: true,
    archiveTableName: 'archived_memories'
  };

  constructor(
    private dbClient: JupiterDBClient,
    private config: Partial<CleanupConfig> = {}
  ) {
    this.logger = new Logger('MemoryCleanupJob');
    this.config = { ...this.defaultConfig, ...config };
  }

  /**
   * Start the cleanup job
   */
  async start(): Promise<void> {
    if (this.intervalId) {
      this.logger.warn('Cleanup job is already running');
      return;
    }

    this.logger.info('Starting memory cleanup job', {
      config: this.config
    });

    // Run immediately
    await this.run();

    // Schedule periodic runs
    this.intervalId = setInterval(async () => {
      await this.run();
    }, this.config.runInterval || this.defaultConfig.runInterval);
  }

  /**
   * Stop the cleanup job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.info('Memory cleanup job stopped');
    }
  }

  /**
   * Run a single cleanup cycle
   */
  async run(): Promise<CleanupStats> {
    if (this.isRunning) {
      this.logger.warn('Cleanup already in progress, skipping');
      return this.stats!;
    }

    this.isRunning = true;
    this.stats = {
      startedAt: new Date(),
      memoriesScanned: 0,
      memoriesDeleted: 0,
      memoriesArchived: 0,
      spaceFreed: 0,
      errors: []
    };

    try {
      this.logger.info('Starting memory cleanup cycle');

      // 1. Clean old memories
      await this.cleanOldMemories();

      // 2. Clean low-importance memories
      await this.cleanLowImportanceMemories();

      // 3. Enforce type limits
      await this.enforceMemoryTypeLimits();

      // 4. Clean orphaned memories
      await this.cleanOrphanedMemories();

      // 5. Optimize tables
      await this.optimizeTables();

      // 6. Clean temporary data
      await this.cleanTemporaryData();

      this.stats.completedAt = new Date();
      
      this.logger.info('Memory cleanup completed', {
        duration: this.stats.completedAt.getTime() - this.stats.startedAt.getTime(),
        stats: this.stats
      });

      // Save cleanup stats
      await this.saveCleanupStats();

    } catch (error) {
      this.logger.error('Memory cleanup failed', error);
      this.stats.errors.push(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.isRunning = false;
    }

    return this.stats;
  }

  /**
   * Clean memories older than retention period
   */
  private async cleanOldMemories(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - (this.config.retentionDays || 30));

    try {
      // Archive old important memories if enabled
      if (this.config.archiveEnabled) {
        const importantMemories = await this.dbClient.query(
          `SELECT * FROM unified_memory 
           WHERE created_at < ? 
           AND importance >= ?
           LIMIT ?`,
          [cutoffDate, 0.7, this.config.batchSize]
        );

        if (importantMemories.length > 0) {
          await this.archiveMemories(importantMemories);
          this.stats!.memoriesArchived += importantMemories.length;
        }
      }

      // Delete old memories below importance threshold
      const result = await this.dbClient.execute(
        `DELETE FROM unified_memory 
         WHERE created_at < ? 
         AND importance < ?
         LIMIT ?`,
        [cutoffDate, this.config.importanceThreshold, this.config.batchSize]
      );

      this.stats!.memoriesDeleted += result.affectedRows;
      
      this.logger.debug(`Deleted ${result.affectedRows} old memories`);
    } catch (error) {
      this.logger.error('Failed to clean old memories', error);
      this.stats!.errors.push('Failed to clean old memories');
    }
  }

  /**
   * Clean memories with low importance scores
   */
  private async cleanLowImportanceMemories(): Promise<void> {
    try {
      // Get memory count by importance ranges
      const memoryCounts = await this.dbClient.query<any>(
        `SELECT 
          CASE 
            WHEN importance < 0.1 THEN 'very_low'
            WHEN importance < 0.3 THEN 'low'
            WHEN importance < 0.5 THEN 'medium'
            WHEN importance < 0.7 THEN 'high'
            ELSE 'very_high'
          END as importance_range,
          COUNT(*) as count
         FROM unified_memory
         GROUP BY importance_range`
      );

      // Delete very low importance memories
      const result = await this.dbClient.execute(
        `DELETE FROM unified_memory 
         WHERE importance < 0.1 
         AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
         LIMIT ?`,
        [this.config.batchSize]
      );

      this.stats!.memoriesDeleted += result.affectedRows;
      
      this.logger.debug(`Deleted ${result.affectedRows} low-importance memories`);
    } catch (error) {
      this.logger.error('Failed to clean low-importance memories', error);
      this.stats!.errors.push('Failed to clean low-importance memories');
    }
  }

  /**
   * Enforce maximum memory limits per type
   */
  private async enforceMemoryTypeLimits(): Promise<void> {
    const maxPerType = this.config.maxMemoriesPerType || 10000;

    for (const memoryType of this.config.typesToClean || []) {
      try {
        // Count memories of this type
        const [countResult] = await this.dbClient.query<any>(
          'SELECT COUNT(*) as count FROM unified_memory WHERE type = ?',
          [memoryType]
        );

        const count = countResult?.count || 0;

        if (count > maxPerType) {
          const toDelete = count - maxPerType;
          
          // Delete oldest and least important memories of this type
          const result = await this.dbClient.execute(
            `DELETE FROM unified_memory 
             WHERE type = ? 
             AND id IN (
               SELECT id FROM (
                 SELECT id FROM unified_memory 
                 WHERE type = ?
                 ORDER BY importance ASC, created_at ASC
                 LIMIT ?
               ) as tmp
             )`,
            [memoryType, memoryType, toDelete]
          );

          this.stats!.memoriesDeleted += result.affectedRows;
          
          this.logger.debug(`Enforced limit for ${memoryType}: deleted ${result.affectedRows} memories`);
        }
      } catch (error) {
        this.logger.error(`Failed to enforce limit for ${memoryType}`, error);
        this.stats!.errors.push(`Failed to enforce limit for ${memoryType}`);
      }
    }
  }

  /**
   * Clean orphaned memories (no associated agent or task)
   */
  private async cleanOrphanedMemories(): Promise<void> {
    try {
      // Delete memories with non-existent agent IDs
      const orphanedAgents = await this.dbClient.execute(
        `DELETE m FROM unified_memory m
         LEFT JOIN agents a ON m.agent_id = a.id
         WHERE m.agent_id IS NOT NULL 
         AND a.id IS NULL
         LIMIT ?`,
        [this.config.batchSize]
      );

      // Delete memories with non-existent task IDs
      const orphanedTasks = await this.dbClient.execute(
        `DELETE m FROM unified_memory m
         LEFT JOIN tasks t ON m.metadata->>'$.task_id' = t.id
         WHERE m.metadata->>'$.task_id' IS NOT NULL 
         AND t.id IS NULL
         LIMIT ?`,
        [this.config.batchSize]
      );

      const totalDeleted = orphanedAgents.affectedRows + orphanedTasks.affectedRows;
      this.stats!.memoriesDeleted += totalDeleted;
      
      this.logger.debug(`Deleted ${totalDeleted} orphaned memories`);
    } catch (error) {
      this.logger.error('Failed to clean orphaned memories', error);
      this.stats!.errors.push('Failed to clean orphaned memories');
    }
  }

  /**
   * Archive memories to archive table
   */
  private async archiveMemories(memories: any[]): Promise<void> {
    const archiveTable = this.config.archiveTableName || 'archived_memories';

    try {
      // Create archive table if it doesn't exist
      await this.dbClient.execute(`
        CREATE TABLE IF NOT EXISTS ${archiveTable} (
          id VARCHAR(36) PRIMARY KEY,
          type VARCHAR(50),
          content TEXT,
          embedding JSON,
          metadata JSON,
          importance FLOAT,
          access_count INT DEFAULT 0,
          last_accessed TIMESTAMP NULL,
          created_at TIMESTAMP,
          archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_archived_type (type),
          INDEX idx_archived_importance (importance),
          INDEX idx_archived_date (archived_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Batch insert into archive
      const values = memories.map(m => [
        m.id,
        m.type,
        m.content,
        JSON.stringify(m.embedding),
        JSON.stringify(m.metadata),
        m.importance,
        m.access_count,
        m.last_accessed,
        m.created_at
      ]);

      if (values.length > 0) {
        await this.dbClient.execute(
          `INSERT INTO ${archiveTable} 
           (id, type, content, embedding, metadata, importance, access_count, last_accessed, created_at)
           VALUES ?`,
          [values]
        );

        // Delete from main table
        const ids = memories.map(m => m.id);
        await this.dbClient.execute(
          `DELETE FROM unified_memory WHERE id IN (?)`,
          [ids]
        );

        this.logger.debug(`Archived ${memories.length} memories`);
      }
    } catch (error) {
      this.logger.error('Failed to archive memories', error);
      throw error;
    }
  }

  /**
   * Clean temporary data (sessions, chunks, etc.)
   */
  private async cleanTemporaryData(): Promise<void> {
    try {
      // Clean old WebSocket streaming chunks
      const chunksResult = await this.dbClient.execute(
        `DELETE FROM streaming_chunks 
         WHERE created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
         LIMIT ?`,
        [this.config.batchSize]
      );

      // Clean disconnected WebSocket connections
      const connectionsResult = await this.dbClient.execute(
        `DELETE FROM websocket_connections 
         WHERE disconnected_at IS NOT NULL 
         AND disconnected_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
         LIMIT ?`,
        [this.config.batchSize]
      );

      // Clean completed conversation sessions
      const sessionsResult = await this.dbClient.execute(
        `DELETE FROM conversation_sessions 
         WHERE status = 'completed' 
         AND ended_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
         LIMIT ?`,
        [this.config.batchSize]
      );

      const totalDeleted = 
        chunksResult.affectedRows + 
        connectionsResult.affectedRows + 
        sessionsResult.affectedRows;

      this.logger.debug(`Cleaned ${totalDeleted} temporary records`);
    } catch (error) {
      this.logger.error('Failed to clean temporary data', error);
      this.stats!.errors.push('Failed to clean temporary data');
    }
  }

  /**
   * Optimize database tables
   */
  private async optimizeTables(): Promise<void> {
    try {
      // Analyze tables for query optimization
      await this.dbClient.execute('ANALYZE TABLE unified_memory');
      
      // Update table statistics
      await this.dbClient.execute(`
        UPDATE information_schema.tables 
        SET update_time = NOW() 
        WHERE table_schema = DATABASE() 
        AND table_name = 'unified_memory'
      `);

      this.logger.debug('Optimized database tables');
    } catch (error) {
      this.logger.error('Failed to optimize tables', error);
      // Non-critical error, don't add to stats
    }
  }

  /**
   * Save cleanup statistics
   */
  private async saveCleanupStats(): Promise<void> {
    if (!this.stats) return;

    try {
      await this.dbClient.execute(
        `INSERT INTO cleanup_job_stats 
         (id, job_type, started_at, completed_at, records_processed, records_deleted, 
          records_archived, space_freed, errors, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          'memory_cleanup',
          this.stats.startedAt,
          this.stats.completedAt,
          this.stats.memoriesScanned,
          this.stats.memoriesDeleted,
          this.stats.memoriesArchived,
          this.stats.spaceFreed,
          JSON.stringify(this.stats.errors),
          JSON.stringify({
            config: this.config,
            duration: this.stats.completedAt ? 
              this.stats.completedAt.getTime() - this.stats.startedAt.getTime() : null
          })
        ]
      );
    } catch (error) {
      this.logger.error('Failed to save cleanup stats', error);
    }
  }

  /**
   * Get cleanup statistics
   */
  async getStats(days: number = 7): Promise<any[]> {
    return await this.dbClient.query(
      `SELECT * FROM cleanup_job_stats 
       WHERE job_type = 'memory_cleanup' 
       AND started_at > DATE_SUB(NOW(), INTERVAL ? DAY)
       ORDER BY started_at DESC`,
      [days]
    );
  }

  /**
   * Estimate space that can be freed
   */
  async estimateCleanup(): Promise<{
    oldMemories: number;
    lowImportanceMemories: number;
    orphanedMemories: number;
    estimatedSpaceFreed: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - (this.config.retentionDays || 30));

    const [oldCount] = await this.dbClient.query<any>(
      'SELECT COUNT(*) as count FROM unified_memory WHERE created_at < ?',
      [cutoffDate]
    );

    const [lowImportanceCount] = await this.dbClient.query<any>(
      'SELECT COUNT(*) as count FROM unified_memory WHERE importance < ?',
      [this.config.importanceThreshold]
    );

    const [orphanedCount] = await this.dbClient.query<any>(
      `SELECT COUNT(*) as count FROM unified_memory m
       LEFT JOIN agents a ON m.agent_id = a.id
       WHERE m.agent_id IS NOT NULL AND a.id IS NULL`
    );

    const [avgSize] = await this.dbClient.query<any>(
      'SELECT AVG(LENGTH(content) + LENGTH(metadata)) as avg_size FROM unified_memory'
    );

    const totalToDelete = 
      (oldCount?.count || 0) + 
      (lowImportanceCount?.count || 0) + 
      (orphanedCount?.count || 0);

    return {
      oldMemories: oldCount?.count || 0,
      lowImportanceMemories: lowImportanceCount?.count || 0,
      orphanedMemories: orphanedCount?.count || 0,
      estimatedSpaceFreed: totalToDelete * (avgSize?.avg_size || 1000)
    };
  }
}

// Create singleton instance
let cleanupJob: MemoryCleanupJob | null = null;

export function createMemoryCleanupJob(
  dbClient: JupiterDBClient,
  config?: Partial<CleanupConfig>
): MemoryCleanupJob {
  if (!cleanupJob) {
    cleanupJob = new MemoryCleanupJob(dbClient, config);
  }
  return cleanupJob;
}

export function getMemoryCleanupJob(): MemoryCleanupJob {
  if (!cleanupJob) {
    throw new Error('Memory cleanup job not initialized');
  }
  return cleanupJob;
}
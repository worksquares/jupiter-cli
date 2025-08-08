/**
 * Database Cleanup Job
 * Comprehensive cleanup for all database tables and optimization
 */

import { Logger } from '../utils/logger';
import { JupiterDBClient } from '../database/jupiter-db-client';
import { v4 as uuidv4 } from 'uuid';

export interface DatabaseCleanupConfig {
  // Table-specific retention (in days)
  retention: {
    tasks: number;
    agents: number;
    deployments: number;
    domains: number;
    logs: number;
    metrics: number;
    temp: number;
  };
  
  // Optimization settings
  optimization: {
    analyzeTablesDaily: boolean;
    defragmentWeekly: boolean;
    rebuildIndexesMonthly: boolean;
  };
  
  // Cleanup settings
  runInterval: number; // in ms
  batchSize: number;
  maxExecutionTime: number; // in ms
  
  // Features
  vacuumEnabled: boolean;
  archiveEnabled: boolean;
  compressionEnabled: boolean;
}

interface TableCleanupResult {
  tableName: string;
  recordsDeleted: number;
  recordsArchived: number;
  spaceFreed: number;
  duration: number;
  error?: string;
}

export class DatabaseCleanupJob {
  private logger: Logger;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private startTime: number = 0;
  
  private defaultConfig: DatabaseCleanupConfig = {
    retention: {
      tasks: 90,
      agents: 90,
      deployments: 180,
      domains: 365,
      logs: 30,
      metrics: 60,
      temp: 1
    },
    optimization: {
      analyzeTablesDaily: true,
      defragmentWeekly: true,
      rebuildIndexesMonthly: false
    },
    runInterval: 3600000, // 1 hour
    batchSize: 1000,
    maxExecutionTime: 300000, // 5 minutes
    vacuumEnabled: true,
    archiveEnabled: true,
    compressionEnabled: true
  };

  constructor(
    private dbClient: JupiterDBClient,
    private config: Partial<DatabaseCleanupConfig> = {}
  ) {
    this.logger = new Logger('DatabaseCleanupJob');
    this.config = { ...this.defaultConfig, ...config };
  }

  /**
   * Start the cleanup job
   */
  async start(): Promise<void> {
    if (this.intervalId) {
      this.logger.warn('Database cleanup job is already running');
      return;
    }

    this.logger.info('Starting database cleanup job', { config: this.config });

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
      this.logger.info('Database cleanup job stopped');
    }
  }

  /**
   * Run complete cleanup cycle
   */
  async run(): Promise<TableCleanupResult[]> {
    if (this.isRunning) {
      this.logger.warn('Cleanup already in progress');
      return [];
    }

    this.isRunning = true;
    this.startTime = Date.now();
    const results: TableCleanupResult[] = [];

    try {
      this.logger.info('Starting database cleanup cycle');

      // 1. Clean task-related tables
      results.push(await this.cleanTaskTables());

      // 2. Clean agent-related tables
      results.push(await this.cleanAgentTables());

      // 3. Clean deployment tables
      results.push(await this.cleanDeploymentTables());

      // 4. Clean domain tables
      results.push(await this.cleanDomainTables());

      // 5. Clean log tables
      results.push(await this.cleanLogTables());

      // 6. Clean metric tables
      results.push(await this.cleanMetricTables());

      // 7. Clean temporary tables
      results.push(await this.cleanTemporaryTables());

      // 8. Clean Azure-specific tables
      results.push(await this.cleanAzureTables());

      // 9. Perform optimization
      if (this.shouldOptimize()) {
        await this.optimizeDatabase();
      }

      // 10. Vacuum if enabled
      if (this.config.vacuumEnabled) {
        await this.vacuumTables();
      }

      const duration = Date.now() - this.startTime;
      const totalDeleted = results.reduce((sum, r) => sum + r.recordsDeleted, 0);
      const totalArchived = results.reduce((sum, r) => sum + r.recordsArchived, 0);
      const totalSpaceFreed = results.reduce((sum, r) => sum + r.spaceFreed, 0);

      this.logger.info('Database cleanup completed', {
        duration,
        totalDeleted,
        totalArchived,
        totalSpaceFreed,
        tablesProcessed: results.length
      });

      // Save cleanup summary
      await this.saveCleanupSummary(results);

      return results;

    } catch (error) {
      this.logger.error('Database cleanup failed', error);
      return results;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Clean task-related tables
   */
  private async cleanTaskTables(): Promise<TableCleanupResult> {
    const result: TableCleanupResult = {
      tableName: 'tasks',
      recordsDeleted: 0,
      recordsArchived: 0,
      spaceFreed: 0,
      duration: 0
    };

    const startTime = Date.now();

    try {
      // Archive old completed tasks
      if (this.config.archiveEnabled) {
        const archived = await this.archiveOldRecords(
          'tasks',
          'archived_tasks',
          `status IN ('completed', 'failed', 'cancelled') 
           AND completed_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
          [this.config.retention?.tasks || 90]
        );
        result.recordsArchived = archived;
      }

      // Delete very old tasks
      const deleteResult = await this.dbClient.execute(
        `DELETE FROM tasks 
         WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
         AND status IN ('completed', 'failed', 'cancelled')
         LIMIT ?`,
        [(this.config.retention?.tasks || 90) * 2, this.config.batchSize]
      );
      result.recordsDeleted = deleteResult.affectedRows;

      // Clean related tables
      await this.dbClient.execute(
        `DELETE FROM agent_tasks 
         WHERE task_id NOT IN (SELECT id FROM tasks)
         LIMIT ?`,
        [this.config.batchSize]
      );

      result.duration = Date.now() - startTime;
      this.logger.debug(`Cleaned tasks table`, result);

    } catch (error) {
      this.logger.error('Failed to clean task tables', error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return result;
  }

  /**
   * Clean agent-related tables
   */
  private async cleanAgentTables(): Promise<TableCleanupResult> {
    const result: TableCleanupResult = {
      tableName: 'agents',
      recordsDeleted: 0,
      recordsArchived: 0,
      spaceFreed: 0,
      duration: 0
    };

    const startTime = Date.now();

    try {
      // Delete old inactive agents
      const deleteResult = await this.dbClient.execute(
        `DELETE FROM agents 
         WHERE status IN ('completed', 'failed', 'paused')
         AND updated_at < DATE_SUB(NOW(), INTERVAL ? DAY)
         LIMIT ?`,
        [this.config.retention?.agents || 90, this.config.batchSize]
      );
      result.recordsDeleted = deleteResult.affectedRows;

      result.duration = Date.now() - startTime;
      this.logger.debug(`Cleaned agents table`, result);

    } catch (error) {
      this.logger.error('Failed to clean agent tables', error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return result;
  }

  /**
   * Clean deployment tables
   */
  private async cleanDeploymentTables(): Promise<TableCleanupResult> {
    const result: TableCleanupResult = {
      tableName: 'deployments',
      recordsDeleted: 0,
      recordsArchived: 0,
      spaceFreed: 0,
      duration: 0
    };

    const startTime = Date.now();

    try {
      // Archive old deployments
      if (this.config.archiveEnabled) {
        const archived = await this.archiveOldRecords(
          'deployments',
          'archived_deployments',
          `created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
          [this.config.retention?.deployments || 180]
        );
        result.recordsArchived = archived;
      }

      // Delete deployment history
      const historyResult = await this.dbClient.execute(
        `DELETE FROM deployment_history 
         WHERE started_at < DATE_SUB(NOW(), INTERVAL ? DAY)
         LIMIT ?`,
        [this.config.retention?.deployments || 180, this.config.batchSize]
      );
      result.recordsDeleted += historyResult.affectedRows;

      // Clean build artifacts
      const artifactsResult = await this.dbClient.execute(
        `DELETE FROM build_artifacts 
         WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
         LIMIT ?`,
        [this.config.batchSize]
      );
      result.recordsDeleted += artifactsResult.affectedRows;

      result.duration = Date.now() - startTime;
      this.logger.debug(`Cleaned deployment tables`, result);

    } catch (error) {
      this.logger.error('Failed to clean deployment tables', error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return result;
  }

  /**
   * Clean domain tables
   */
  private async cleanDomainTables(): Promise<TableCleanupResult> {
    const result: TableCleanupResult = {
      tableName: 'domains',
      recordsDeleted: 0,
      recordsArchived: 0,
      spaceFreed: 0,
      duration: 0
    };

    const startTime = Date.now();

    try {
      // Delete old domain health checks
      const healthResult = await this.dbClient.execute(
        `DELETE FROM domain_health_checks 
         WHERE check_time < DATE_SUB(NOW(), INTERVAL 30 DAY)
         LIMIT ?`,
        [this.config.batchSize]
      );
      result.recordsDeleted += healthResult.affectedRows;

      // Delete old DNS propagation checks
      const dnsResult = await this.dbClient.execute(
        `DELETE FROM dns_propagation_checks 
         WHERE check_time < DATE_SUB(NOW(), INTERVAL 7 DAY)
         LIMIT ?`,
        [this.config.batchSize]
      );
      result.recordsDeleted += dnsResult.affectedRows;

      // Clean domain analytics
      const analyticsResult = await this.dbClient.execute(
        `DELETE FROM domain_analytics 
         WHERE date < DATE_SUB(NOW(), INTERVAL 90 DAY)
         LIMIT ?`,
        [this.config.batchSize]
      );
      result.recordsDeleted += analyticsResult.affectedRows;

      result.duration = Date.now() - startTime;
      this.logger.debug(`Cleaned domain tables`, result);

    } catch (error) {
      this.logger.error('Failed to clean domain tables', error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return result;
  }

  /**
   * Clean log tables
   */
  private async cleanLogTables(): Promise<TableCleanupResult> {
    const result: TableCleanupResult = {
      tableName: 'logs',
      recordsDeleted: 0,
      recordsArchived: 0,
      spaceFreed: 0,
      duration: 0
    };

    const startTime = Date.now();

    try {
      // Compress old logs if enabled
      if (this.config.compressionEnabled) {
        await this.compressOldLogs();
      }

      // Delete old planner logs
      const plannerResult = await this.dbClient.execute(
        `DELETE FROM planner_logs 
         WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
         LIMIT ?`,
        [this.config.retention?.logs || 30, this.config.batchSize]
      );
      result.recordsDeleted += plannerResult.affectedRows;

      // Delete old usage logs
      const usageResult = await this.dbClient.execute(
        `DELETE FROM usage_logs 
         WHERE timestamp < DATE_SUB(NOW(), INTERVAL ? DAY)
         LIMIT ?`,
        [this.config.retention?.logs || 30, this.config.batchSize]
      );
      result.recordsDeleted += usageResult.affectedRows;

      // Delete old payment logs
      const paymentResult = await this.dbClient.execute(
        `DELETE FROM payment_logs 
         WHERE created_at < DATE_SUB(NOW(), INTERVAL 180 DAY)
         LIMIT ?`,
        [this.config.batchSize]
      );
      result.recordsDeleted += paymentResult.affectedRows;

      result.duration = Date.now() - startTime;
      this.logger.debug(`Cleaned log tables`, result);

    } catch (error) {
      this.logger.error('Failed to clean log tables', error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return result;
  }

  /**
   * Clean metric tables
   */
  private async cleanMetricTables(): Promise<TableCleanupResult> {
    const result: TableCleanupResult = {
      tableName: 'metrics',
      recordsDeleted: 0,
      recordsArchived: 0,
      spaceFreed: 0,
      duration: 0
    };

    const startTime = Date.now();

    try {
      // Aggregate old metrics before deletion
      await this.aggregateOldMetrics();

      // Delete old model token usage
      const tokenResult = await this.dbClient.execute(
        `DELETE FROM model_token_usage 
         WHERE used_at < DATE_SUB(NOW(), INTERVAL ? DAY)
         LIMIT ?`,
        [this.config.retention?.metrics || 60, this.config.batchSize]
      );
      result.recordsDeleted += tokenResult.affectedRows;

      // Delete old daily usage
      const dailyResult = await this.dbClient.execute(
        `DELETE FROM daily_model_token_usage 
         WHERE usage_date < DATE_SUB(NOW(), INTERVAL ? DAY)
         LIMIT ?`,
        [this.config.retention?.metrics || 60, this.config.batchSize]
      );
      result.recordsDeleted += dailyResult.affectedRows;

      result.duration = Date.now() - startTime;
      this.logger.debug(`Cleaned metric tables`, result);

    } catch (error) {
      this.logger.error('Failed to clean metric tables', error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return result;
  }

  /**
   * Clean temporary tables
   */
  private async cleanTemporaryTables(): Promise<TableCleanupResult> {
    const result: TableCleanupResult = {
      tableName: 'temporary',
      recordsDeleted: 0,
      recordsArchived: 0,
      spaceFreed: 0,
      duration: 0
    };

    const startTime = Date.now();

    try {
      // Get all temporary tables (tables ending with _temp or _tmp)
      const [tempTables] = await this.dbClient.query<any[]>(
        `SELECT TABLE_NAME 
         FROM information_schema.TABLES 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND (TABLE_NAME LIKE '%_temp' OR TABLE_NAME LIKE '%_tmp')`
      );

      for (const table of tempTables) {
        try {
          // Drop temporary tables older than 1 day
          await this.dbClient.execute(`DROP TABLE IF EXISTS ${table.TABLE_NAME}`);
          result.recordsDeleted++;
        } catch (error) {
          this.logger.warn(`Failed to drop temp table ${table.TABLE_NAME}`, error);
        }
      }

      result.duration = Date.now() - startTime;
      this.logger.debug(`Cleaned temporary tables`, result);

    } catch (error) {
      this.logger.error('Failed to clean temporary tables', error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return result;
  }

  /**
   * Clean Azure-specific tables
   */
  private async cleanAzureTables(): Promise<TableCleanupResult> {
    const result: TableCleanupResult = {
      tableName: 'azure',
      recordsDeleted: 0,
      recordsArchived: 0,
      spaceFreed: 0,
      duration: 0
    };

    const startTime = Date.now();

    try {
      // Clean old ACI instances
      const aciResult = await this.dbClient.execute(
        `DELETE FROM aci_instances 
         WHERE state = 'Terminated'
         AND updated_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
         LIMIT ?`,
        [this.config.batchSize]
      );
      result.recordsDeleted += aciResult.affectedRows;

      // Clean old static web app data
      const swaResult = await this.dbClient.execute(
        `DELETE FROM static_web_apps 
         WHERE status = 'deleted'
         AND updated_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
         LIMIT ?`,
        [this.config.batchSize]
      );
      result.recordsDeleted += swaResult.affectedRows;

      result.duration = Date.now() - startTime;
      this.logger.debug(`Cleaned Azure tables`, result);

    } catch (error) {
      this.logger.error('Failed to clean Azure tables', error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return result;
  }

  /**
   * Archive old records to archive table
   */
  private async archiveOldRecords(
    sourceTable: string,
    archiveTable: string,
    condition: string,
    params: any[]
  ): Promise<number> {
    try {
      // Create archive table if not exists (copy structure)
      await this.dbClient.execute(
        `CREATE TABLE IF NOT EXISTS ${archiveTable} LIKE ${sourceTable}`
      );

      // Add archive timestamp column if not exists
      await this.dbClient.execute(
        `ALTER TABLE ${archiveTable} 
         ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
      );

      // Copy records to archive
      const archiveResult = await this.dbClient.execute(
        `INSERT IGNORE INTO ${archiveTable} 
         SELECT *, NOW() as archived_at 
         FROM ${sourceTable} 
         WHERE ${condition}
         LIMIT ?`,
        [...params, this.config.batchSize]
      );

      // Delete archived records from source
      if (archiveResult.affectedRows > 0) {
        await this.dbClient.execute(
          `DELETE FROM ${sourceTable} 
           WHERE ${condition}
           LIMIT ?`,
          [...params, archiveResult.affectedRows]
        );
      }

      return archiveResult.affectedRows;

    } catch (error) {
      this.logger.error(`Failed to archive records from ${sourceTable}`, error);
      return 0;
    }
  }

  /**
   * Compress old logs
   */
  private async compressOldLogs(): Promise<void> {
    try {
      // Compress log content older than 7 days
      await this.dbClient.execute(
        `UPDATE planner_logs 
         SET details = COMPRESS(details)
         WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
         AND LENGTH(details) > 1000
         AND details NOT LIKE 'x%'
         LIMIT ?`,
        [this.config.batchSize]
      );

      this.logger.debug('Compressed old logs');
    } catch (error) {
      this.logger.error('Failed to compress logs', error);
    }
  }

  /**
   * Aggregate old metrics
   */
  private async aggregateOldMetrics(): Promise<void> {
    try {
      // Create aggregated metrics table if not exists
      await this.dbClient.execute(`
        CREATE TABLE IF NOT EXISTS metrics_aggregated (
          id VARCHAR(36) PRIMARY KEY,
          metric_type VARCHAR(50),
          period VARCHAR(20),
          period_start DATE,
          period_end DATE,
          aggregated_data JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_period (period_start, period_end)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Aggregate daily metrics into weekly
      await this.dbClient.execute(
        `INSERT INTO metrics_aggregated 
         (id, metric_type, period, period_start, period_end, aggregated_data)
         SELECT 
           UUID(), 'token_usage', 'weekly',
           DATE_SUB(DATE(usage_date), INTERVAL WEEKDAY(usage_date) DAY) as week_start,
           DATE_ADD(DATE_SUB(DATE(usage_date), INTERVAL WEEKDAY(usage_date) DAY), INTERVAL 6 DAY) as week_end,
           JSON_OBJECT(
             'total_input_tokens', SUM(input_tokens),
             'total_output_tokens', SUM(output_tokens),
             'total_tokens', SUM(total_tokens),
             'record_count', COUNT(*)
           )
         FROM daily_model_token_usage
         WHERE usage_date < DATE_SUB(NOW(), INTERVAL 30 DAY)
         GROUP BY week_start
         ON DUPLICATE KEY UPDATE
           aggregated_data = VALUES(aggregated_data)`
      );

      this.logger.debug('Aggregated old metrics');
    } catch (error) {
      this.logger.error('Failed to aggregate metrics', error);
    }
  }

  /**
   * Check if optimization should run
   */
  private shouldOptimize(): boolean {
    const now = new Date();
    
    // Daily analysis
    if (this.config.optimization?.analyzeTablesDaily) {
      return true;
    }
    
    // Weekly defragmentation (on Sundays)
    if (this.config.optimization?.defragmentWeekly && now.getDay() === 0) {
      return true;
    }
    
    // Monthly index rebuild (on 1st of month)
    if (this.config.optimization?.rebuildIndexesMonthly && now.getDate() === 1) {
      return true;
    }
    
    return false;
  }

  /**
   * Optimize database
   */
  private async optimizeDatabase(): Promise<void> {
    try {
      // Get all tables
      const [tables] = await this.dbClient.query<any[]>(
        `SELECT TABLE_NAME 
         FROM information_schema.TABLES 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_TYPE = 'BASE TABLE'`
      );

      for (const table of tables) {
        // Skip if execution time exceeded
        if (Date.now() - this.startTime > (this.config.maxExecutionTime || 300000)) {
          this.logger.warn('Max execution time reached, skipping optimization');
          break;
        }

        try {
          // Analyze table
          await this.dbClient.execute(`ANALYZE TABLE ${table.TABLE_NAME}`);
          
          // Optimize table (defragment) if needed
          if (this.config.optimization?.defragmentWeekly) {
            await this.dbClient.execute(`OPTIMIZE TABLE ${table.TABLE_NAME}`);
          }
          
          this.logger.debug(`Optimized table ${table.TABLE_NAME}`);
        } catch (error) {
          this.logger.warn(`Failed to optimize table ${table.TABLE_NAME}`, error);
        }
      }

    } catch (error) {
      this.logger.error('Failed to optimize database', error);
    }
  }

  /**
   * Vacuum tables (reclaim space)
   */
  private async vacuumTables(): Promise<void> {
    try {
      // Get tables with deleted space
      const [tables] = await this.dbClient.query<any[]>(
        `SELECT 
          TABLE_NAME,
          DATA_FREE
         FROM information_schema.TABLES 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND DATA_FREE > 1048576` // > 1MB of free space
      );

      for (const table of tables) {
        try {
          await this.dbClient.execute(`OPTIMIZE TABLE ${table.TABLE_NAME}`);
          this.logger.debug(`Vacuumed table ${table.TABLE_NAME}, freed ${table.DATA_FREE} bytes`);
        } catch (error) {
          this.logger.warn(`Failed to vacuum table ${table.TABLE_NAME}`, error);
        }
      }

    } catch (error) {
      this.logger.error('Failed to vacuum tables', error);
    }
  }

  /**
   * Save cleanup summary
   */
  private async saveCleanupSummary(results: TableCleanupResult[]): Promise<void> {
    try {
      // Create summary table if not exists
      await this.dbClient.execute(`
        CREATE TABLE IF NOT EXISTS cleanup_job_stats (
          id VARCHAR(36) PRIMARY KEY,
          job_type VARCHAR(50),
          started_at TIMESTAMP,
          completed_at TIMESTAMP,
          records_processed INT,
          records_deleted INT,
          records_archived INT,
          space_freed BIGINT,
          errors JSON,
          metadata JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      const totalDeleted = results.reduce((sum, r) => sum + r.recordsDeleted, 0);
      const totalArchived = results.reduce((sum, r) => sum + r.recordsArchived, 0);
      const totalSpaceFreed = results.reduce((sum, r) => sum + r.spaceFreed, 0);
      const errors = results.filter(r => r.error).map(r => ({ table: r.tableName, error: r.error }));

      await this.dbClient.execute(
        `INSERT INTO cleanup_job_stats 
         (id, job_type, started_at, completed_at, records_processed, 
          records_deleted, records_archived, space_freed, errors, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          'database_cleanup',
          new Date(this.startTime),
          new Date(),
          totalDeleted + totalArchived,
          totalDeleted,
          totalArchived,
          totalSpaceFreed,
          JSON.stringify(errors),
          JSON.stringify({
            results,
            config: this.config,
            duration: Date.now() - this.startTime
          })
        ]
      );

    } catch (error) {
      this.logger.error('Failed to save cleanup summary', error);
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<any> {
    const stats = await this.dbClient.query(`
      SELECT 
        COUNT(*) as table_count,
        SUM(DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024 as total_size_mb,
        SUM(DATA_FREE) / 1024 / 1024 as free_space_mb,
        SUM(TABLE_ROWS) as total_rows
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE()
    `);

    const largestTables = await this.dbClient.query(`
      SELECT 
        TABLE_NAME,
        TABLE_ROWS,
        (DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024 as size_mb
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY DATA_LENGTH + INDEX_LENGTH DESC
      LIMIT 10
    `);

    return {
      summary: stats[0],
      largestTables
    };
  }
}
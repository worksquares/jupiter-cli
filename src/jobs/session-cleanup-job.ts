/**
 * Session Cleanup Job
 * Cleans up expired sessions, inactive connections, and temporary data
 */

import { Logger } from '../utils/logger';
import { JupiterDBClient } from '../database/jupiter-db-client';

export interface SessionCleanupConfig {
  // Session settings
  sessionInactivityHours: number;
  sessionMaxDurationDays: number;
  
  // Connection settings
  connectionTimeoutMinutes: number;
  keepDisconnectedDays: number;
  
  // Chat settings
  chatHistoryRetentionDays: number;
  incompleteChatRetentionHours: number;
  
  // Cleanup settings
  runInterval: number; // in ms
  batchSize: number;
  
  // Features
  archiveBeforeDelete: boolean;
  compressOldChats: boolean;
}

export class SessionCleanupJob {
  private logger: Logger;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  
  private defaultConfig: SessionCleanupConfig = {
    sessionInactivityHours: 2,
    sessionMaxDurationDays: 7,
    connectionTimeoutMinutes: 30,
    keepDisconnectedDays: 3,
    chatHistoryRetentionDays: 90,
    incompleteChatRetentionHours: 24,
    runInterval: 900000, // 15 minutes
    batchSize: 500,
    archiveBeforeDelete: true,
    compressOldChats: true
  };

  constructor(
    private dbClient: JupiterDBClient,
    private config: Partial<SessionCleanupConfig> = {}
  ) {
    this.logger = new Logger('SessionCleanupJob');
    this.config = { ...this.defaultConfig, ...config };
  }

  /**
   * Start the cleanup job
   */
  async start(): Promise<void> {
    if (this.intervalId) {
      this.logger.warn('Session cleanup job is already running');
      return;
    }

    this.logger.info('Starting session cleanup job', { config: this.config });

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
      this.logger.info('Session cleanup job stopped');
    }
  }

  /**
   * Run cleanup cycle
   */
  async run(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Cleanup already in progress');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    let totalCleaned = 0;

    try {
      this.logger.info('Starting session cleanup cycle');

      // 1. Clean inactive conversation sessions
      totalCleaned += await this.cleanInactiveSessions();

      // 2. Clean expired WebSocket connections
      totalCleaned += await this.cleanExpiredConnections();

      // 3. Clean old chat messages
      totalCleaned += await this.cleanOldChatMessages();

      // 4. Clean streaming chunks
      totalCleaned += await this.cleanStreamingChunks();

      // 5. Clean agent action logs
      totalCleaned += await this.cleanAgentActionLogs();

      // 6. Clean analytics data
      totalCleaned += await this.cleanAnalyticsData();

      // 7. Clean orphaned data
      totalCleaned += await this.cleanOrphanedData();

      // 8. Optimize session tables
      await this.optimizeSessionTables();

      const duration = Date.now() - startTime;
      this.logger.info('Session cleanup completed', {
        duration,
        totalCleaned,
        tablesOptimized: true
      });

    } catch (error) {
      this.logger.error('Session cleanup failed', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Clean inactive conversation sessions
   */
  private async cleanInactiveSessions(): Promise<number> {
    try {
      // Mark inactive sessions as completed
      const markResult = await this.dbClient.execute(
        `UPDATE conversation_sessions 
         SET status = 'completed', ended_at = NOW()
         WHERE status = 'active' 
         AND last_activity_at < DATE_SUB(NOW(), INTERVAL ? HOUR)
         AND ended_at IS NULL
         LIMIT ?`,
        [this.config.sessionInactivityHours, this.config.batchSize]
      );

      // Delete very old completed sessions
      const deleteResult = await this.dbClient.execute(
        `DELETE FROM conversation_sessions 
         WHERE status = 'completed' 
         AND ended_at < DATE_SUB(NOW(), INTERVAL ? DAY)
         LIMIT ?`,
        [this.config.sessionMaxDurationDays, this.config.batchSize]
      );

      const total = markResult.affectedRows + deleteResult.affectedRows;
      this.logger.debug(`Cleaned ${total} inactive sessions`);
      return total;

    } catch (error) {
      this.logger.error('Failed to clean inactive sessions', error);
      return 0;
    }
  }

  /**
   * Clean expired WebSocket connections
   */
  private async cleanExpiredConnections(): Promise<number> {
    try {
      // Mark stale connections as disconnected
      const staleResult = await this.dbClient.execute(
        `UPDATE websocket_connections 
         SET disconnected_at = NOW()
         WHERE disconnected_at IS NULL 
         AND last_activity_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
         LIMIT ?`,
        [this.config.connectionTimeoutMinutes, this.config.batchSize]
      );

      // Delete old disconnected connections
      const deleteResult = await this.dbClient.execute(
        `DELETE FROM websocket_connections 
         WHERE disconnected_at IS NOT NULL 
         AND disconnected_at < DATE_SUB(NOW(), INTERVAL ? DAY)
         LIMIT ?`,
        [this.config.keepDisconnectedDays, this.config.batchSize]
      );

      const total = staleResult.affectedRows + deleteResult.affectedRows;
      this.logger.debug(`Cleaned ${total} expired connections`);
      return total;

    } catch (error) {
      this.logger.error('Failed to clean expired connections', error);
      return 0;
    }
  }

  /**
   * Clean old chat messages
   */
  private async cleanOldChatMessages(): Promise<number> {
    try {
      // Archive old messages if enabled
      if (this.config.archiveBeforeDelete) {
        await this.archiveOldMessages();
      }

      // Compress old messages if enabled
      if (this.config.compressOldChats) {
        await this.compressOldMessages();
      }

      // Delete very old messages
      const result = await this.dbClient.execute(
        `DELETE FROM conversation_messages 
         WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
         AND session_id IN (
           SELECT id FROM conversation_sessions 
           WHERE status = 'completed'
         )
         LIMIT ?`,
        [this.config.chatHistoryRetentionDays, this.config.batchSize]
      );

      this.logger.debug(`Deleted ${result.affectedRows} old chat messages`);
      return result.affectedRows;

    } catch (error) {
      this.logger.error('Failed to clean old chat messages', error);
      return 0;
    }
  }

  /**
   * Clean streaming chunks
   */
  private async cleanStreamingChunks(): Promise<number> {
    try {
      // Delete old streaming chunks
      const result = await this.dbClient.execute(
        `DELETE FROM streaming_chunks 
         WHERE created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
         LIMIT ?`,
        [this.config.batchSize]
      );

      // Delete orphaned chunks (no parent message)
      const orphanedResult = await this.dbClient.execute(
        `DELETE sc FROM streaming_chunks sc
         LEFT JOIN conversation_messages cm ON sc.message_id = cm.id
         WHERE cm.id IS NULL
         LIMIT ?`,
        [this.config.batchSize]
      );

      const total = result.affectedRows + orphanedResult.affectedRows;
      this.logger.debug(`Cleaned ${total} streaming chunks`);
      return total;

    } catch (error) {
      this.logger.error('Failed to clean streaming chunks', error);
      return 0;
    }
  }

  /**
   * Clean agent action logs
   */
  private async cleanAgentActionLogs(): Promise<number> {
    try {
      // Delete old completed action logs
      const result = await this.dbClient.execute(
        `DELETE FROM agent_actions_log 
         WHERE status IN ('completed', 'failed', 'cancelled')
         AND completed_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
         LIMIT ?`,
        [this.config.batchSize]
      );

      // Delete stuck pending actions
      const stuckResult = await this.dbClient.execute(
        `DELETE FROM agent_actions_log 
         WHERE status = 'pending'
         AND started_at < DATE_SUB(NOW(), INTERVAL 1 DAY)
         LIMIT ?`,
        [this.config.batchSize]
      );

      const total = result.affectedRows + stuckResult.affectedRows;
      this.logger.debug(`Cleaned ${total} agent action logs`);
      return total;

    } catch (error) {
      this.logger.error('Failed to clean agent action logs', error);
      return 0;
    }
  }

  /**
   * Clean analytics data
   */
  private async cleanAnalyticsData(): Promise<number> {
    try {
      // Aggregate old daily analytics into monthly
      await this.aggregateAnalytics();

      // Delete old daily analytics
      const result = await this.dbClient.execute(
        `DELETE FROM conversation_analytics 
         WHERE date < DATE_SUB(NOW(), INTERVAL 90 DAY)
         LIMIT ?`,
        [this.config.batchSize]
      );

      this.logger.debug(`Cleaned ${result.affectedRows} analytics records`);
      return result.affectedRows;

    } catch (error) {
      this.logger.error('Failed to clean analytics data', error);
      return 0;
    }
  }

  /**
   * Clean orphaned data
   */
  private async cleanOrphanedData(): Promise<number> {
    let totalCleaned = 0;

    try {
      // Clean messages without sessions
      const orphanedMessages = await this.dbClient.execute(
        `DELETE cm FROM conversation_messages cm
         LEFT JOIN conversation_sessions cs ON cm.session_id = cs.id
         WHERE cs.id IS NULL
         LIMIT ?`,
        [this.config.batchSize]
      );
      totalCleaned += orphanedMessages.affectedRows;

      // Clean analytics without sessions
      const orphanedAnalytics = await this.dbClient.execute(
        `DELETE ca FROM conversation_analytics ca
         LEFT JOIN conversation_sessions cs ON ca.session_id = cs.id
         WHERE cs.id IS NULL
         LIMIT ?`,
        [this.config.batchSize]
      );
      totalCleaned += orphanedAnalytics.affectedRows;

      this.logger.debug(`Cleaned ${totalCleaned} orphaned records`);
      return totalCleaned;

    } catch (error) {
      this.logger.error('Failed to clean orphaned data', error);
      return 0;
    }
  }

  /**
   * Archive old messages
   */
  private async archiveOldMessages(): Promise<void> {
    try {
      // Create archive table if not exists
      await this.dbClient.execute(`
        CREATE TABLE IF NOT EXISTS archived_messages (
          id VARCHAR(36) PRIMARY KEY,
          session_id VARCHAR(36),
          message_type VARCHAR(50),
          role VARCHAR(20),
          content_compressed BLOB,
          metadata JSON,
          created_at TIMESTAMP,
          archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_archived_session (session_id),
          INDEX idx_archived_date (archived_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Archive messages older than 30 days
      await this.dbClient.execute(
        `INSERT INTO archived_messages 
         (id, session_id, message_type, role, content_compressed, metadata, created_at)
         SELECT 
           id, session_id, message_type, role, 
           COMPRESS(content), metadata, created_at
         FROM conversation_messages
         WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
         AND session_id IN (
           SELECT id FROM conversation_sessions WHERE status = 'completed'
         )
         LIMIT ?
         ON DUPLICATE KEY UPDATE archived_at = NOW()`,
        [this.config.batchSize]
      );

      this.logger.debug('Archived old messages');
    } catch (error) {
      this.logger.error('Failed to archive messages', error);
    }
  }

  /**
   * Compress old messages
   */
  private async compressOldMessages(): Promise<void> {
    try {
      // Compress message content for messages older than 7 days
      await this.dbClient.execute(
        `UPDATE conversation_messages 
         SET content = COMPRESS(content)
         WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
         AND LENGTH(content) > 1000
         AND content NOT LIKE 'x%' -- Not already compressed
         LIMIT ?`,
        [this.config.batchSize]
      );

      this.logger.debug('Compressed old messages');
    } catch (error) {
      this.logger.error('Failed to compress messages', error);
    }
  }

  /**
   * Aggregate analytics data
   */
  private async aggregateAnalytics(): Promise<void> {
    try {
      // Create monthly analytics table if not exists
      await this.dbClient.execute(`
        CREATE TABLE IF NOT EXISTS conversation_analytics_monthly (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36),
          year INT,
          month INT,
          total_sessions INT,
          total_messages INT,
          total_tokens INT,
          avg_session_duration INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_month (user_id, year, month)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Aggregate daily data into monthly
      await this.dbClient.execute(
        `INSERT INTO conversation_analytics_monthly 
         (id, user_id, year, month, total_sessions, total_messages, total_tokens, avg_session_duration)
         SELECT 
           UUID(), user_id, YEAR(date), MONTH(date),
           COUNT(DISTINCT session_id), SUM(total_messages), 
           SUM(total_tokens_used), AVG(session_duration_seconds)
         FROM conversation_analytics
         WHERE date < DATE_SUB(NOW(), INTERVAL 30 DAY)
         GROUP BY user_id, YEAR(date), MONTH(date)
         ON DUPLICATE KEY UPDATE
           total_sessions = VALUES(total_sessions),
           total_messages = VALUES(total_messages),
           total_tokens = VALUES(total_tokens)`
      );

      this.logger.debug('Aggregated analytics data');
    } catch (error) {
      this.logger.error('Failed to aggregate analytics', error);
    }
  }

  /**
   * Optimize session-related tables
   */
  private async optimizeSessionTables(): Promise<void> {
    try {
      const tables = [
        'conversation_sessions',
        'conversation_messages',
        'streaming_chunks',
        'websocket_connections',
        'agent_actions_log',
        'conversation_analytics'
      ];

      for (const table of tables) {
        await this.dbClient.execute(`ANALYZE TABLE ${table}`);
      }

      this.logger.debug('Optimized session tables');
    } catch (error) {
      this.logger.error('Failed to optimize tables', error);
    }
  }

  /**
   * Get cleanup statistics
   */
  async getStatistics(): Promise<any> {
    const stats = await this.dbClient.query(`
      SELECT 
        (SELECT COUNT(*) FROM conversation_sessions WHERE status = 'active') as active_sessions,
        (SELECT COUNT(*) FROM conversation_sessions WHERE status = 'completed') as completed_sessions,
        (SELECT COUNT(*) FROM websocket_connections WHERE disconnected_at IS NULL) as active_connections,
        (SELECT COUNT(*) FROM conversation_messages) as total_messages,
        (SELECT COUNT(*) FROM streaming_chunks) as total_chunks,
        (SELECT SUM(DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024 
         FROM information_schema.TABLES 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME IN ('conversation_sessions', 'conversation_messages', 'streaming_chunks')
        ) as total_size_mb
    `);

    return stats[0];
  }
}
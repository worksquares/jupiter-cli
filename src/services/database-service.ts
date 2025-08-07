/**
 * Database Service for JupiterDB
 * Handles all database operations with proper error handling and connection pooling
 */

import mysql from 'mysql2/promise';
import { Pool, PoolConnection } from 'mysql2/promise';
import { Logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface DatabaseConfig {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
  connectionLimit?: number;
  connectTimeout?: number;
  waitForConnections?: boolean;
  queueLimit?: number;
  enableKeepAlive?: boolean;
  keepAliveInitialDelay?: number;
  ssl?: {
    rejectUnauthorized?: boolean;
  };
}

export interface QueryResult {
  rows?: any[];
  insertId?: number;
  affectedRows?: number;
  changedRows?: number;
}

export class DatabaseService extends EventEmitter {
  private pool: Pool | null = null;
  private logger: Logger;
  private isConnected: boolean = false;
  private reconnectTimer?: NodeJS.Timeout;
  private queryCount: number = 0;
  private errorCount: number = 0;

  constructor(private config: DatabaseConfig) {
    super();
    this.logger = new Logger('DatabaseService');
    this.validateConfig();
  }

  /**
   * Validate database configuration
   */
  private validateConfig(): void {
    if (!this.config.host) {
      throw new Error('Database host is required');
    }
    if (!this.config.user) {
      throw new Error('Database user is required');
    }
    if (!this.config.database) {
      throw new Error('Database name is required');
    }
  }

  /**
   * Initialize database connection pool
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing database connection pool', {
        host: this.config.host,
        database: this.config.database,
        user: this.config.user
      });

      // Create connection pool with Azure MySQL SSL support
      this.pool = mysql.createPool({
        host: this.config.host,
        port: this.config.port || 3306,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        connectionLimit: this.config.connectionLimit || 10,
        connectTimeout: this.config.connectTimeout || 60000,
        waitForConnections: this.config.waitForConnections !== false,
        queueLimit: this.config.queueLimit || 0,
        enableKeepAlive: this.config.enableKeepAlive !== false,
        keepAliveInitialDelay: this.config.keepAliveInitialDelay || 0,
        ssl: this.config.ssl || { rejectUnauthorized: false },
        // Azure MySQL specific settings
        timezone: '+00:00',
        dateStrings: true,
        supportBigNumbers: true,
        bigNumberStrings: true
      });

      // Test connection
      await this.testConnection();
      
      this.isConnected = true;
      this.emit('connected');
      
      // Setup connection monitoring
      this.setupConnectionMonitoring();

    } catch (error) {
      this.logger.error('Failed to initialize database pool', error);
      this.isConnected = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new DatabaseConnectionError(`Database initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Test database connection
   */
  private async testConnection(): Promise<void> {
    let connection: PoolConnection | null = null;
    
    try {
      connection = await this.pool!.getConnection();
      await connection.ping();
      this.logger.info('Database connection test successful');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Connection test failed: ${errorMessage}`);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  /**
   * Setup connection monitoring
   */
  private setupConnectionMonitoring(): void {
    // Monitor pool events
    this.pool!.on('acquire', (connection) => {
      this.logger.debug('Connection acquired from pool');
    });

    this.pool!.on('release', (connection) => {
      this.logger.debug('Connection released to pool');
    });

    this.pool!.on('connection', (connection) => {
      this.logger.debug('New connection created');
    });

    this.pool!.on('enqueue', () => {
      this.logger.warn('Waiting for available connection slot');
    });
  }

  /**
   * Execute a query with automatic retry and error handling
   */
  async query(sql: string, params?: any[]): Promise<any> {
    if (!this.pool) {
      await this.initialize();
    }

    const maxRetries = 3;
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let connection: PoolConnection | null = null;
      
      try {
        connection = await this.pool!.getConnection();
        
        this.logger.debug('Executing query', {
          sql: sql.substring(0, 100),
          params: params?.length || 0,
          attempt
        });

        const [results] = await connection.execute(sql, params);
        this.queryCount++;
        
        return results;

      } catch (error: any) {
        lastError = error;
        this.errorCount++;
        
        this.logger.error(`Query failed (attempt ${attempt}/${maxRetries})`, {
          error: error.message,
          code: error.code,
          sqlState: error.sqlState
        });

        // Handle specific MySQL errors
        if (this.isRetryableError(error)) {
          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        } else if (this.isConnectionError(error)) {
          // Reconnect for connection errors
          await this.reconnect();
          if (attempt < maxRetries) {
            continue;
          }
        } else {
          // Non-retryable error
          throw error;
        }
      } finally {
        if (connection) {
          connection.release();
        }
      }
    }

    throw new DatabaseQueryError(
      `Query failed after ${maxRetries} attempts: ${lastError.message}`,
      lastError.code,
      sql
    );
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(
    callback: (connection: PoolConnection) => Promise<T>
  ): Promise<T> {
    if (!this.pool) {
      await this.initialize();
    }

    let connection: PoolConnection | null = null;

    try {
      connection = await this.pool!.getConnection();
      await connection.beginTransaction();

      const result = await callback(connection);
      
      await connection.commit();
      return result;

    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      this.logger.error('Transaction failed', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new DatabaseTransactionError(`Transaction failed: ${errorMessage}`);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  /**
   * Batch insert with optimization
   */
  async batchInsert(
    table: string,
    columns: string[],
    values: any[][],
    options: { batchSize?: number; onConflict?: string } = {}
  ): Promise<number> {
    const batchSize = options.batchSize || 1000;
    let totalInserted = 0;

    for (let i = 0; i < values.length; i += batchSize) {
      const batch = values.slice(i, i + batchSize);
      const placeholders = batch.map(() => 
        `(${columns.map(() => '?').join(', ')})`
      ).join(', ');
      
      const sql = `
        INSERT INTO ${table} (${columns.join(', ')})
        VALUES ${placeholders}
        ${options.onConflict || ''}
      `;
      
      const flatValues = batch.flat();
      const result = await this.query(sql, flatValues);
      totalInserted += result.affectedRows || 0;
    }

    return totalInserted;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    const retryableCodes = [
      'ER_LOCK_DEADLOCK',
      'ER_LOCK_WAIT_TIMEOUT',
      'ER_CON_COUNT_ERROR',
      'PROTOCOL_CONNECTION_LOST',
      'ETIMEDOUT',
      'ECONNRESET'
    ];
    
    return retryableCodes.includes(error.code);
  }

  /**
   * Check if error is connection-related
   */
  private isConnectionError(error: any): boolean {
    const connectionCodes = [
      'PROTOCOL_CONNECTION_LOST',
      'ER_ACCESS_DENIED_ERROR',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ECONNRESET'
    ];
    
    return connectionCodes.includes(error.code);
  }

  /**
   * Reconnect to database
   */
  private async reconnect(): Promise<void> {
    this.logger.info('Attempting to reconnect to database...');
    
    try {
      if (this.pool) {
        await this.pool.end();
      }
      
      await this.initialize();
      this.logger.info('Reconnection successful');
    } catch (error) {
      this.logger.error('Reconnection failed', error);
      
      // Schedule retry
      if (!this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = undefined;
          this.reconnect();
        }, 5000);
      }
    }
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): {
    totalConnections: number;
    idleConnections: number;
    queuedRequests: number;
    queryCount: number;
    errorCount: number;
    errorRate: number;
  } {
    if (!this.pool) {
      return {
        totalConnections: 0,
        idleConnections: 0,
        queuedRequests: 0,
        queryCount: this.queryCount,
        errorCount: this.errorCount,
        errorRate: 0
      };
    }

    // TypeScript doesn't expose pool internals, so we estimate
    return {
      totalConnections: this.config.connectionLimit || 10,
      idleConnections: 0, // Would need pool internals
      queuedRequests: 0,  // Would need pool internals
      queryCount: this.queryCount,
      errorCount: this.errorCount,
      errorRate: this.queryCount > 0 ? this.errorCount / this.queryCount : 0
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    latency: number;
    details: any;
  }> {
    const startTime = Date.now();
    
    try {
      const result = await this.query('SELECT 1 as health');
      const latency = Date.now() - startTime;
      
      return {
        status: 'healthy',
        latency,
        details: {
          connected: this.isConnected,
          poolStats: this.getPoolStats()
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: Date.now() - startTime,
        details: {
          error: error instanceof Error ? error.message : String(error),
          connected: this.isConnected
        }
      };
    }
  }

  /**
   * Close database connections
   */
  async close(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.pool) {
      try {
        await this.pool.end();
        this.logger.info('Database pool closed');
      } catch (error) {
        this.logger.error('Error closing database pool', error);
      }
    }

    this.isConnected = false;
    this.emit('disconnected');
  }

  /**
   * Escape identifier for SQL
   */
  escapeId(identifier: string): string {
    return mysql.escapeId(identifier);
  }

  /**
   * Escape value for SQL
   */
  escape(value: any): string {
    return mysql.escape(value);
  }

  /**
   * Format SQL query with values
   */
  format(sql: string, values?: any[]): string {
    return mysql.format(sql, values);
  }
}

// Custom error classes
export class DatabaseError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class DatabaseConnectionError extends DatabaseError {
  constructor(message: string) {
    super(message, 'CONNECTION_ERROR');
    this.name = 'DatabaseConnectionError';
  }
}

export class DatabaseQueryError extends DatabaseError {
  constructor(message: string, code: string, public sql?: string) {
    super(message, code);
    this.name = 'DatabaseQueryError';
  }
}

export class DatabaseTransactionError extends DatabaseError {
  constructor(message: string) {
    super(message, 'TRANSACTION_ERROR');
    this.name = 'DatabaseTransactionError';
  }
}
/**
 * Jupiter Database Client
 * Manages MySQL connections and queries for Jupiter DB
 */

import mysql from 'mysql2/promise';
import { Logger } from '../utils/logger';

export interface JupiterDBConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit?: number;
  waitForConnections?: boolean;
  queueLimit?: number;
}

export class JupiterDBClient {
  private pool: mysql.Pool;
  private logger: Logger;
  private connected: boolean = false;

  constructor(private config: JupiterDBConfig) {
    this.logger = new Logger('JupiterDBClient');
    
    // Create connection pool
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectionLimit: config.connectionLimit || 10,
      waitForConnections: config.waitForConnections ?? true,
      queueLimit: config.queueLimit || 0,
      ssl: {
        rejectUnauthorized: true
      }
    });
  }

  /**
   * Test database connection
   */
  async connect(): Promise<boolean> {
    try {
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      this.connected = true;
      this.logger.info('Successfully connected to Jupiter DB');
      return true;
    } catch (error) {
      this.logger.error('Failed to connect to Jupiter DB', error);
      this.connected = false;
      return false;
    }
  }

  /**
   * Execute a query with parameters
   */
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows as T[];
    } catch (error) {
      this.logger.error('Query execution failed', { sql, error });
      throw error;
    }
  }

  /**
   * Execute a single row query
   */
  async queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Execute an insert/update/delete query
   */
  async execute(sql: string, params?: any[]): Promise<mysql.ResultSetHeader> {
    try {
      const [result] = await this.pool.execute(sql, params);
      return result as mysql.ResultSetHeader;
    } catch (error) {
      this.logger.error('Execute failed', { sql, error });
      throw error;
    }
  }

  /**
   * Begin a transaction
   */
  async beginTransaction(): Promise<mysql.PoolConnection> {
    const connection = await this.pool.getConnection();
    await connection.beginTransaction();
    return connection;
  }

  /**
   * Commit a transaction
   */
  async commit(connection: mysql.PoolConnection): Promise<void> {
    try {
      await connection.commit();
    } finally {
      connection.release();
    }
  }

  /**
   * Rollback a transaction
   */
  async rollback(connection: mysql.PoolConnection): Promise<void> {
    try {
      await connection.rollback();
    } finally {
      connection.release();
    }
  }

  /**
   * Close the connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    this.connected = false;
    this.logger.info('Database connection pool closed');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get pool statistics
   */
  getPoolStats() {
    return {
      // @ts-ignore - These properties exist on the pool
      allConnections: this.pool._allConnections?.length || 0,
      // @ts-ignore
      freeConnections: this.pool._freeConnections?.length || 0,
      // @ts-ignore
      connectionQueue: this.pool._connectionQueue?.length || 0
    };
  }
}

// Create singleton instance
let dbClient: JupiterDBClient | null = null;

export function createDBClient(config: JupiterDBConfig): JupiterDBClient {
  if (!dbClient) {
    dbClient = new JupiterDBClient(config);
  }
  return dbClient;
}

export function getDBClient(): JupiterDBClient {
  if (!dbClient) {
    throw new Error('Database client not initialized. Call createDBClient first.');
  }
  return dbClient;
}
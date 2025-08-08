/**
 * Connection Pool Manager
 * Optimized connection pooling for database and API clients
 */

import { Logger } from '../utils/logger';
import mysql from 'mysql2/promise';
import { EventEmitter } from 'events';

export interface PoolConfig {
  // Basic settings
  name: string;
  type: 'database' | 'api' | 'websocket';
  
  // Connection settings
  minConnections: number;
  maxConnections: number;
  connectionTimeout: number; // ms
  idleTimeout: number; // ms
  
  // Queue settings
  queueLimit: number;
  acquireTimeout: number; // ms
  
  // Health check
  healthCheckInterval: number; // ms
  testOnBorrow: boolean;
  testOnReturn: boolean;
  
  // Performance
  enableStatistics: boolean;
  enableWarmup: boolean;
  warmupConnections: number;
}

export interface PoolStatistics {
  name: string;
  type: string;
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  pendingAcquires: number;
  totalAcquires: number;
  totalReleases: number;
  totalTimeouts: number;
  totalErrors: number;
  averageAcquireTime: number;
  averageUseTime: number;
  uptime: number;
}

export interface Connection {
  id: string;
  resource: any;
  createdAt: Date;
  lastUsedAt: Date;
  useCount: number;
  errorCount: number;
  isHealthy: boolean;
}

export class ConnectionPoolManager extends EventEmitter {
  private logger: Logger;
  private pools: Map<string, ConnectionPool> = new Map();
  private globalStats: Map<string, PoolStatistics> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.logger = new Logger('ConnectionPoolManager');
  }

  /**
   * Create a new connection pool
   */
  createPool(config: PoolConfig): ConnectionPool {
    if (this.pools.has(config.name)) {
      this.logger.warn(`Pool ${config.name} already exists`);
      return this.pools.get(config.name)!;
    }

    const pool = new ConnectionPool(config);
    this.pools.set(config.name, pool);
    
    // Set up event forwarding
    pool.on('connection:created', (conn) => {
      this.emit('pool:connection:created', config.name, conn);
    });
    
    pool.on('connection:destroyed', (conn) => {
      this.emit('pool:connection:destroyed', config.name, conn);
    });
    
    pool.on('stats:update', (stats) => {
      this.globalStats.set(config.name, stats);
      this.emit('pool:stats:update', config.name, stats);
    });

    this.logger.info(`Created connection pool: ${config.name}`, {
      type: config.type,
      min: config.minConnections,
      max: config.maxConnections
    });

    return pool;
  }

  /**
   * Get a connection pool
   */
  getPool(name: string): ConnectionPool | undefined {
    return this.pools.get(name);
  }

  /**
   * Start monitoring all pools
   */
  startMonitoring(interval: number = 30000): void {
    if (this.monitoringInterval) {
      return;
    }

    this.monitoringInterval = setInterval(() => {
      this.monitorPools();
    }, interval);

    this.logger.info(`Started pool monitoring with interval ${interval}ms`);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.logger.info('Stopped pool monitoring');
    }
  }

  /**
   * Monitor all pools
   */
  private monitorPools(): void {
    for (const [name, pool] of this.pools) {
      const stats = pool.getStatistics();
      
      // Check for issues
      if (stats.activeConnections >= stats.totalConnections * 0.9) {
        this.emit('pool:warning', name, 'Pool near capacity', stats);
      }
      
      if (stats.totalTimeouts > 10) {
        this.emit('pool:warning', name, 'High timeout rate', stats);
      }
      
      if (stats.totalErrors > 10) {
        this.emit('pool:warning', name, 'High error rate', stats);
      }
    }
  }

  /**
   * Get statistics for all pools
   */
  getAllStatistics(): Map<string, PoolStatistics> {
    return new Map(this.globalStats);
  }

  /**
   * Shutdown all pools
   */
  async shutdown(): Promise<void> {
    this.stopMonitoring();
    
    const shutdownPromises = [];
    for (const [name, pool] of this.pools) {
      this.logger.info(`Shutting down pool: ${name}`);
      shutdownPromises.push(pool.shutdown());
    }
    
    await Promise.all(shutdownPromises);
    this.pools.clear();
    this.globalStats.clear();
    
    this.logger.info('All connection pools shut down');
  }
}

/**
 * Individual Connection Pool
 */
export class ConnectionPool extends EventEmitter {
  private logger: Logger;
  private connections: Map<string, Connection> = new Map();
  private availableConnections: Connection[] = [];
  private waitingQueue: Array<{
    resolve: (conn: Connection) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = [];
  
  private statistics = {
    totalAcquires: 0,
    totalReleases: 0,
    totalTimeouts: 0,
    totalErrors: 0,
    acquireTimes: [] as number[],
    useTimes: [] as number[],
    startTime: Date.now()
  };
  
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(private config: PoolConfig) {
    super();
    this.logger = new Logger(`ConnectionPool:${config.name}`);
    this.initialize();
  }

  /**
   * Initialize the pool
   */
  private async initialize(): Promise<void> {
    // Create minimum connections
    if (this.config.enableWarmup) {
      await this.warmup();
    } else {
      for (let i = 0; i < this.config.minConnections; i++) {
        await this.createConnection();
      }
    }

    // Start health checking
    if (this.config.healthCheckInterval > 0) {
      this.startHealthCheck();
    }

    this.logger.info('Connection pool initialized', {
      connections: this.connections.size,
      available: this.availableConnections.length
    });
  }

  /**
   * Warmup connections
   */
  private async warmup(): Promise<void> {
    const warmupCount = this.config.warmupConnections || this.config.minConnections;
    const promises = [];
    
    for (let i = 0; i < warmupCount; i++) {
      promises.push(this.createConnection());
    }
    
    await Promise.all(promises);
    this.logger.info(`Warmed up ${warmupCount} connections`);
  }

  /**
   * Create a new connection
   */
  private async createConnection(): Promise<Connection> {
    const id = `${this.config.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    let resource: any;
    
    try {
      // Create connection based on type
      if (this.config.type === 'database') {
        resource = await this.createDatabaseConnection();
      } else if (this.config.type === 'api') {
        resource = await this.createAPIConnection();
      } else {
        resource = await this.createWebSocketConnection();
      }
      
      const connection: Connection = {
        id,
        resource,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        useCount: 0,
        errorCount: 0,
        isHealthy: true
      };
      
      this.connections.set(id, connection);
      this.availableConnections.push(connection);
      
      this.emit('connection:created', connection);
      
      return connection;
      
    } catch (error) {
      this.logger.error('Failed to create connection', error);
      this.statistics.totalErrors++;
      throw error;
    }
  }

  /**
   * Create database connection
   */
  private async createDatabaseConnection(): Promise<any> {
    // This would be customized based on your database
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectTimeout: this.config.connectionTimeout
    });
    
    return connection;
  }

  /**
   * Create API connection (placeholder)
   */
  private async createAPIConnection(): Promise<any> {
    // Return a configured axios instance or similar
    return {
      type: 'api',
      created: new Date(),
      // Add your API client configuration here
    };
  }

  /**
   * Create WebSocket connection (placeholder)
   */
  private async createWebSocketConnection(): Promise<any> {
    // Return a WebSocket client
    return {
      type: 'websocket',
      created: new Date(),
      // Add your WebSocket client configuration here
    };
  }

  /**
   * Acquire a connection from the pool
   */
  async acquire(): Promise<Connection> {
    if (this.isShuttingDown) {
      throw new Error('Pool is shutting down');
    }

    const startTime = Date.now();
    this.statistics.totalAcquires++;

    // Try to get an available connection
    let connection = this.availableConnections.pop();

    if (connection) {
      // Test connection if configured
      if (this.config.testOnBorrow) {
        const isHealthy = await this.testConnection(connection);
        if (!isHealthy) {
          await this.destroyConnection(connection);
          return this.acquire(); // Recursive call to get another connection
        }
      }

      connection.lastUsedAt = new Date();
      connection.useCount++;
      
      const acquireTime = Date.now() - startTime;
      this.statistics.acquireTimes.push(acquireTime);
      
      return connection;
    }

    // Check if we can create a new connection
    if (this.connections.size < this.config.maxConnections) {
      try {
        connection = await this.createConnection();
        this.availableConnections.pop(); // Remove from available since we're using it
        connection.useCount++;
        
        const acquireTime = Date.now() - startTime;
        this.statistics.acquireTimes.push(acquireTime);
        
        return connection;
      } catch (error) {
        this.statistics.totalErrors++;
        throw error;
      }
    }

    // Wait for a connection to become available
    if (this.waitingQueue.length >= this.config.queueLimit) {
      throw new Error('Connection pool queue limit reached');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitingQueue.findIndex(item => 
          item.resolve === resolve
        );
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
        }
        this.statistics.totalTimeouts++;
        reject(new Error('Connection acquire timeout'));
      }, this.config.acquireTimeout);

      this.waitingQueue.push({ resolve, reject, timeout });
    });
  }

  /**
   * Release a connection back to the pool
   */
  async release(connection: Connection): Promise<void> {
    if (this.isShuttingDown) {
      await this.destroyConnection(connection);
      return;
    }

    this.statistics.totalReleases++;

    // Test connection if configured
    if (this.config.testOnReturn) {
      const isHealthy = await this.testConnection(connection);
      if (!isHealthy) {
        await this.destroyConnection(connection);
        await this.createConnection(); // Create replacement
        return;
      }
    }

    // Check if connection has been idle too long
    const idleTime = Date.now() - connection.lastUsedAt.getTime();
    if (idleTime > this.config.idleTimeout) {
      await this.destroyConnection(connection);
      await this.createConnection(); // Create replacement
      return;
    }

    // Check waiting queue
    if (this.waitingQueue.length > 0) {
      const waiter = this.waitingQueue.shift()!;
      clearTimeout(waiter.timeout);
      waiter.resolve(connection);
      return;
    }

    // Return to available pool
    this.availableConnections.push(connection);
  }

  /**
   * Test connection health
   */
  private async testConnection(connection: Connection): Promise<boolean> {
    try {
      if (this.config.type === 'database' && connection.resource.ping) {
        await connection.resource.ping();
      }
      // Add other connection type tests here
      
      connection.isHealthy = true;
      return true;
    } catch (error) {
      connection.isHealthy = false;
      connection.errorCount++;
      return false;
    }
  }

  /**
   * Destroy a connection
   */
  private async destroyConnection(connection: Connection): Promise<void> {
    try {
      // Close the actual connection
      if (this.config.type === 'database' && connection.resource.end) {
        await connection.resource.end();
      }
      // Add other connection type cleanup here
      
      // Remove from pool
      this.connections.delete(connection.id);
      const index = this.availableConnections.indexOf(connection);
      if (index !== -1) {
        this.availableConnections.splice(index, 1);
      }
      
      this.emit('connection:destroyed', connection);
      
    } catch (error) {
      this.logger.error('Error destroying connection', error);
    }
  }

  /**
   * Start health checking
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const connection of this.availableConnections) {
        const isHealthy = await this.testConnection(connection);
        if (!isHealthy) {
          await this.destroyConnection(connection);
          await this.createConnection();
        }
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Get pool statistics
   */
  getStatistics(): PoolStatistics {
    const avgAcquireTime = this.statistics.acquireTimes.length > 0
      ? this.statistics.acquireTimes.reduce((a, b) => a + b, 0) / this.statistics.acquireTimes.length
      : 0;
      
    const avgUseTime = this.statistics.useTimes.length > 0
      ? this.statistics.useTimes.reduce((a, b) => a + b, 0) / this.statistics.useTimes.length
      : 0;

    return {
      name: this.config.name,
      type: this.config.type,
      totalConnections: this.connections.size,
      activeConnections: this.connections.size - this.availableConnections.length,
      idleConnections: this.availableConnections.length,
      pendingAcquires: this.waitingQueue.length,
      totalAcquires: this.statistics.totalAcquires,
      totalReleases: this.statistics.totalReleases,
      totalTimeouts: this.statistics.totalTimeouts,
      totalErrors: this.statistics.totalErrors,
      averageAcquireTime: avgAcquireTime,
      averageUseTime: avgUseTime,
      uptime: Date.now() - this.statistics.startTime
    };
  }

  /**
   * Shutdown the pool
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Stop health checking
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Reject waiting queue
    for (const waiter of this.waitingQueue) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error('Pool is shutting down'));
    }
    this.waitingQueue = [];

    // Destroy all connections
    const destroyPromises = [];
    for (const connection of this.connections.values()) {
      destroyPromises.push(this.destroyConnection(connection));
    }
    
    await Promise.all(destroyPromises);
    
    this.connections.clear();
    this.availableConnections = [];
    
    this.logger.info('Connection pool shut down');
  }
}

// Singleton instance
let poolManager: ConnectionPoolManager | null = null;

export function getConnectionPoolManager(): ConnectionPoolManager {
  if (!poolManager) {
    poolManager = new ConnectionPoolManager();
  }
  return poolManager;
}
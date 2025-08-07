/**
 * Logger utility for the Intelligent Agent System
 */

import winston from 'winston';
import chalk from 'chalk';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
  VERBOSE = 'verbose'
}

export class Logger {
  private winston: winston.Logger;
  private context: string;
  private static instances: Map<string, Logger> = new Map();

  constructor(context: string) {
    this.context = context;
    
    // Create winston logger
    this.winston = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { context },
      transports: [
        // Console transport with color
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(this.formatConsoleMessage.bind(this))
          )
        })
      ]
    });

    // Add file transport in production
    if (process.env.NODE_ENV === 'production') {
      this.winston.add(new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error'
      }));
      
      this.winston.add(new winston.transports.File({
        filename: 'logs/combined.log'
      }));
    }

    Logger.instances.set(context, this);
  }

  /**
   * Get or create logger instance
   */
  static getInstance(context: string = 'default'): Logger {
    if (!Logger.instances.has(context)) {
      const instance = new Logger(context);
      Logger.instances.set(context, instance);
      return instance;
    }
    return Logger.instances.get(context)!;
  }

  /**
   * Create a child logger with additional metadata
   */
  child(meta: { component?: string; [key: string]: any }): Logger {
    const childContext = meta.component ? `${this.context}:${meta.component}` : this.context;
    const childLogger = new Logger(childContext);
    
    // Add metadata to the child logger
    childLogger.winston.defaultMeta = {
      ...this.winston.defaultMeta,
      ...meta
    };
    
    return childLogger;
  }

  /**
   * Log methods
   */
  error(message: string, error?: any): void {
    this.winston.error(message, { error: this.serializeError(error) });
  }

  warn(message: string, meta?: any): void {
    this.winston.warn(message, meta);
  }

  info(message: string, meta?: any): void {
    this.winston.info(message, meta);
  }

  debug(message: string, meta?: any): void {
    this.winston.debug(message, meta);
  }

  verbose(message: string, meta?: any): void {
    this.winston.verbose(message, meta);
  }

  /**
   * Performance logging
   */
  startTimer(label: string): () => void {
    const start = Date.now();
    
    return () => {
      const duration = Date.now() - start;
      this.info(`${label} completed`, { duration });
    };
  }

  /**
   * Structured logging
   */
  logEvent(event: string, data: any): void {
    this.info(event, {
      event,
      timestamp: new Date().toISOString(),
      ...data
    });
  }

  /**
   * Format console message with colors
   */
  private formatConsoleMessage(info: winston.Logform.TransformableInfo): string {
    const { timestamp, level, message, context, ...meta } = info;
    
    const contextStr = chalk.cyan(`[${context || this.context}]`);
    const timestampStr = chalk.gray(timestamp);
    const levelStr = this.colorizeLevel(level);
    
    let output = `${timestampStr} ${levelStr} ${contextStr} ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      const metaStr = JSON.stringify(meta, null, 2);
      output += `\n${chalk.gray(metaStr)}`;
    }
    
    return output;
  }

  /**
   * Colorize log level
   */
  private colorizeLevel(level: string): string {
    switch (level) {
      case 'error':
        return chalk.red('[ERROR]');
      case 'warn':
        return chalk.yellow('[WARN]');
      case 'info':
        return chalk.green('[INFO]');
      case 'debug':
        return chalk.blue('[DEBUG]');
      case 'verbose':
        return chalk.magenta('[VERBOSE]');
      default:
        return `[${level.toUpperCase()}]`;
    }
  }

  /**
   * Serialize error objects
   */
  private serializeError(error: any): any {
    if (!error) return null;
    
    if (error instanceof Error) {
      return {
        ...error,
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }
    
    return error;
  }


  /**
   * Profile async operations
   */
  async profile<T>(label: string, operation: () => Promise<T>): Promise<T> {
    const timer = this.startTimer(label);
    
    try {
      const result = await operation();
      timer();
      return result;
    } catch (error) {
      timer();
      this.error(`${label} failed`, error);
      throw error;
    }
  }

  /**
   * Log memory usage
   */
  logMemoryUsage(): void {
    const usage = process.memoryUsage();
    
    this.debug('Memory usage', {
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`
    });
  }

  /**
   * Setup global error handlers
   */
  static setupGlobalHandlers(): void {
    const logger = new Logger('Global');
    
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', error);
      process.exit(1);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', { reason, promise });
    });
  }
}

// Convenience export
export default Logger;
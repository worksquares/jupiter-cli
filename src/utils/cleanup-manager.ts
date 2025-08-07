/**
 * Cleanup Manager
 * Manages resource cleanup and ensures proper disposal
 */

import { Logger } from './logger';
import { EventEmitter } from 'events';

export interface CleanupTask {
  id: string;
  name: string;
  cleanup: () => Promise<void>;
  priority: number; // Higher priority tasks are cleaned up first
}

export class CleanupManager extends EventEmitter {
  private static instance: CleanupManager;
  private logger = Logger.getInstance().child({ component: 'CleanupManager' });
  private cleanupTasks: Map<string, CleanupTask> = new Map();
  private isShuttingDown = false;
  
  private constructor() {
    super();
    this.setupProcessHandlers();
  }
  
  static getInstance(): CleanupManager {
    if (!this.instance) {
      this.instance = new CleanupManager();
    }
    return this.instance;
  }
  
  /**
   * Register a cleanup task
   */
  register(task: CleanupTask): void {
    this.cleanupTasks.set(task.id, task);
    this.logger.debug('Registered cleanup task', { 
      id: task.id, 
      name: task.name,
      priority: task.priority 
    });
  }
  
  /**
   * Unregister a cleanup task
   */
  unregister(taskId: string): void {
    this.cleanupTasks.delete(taskId);
    this.logger.debug('Unregistered cleanup task', { id: taskId });
  }
  
  /**
   * Register a cleanup task (alias for register)
   */
  registerCleanup(task: CleanupTask): void {
    this.register(task);
  }
  
  /**
   * Cleanup resources by tag
   */
  async cleanupByTag(tag: string): Promise<void> {
    const tasksToCleanup = Array.from(this.cleanupTasks.values())
      .filter(task => task.name.includes(tag));
    
    for (const task of tasksToCleanup) {
      try {
        await task.cleanup();
        this.cleanupTasks.delete(task.id);
      } catch (error) {
        this.logger.error('Failed to cleanup task by tag', { tag, task: task.name, error });
      }
    }
  }
  
  /**
   * Execute all cleanup tasks
   */
  async cleanup(): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.warn('Cleanup already in progress');
      return;
    }
    
    this.isShuttingDown = true;
    this.emit('cleanup:start');
    
    // Sort tasks by priority (descending)
    const sortedTasks = Array.from(this.cleanupTasks.values())
      .sort((a, b) => b.priority - a.priority);
    
    this.logger.info('Starting cleanup', { taskCount: sortedTasks.length });
    
    const errors: Array<{ task: string; error: Error }> = [];
    
    for (const task of sortedTasks) {
      try {
        this.logger.debug('Executing cleanup task', { 
          id: task.id, 
          name: task.name 
        });
        
        await task.cleanup();
        
        this.emit('cleanup:task:complete', task);
      } catch (error: any) {
        this.logger.error('Cleanup task failed', {
          task: task.name,
          error: error.message
        });
        
        errors.push({ task: task.name, error });
        this.emit('cleanup:task:error', { task, error });
      }
    }
    
    this.cleanupTasks.clear();
    this.isShuttingDown = false;
    
    this.emit('cleanup:complete', { errors });
    
    if (errors.length > 0) {
      this.logger.warn('Cleanup completed with errors', { 
        errorCount: errors.length 
      });
    } else {
      this.logger.info('Cleanup completed successfully');
    }
  }
  
  /**
   * Setup process handlers for graceful shutdown
   */
  private setupProcessHandlers(): void {
    const handleShutdown = async (signal: string) => {
      this.logger.info(`Received ${signal}, starting graceful shutdown`);
      
      try {
        await this.cleanup();
        process.exit(0);
      } catch (error) {
        this.logger.error('Cleanup failed during shutdown', error);
        process.exit(1);
      }
    };
    
    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    
    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception', error);
      handleShutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled rejection', { reason, promise });
      handleShutdown('unhandledRejection');
    });
  }
}

/**
 * Helper function to create a cleanup task
 */
export function createCleanupTask(
  id: string,
  name: string,
  cleanup: () => Promise<void>,
  priority: number = 0
): CleanupTask {
  return { id, name, cleanup, priority };
}

/**
 * Decorator for automatic cleanup registration
 */
export function RegisterCleanup(name: string, priority: number = 0) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = function (...args: any[]) {
      const result = originalMethod.apply(this, args);
      
      // Register cleanup if the method returns a disposable resource
      if (result && typeof result.dispose === 'function') {
        const cleanupManager = CleanupManager.getInstance();
        const taskId = `${target.constructor.name}.${propertyKey}`;
        
        cleanupManager.register({
          id: taskId,
          name: `${name} (${taskId})`,
          cleanup: async () => {
            await result.dispose();
          },
          priority
        });
      }
      
      return result;
    };
    
    return descriptor;
  };
}
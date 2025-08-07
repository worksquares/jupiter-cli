/**
 * Simple mutex implementation for preventing race conditions
 */

export interface MutexInterface {
  acquire(): Promise<() => void>;
  isLocked(): boolean;
}

export class Mutex implements MutexInterface {
  private queue: Array<() => void> = [];
  private locked = false;

  /**
   * Acquire the mutex lock
   * Returns a release function that must be called to release the lock
   */
  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        if (!this.locked) {
          this.locked = true;
          resolve(() => this.release());
        } else {
          this.queue.push(tryAcquire);
        }
      };
      
      tryAcquire();
    });
  }

  /**
   * Check if the mutex is currently locked
   */
  isLocked(): boolean {
    return this.locked;
  }

  /**
   * Release the lock
   */
  private release(): void {
    this.locked = false;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

/**
 * Mutex map for managing multiple named mutexes
 */
export class MutexMap {
  private mutexes = new Map<string, Mutex>();

  /**
   * Get or create a mutex for the given key
   */
  get(key: string): Mutex {
    let mutex = this.mutexes.get(key);
    if (!mutex) {
      mutex = new Mutex();
      this.mutexes.set(key, mutex);
    }
    return mutex;
  }

  /**
   * Remove a mutex
   */
  delete(key: string): boolean {
    return this.mutexes.delete(key);
  }

  /**
   * Clear all mutexes
   */
  clear(): void {
    this.mutexes.clear();
  }

  /**
   * Get the number of mutexes
   */
  get size(): number {
    return this.mutexes.size;
  }
}

/**
 * Decorator for methods that need mutex protection
 */
export function withMutex(mutexKey?: string) {
  return function (
    _target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function(...args: any[]) {
      const instance = this as any;
      
      // Get or create mutex
      if (!instance._mutexMap) {
        instance._mutexMap = new MutexMap();
      }
      
      const key = mutexKey || propertyKey;
      const mutex = instance._mutexMap.get(key);
      
      // Acquire lock
      const release = await mutex.acquire();
      
      try {
        // Execute original method
        return await originalMethod.apply(this, args);
      } finally {
        // Always release lock
        release();
      }
    };
    
    return descriptor;
  };
}

/**
 * Helper to run a function with mutex protection
 */
export async function withLock<T>(
  mutex: Mutex,
  fn: () => T | Promise<T>
): Promise<T> {
  const release = await mutex.acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}
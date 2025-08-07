/**
 * Settings Manager
 * Manages configuration settings for the Intelligent Agent System
 */

import { EventEmitter } from 'eventemitter3';
import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { Logger } from '../utils/logger';

/**
 * Settings schema
 */
const SettingsSchema = z.object({
  // General settings
  general: z.object({
    language: z.string().default('en'),
    theme: z.enum(['light', 'dark', 'auto']).default('auto'),
    verbosity: z.enum(['quiet', 'normal', 'verbose']).default('normal'),
    autoSave: z.boolean().default(true),
    maxConcurrentTasks: z.number().min(1).max(20).default(5)
  }).default({}),

  // Tool settings
  tools: z.object({
    enabledTools: z.array(z.string()).default([]),
    disabledTools: z.array(z.string()).default([]),
    defaultTimeout: z.number().min(1000).default(120000),
    retryAttempts: z.number().min(0).max(5).default(3),
    retryDelay: z.number().min(100).default(1000)
  }).default({}),

  // Memory settings
  memory: z.object({
    maxWorkingMemorySize: z.number().default(1000),
    maxEpisodicMemorySize: z.number().default(10000),
    maxSemanticMemorySize: z.number().default(100000),
    compressionThreshold: z.number().default(0.8),
    cleanupInterval: z.number().default(3600000) // 1 hour
  }).default({}),

  // AI settings
  ai: z.object({
    provider: z.string().default('cosmos'),
    model: z.string().default('default'),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().min(1).default(4096),
    streamResponses: z.boolean().default(true)
  }).default({}),

  // Security settings
  security: z.object({
    enablePermissions: z.boolean().default(true),
    defaultPermissionBehavior: z.enum(['allow', 'deny']).default('allow'),
    enableWorkspaceMode: z.boolean().default(false),
    enableHooks: z.boolean().default(true),
    hookSecurityLevel: z.enum(['strict', 'moderate', 'permissive']).default('moderate')
  }).default({}),

  // Performance settings
  performance: z.object({
    enableCaching: z.boolean().default(true),
    cacheSize: z.number().min(0).default(100),
    enableParallelExecution: z.boolean().default(true),
    maxParallelTasks: z.number().min(1).max(10).default(3),
    enableMetrics: z.boolean().default(true)
  }).default({}),

  // Developer settings
  developer: z.object({
    debugMode: z.boolean().default(false),
    logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    enableProfiling: z.boolean().default(false),
    showStackTraces: z.boolean().default(false),
    experimentalFeatures: z.boolean().default(false)
  }).default({})
});

export type Settings = z.infer<typeof SettingsSchema>;

/**
 * Settings events
 */
interface SettingsEvents {
  'settings:changed': (settings: Settings, changes: Partial<Settings>) => void;
  'settings:saved': (filepath: string) => void;
  'settings:loaded': (filepath: string) => void;
  'settings:reset': () => void;
}

/**
 * Settings manager implementation
 */
export class SettingsManager extends EventEmitter<SettingsEvents> {
  private settings: Settings;
  private settingsFile: string;
  private logger: Logger;
  private saveDebounceTimer?: NodeJS.Timeout;
  private readonly SAVE_DEBOUNCE_MS = 1000;

  constructor(settingsFile?: string) {
    super();
    this.logger = new Logger('SettingsManager');
    this.settingsFile = settingsFile || this.getDefaultSettingsPath();
    
    // Initialize with default settings
    this.settings = SettingsSchema.parse({});
  }

  /**
   * Get default settings path based on OS
   */
  private getDefaultSettingsPath(): string {
    const platform = process.platform;
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';

    switch (platform) {
      case 'darwin': // macOS
        return path.join(homeDir, 'Library', 'Application Support', 'jupiter', 'settings.json');
      case 'win32': // Windows
        return path.join(process.env.APPDATA || homeDir, 'jupiter', 'settings.json');
      default: // Linux and others
        return path.join(homeDir, '.config', 'jupiter', 'settings.json');
    }
  }

  /**
   * Initialize settings (load from file)
   */
  async initialize(): Promise<void> {
    try {
      await this.load();
      this.logger.info('Settings loaded successfully');
    } catch (error) {
      this.logger.info('No existing settings found, using defaults');
      // Save default settings
      if (this.settings.general.autoSave) {
        await this.save();
      }
    }
  }

  /**
   * Get all settings
   */
  getAll(): Settings {
    return { ...this.settings };
  }

  /**
   * Get specific setting by path
   */
  get<T = any>(path: string): T | undefined {
    const parts = path.split('.');
    let current: any = this.settings;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }

    return current as T;
  }

  /**
   * Set setting value
   */
  async set(path: string, value: any): Promise<void> {
    const parts = path.split('.');
    const changes: any = {};
    let current = changes;

    // Build nested object for changes
    for (let i = 0; i < parts.length - 1; i++) {
      current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;

    // Merge with existing settings
    this.settings = this.deepMerge(this.settings, changes);

    // Validate
    try {
      this.settings = SettingsSchema.parse(this.settings);
    } catch (error) {
      this.logger.error('Invalid settings value', error);
      throw new Error(`Invalid value for ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }

    this.emit('settings:changed', this.settings, changes);

    // Auto-save if enabled
    if (this.settings.general.autoSave) {
      this.debouncedSave();
    }
  }

  /**
   * Update multiple settings
   */
  async update(updates: Partial<Settings>): Promise<void> {
    const previousSettings = { ...this.settings };
    
    // Merge updates
    this.settings = this.deepMerge(this.settings, updates);

    // Validate
    try {
      this.settings = SettingsSchema.parse(this.settings);
    } catch (error) {
      this.settings = previousSettings; // Rollback
      this.logger.error('Invalid settings update', error);
      throw new Error(`Invalid settings: ${error instanceof Error ? error.message : String(error)}`);
    }

    this.emit('settings:changed', this.settings, updates);

    // Auto-save if enabled
    if (this.settings.general.autoSave) {
      this.debouncedSave();
    }
  }

  /**
   * Reset settings to defaults
   */
  async reset(): Promise<void> {
    this.settings = SettingsSchema.parse({});
    this.emit('settings:reset');

    if (this.settings.general.autoSave) {
      await this.save();
    }
  }

  /**
   * Load settings from file
   */
  async load(filepath?: string): Promise<void> {
    const file = filepath || this.settingsFile;

    try {
      const data = await fs.readFile(file, 'utf-8');
      const loaded = JSON.parse(data);
      
      // Validate and merge with defaults
      this.settings = SettingsSchema.parse(loaded);
      
      this.emit('settings:loaded', file);
      this.logger.debug('Settings loaded from file', { file });
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        throw new Error(`Settings file not found: ${file}`);
      }
      throw new Error(`Failed to load settings: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Save settings to file
   */
  async save(filepath?: string): Promise<void> {
    const file = filepath || this.settingsFile;

    try {
      // Ensure directory exists
      const dir = path.dirname(file);
      await fs.mkdir(dir, { recursive: true });

      // Write settings
      const data = JSON.stringify(this.settings, null, 2);
      await fs.writeFile(file, data, 'utf-8');

      this.emit('settings:saved', file);
      this.logger.debug('Settings saved to file', { file });
    } catch (error) {
      throw new Error(`Failed to save settings: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Export settings to JSON string
   */
  export(): string {
    return JSON.stringify(this.settings, null, 2);
  }

  /**
   * Import settings from JSON string
   */
  async import(json: string): Promise<void> {
    try {
      const imported = JSON.parse(json);
      await this.update(imported);
    } catch (error) {
      throw new Error(`Failed to import settings: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get settings schema
   */
  getSchema(): z.ZodType<Settings> {
    return SettingsSchema as z.ZodType<Settings>;
  }

  /**
   * Validate settings object
   */
  validate(settings: unknown): boolean {
    try {
      SettingsSchema.parse(settings);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Deep merge objects
   */
  private deepMerge(target: any, source: any): any {
    const output = { ...target };
    
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            output[key] = source[key];
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          output[key] = source[key];
        }
      });
    }

    return output;
  }

  /**
   * Check if value is object
   */
  private isObject(obj: any): boolean {
    return obj && typeof obj === 'object' && !Array.isArray(obj);
  }

  /**
   * Debounced save
   */
  private debouncedSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(async () => {
      try {
        await this.save();
      } catch (error) {
        this.logger.error('Failed to auto-save settings', error);
      }
    }, this.SAVE_DEBOUNCE_MS);
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.removeAllListeners();
  }
}
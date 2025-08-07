/**
 * Vim Command
 * Toggle vim editing mode
 */

import { Command } from './types';
import { EventEmitter } from 'eventemitter3';
import { Logger } from '../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Editor mode type
 */
export enum EditorMode {
  Normal = 'normal',
  Vim = 'vim'
}

/**
 * Editor mode configuration
 */
export interface EditorModeConfig {
  mode: EditorMode;
  vimConfig?: {
    showLineNumbers: boolean;
    relativeNumbers: boolean;
    highlightSearch: boolean;
    smartIndent: boolean;
    expandTab: boolean;
    tabStop: number;
    shiftWidth: number;
  };
}

/**
 * Editor mode events
 */
interface EditorModeEvents {
  'mode:changed': (mode: EditorMode, previousMode: EditorMode) => void;
  'config:updated': (config: EditorModeConfig) => void;
}

/**
 * Editor mode manager
 */
export class EditorModeManager extends EventEmitter<EditorModeEvents> {
  private currentMode: EditorMode = EditorMode.Normal;
  private config: EditorModeConfig;
  private configFile: string;
  private logger: Logger;

  constructor(configFile?: string) {
    super();
    this.logger = new Logger('EditorModeManager');
    this.configFile = configFile || path.join(process.cwd(), '.jupiter', 'editor-mode.json');
    
    // Default config
    this.config = {
      mode: EditorMode.Normal,
      vimConfig: {
        showLineNumbers: true,
        relativeNumbers: false,
        highlightSearch: true,
        smartIndent: true,
        expandTab: true,
        tabStop: 4,
        shiftWidth: 4
      }
    };

    // Load config on initialization
    this.loadConfig().catch(err => {
      this.logger.debug('No existing editor config found', err);
    });
  }

  /**
   * Get current mode
   */
  getMode(): EditorMode {
    return this.currentMode;
  }

  /**
   * Toggle editor mode
   */
  async toggleMode(): Promise<EditorMode> {
    const previousMode = this.currentMode;
    this.currentMode = this.currentMode === EditorMode.Normal ? EditorMode.Vim : EditorMode.Normal;
    this.config.mode = this.currentMode;

    await this.saveConfig();
    this.emit('mode:changed', this.currentMode, previousMode);
    
    this.logger.info(`Editor mode changed from ${previousMode} to ${this.currentMode}`);
    return this.currentMode;
  }

  /**
   * Set specific mode
   */
  async setMode(mode: EditorMode): Promise<void> {
    if (this.currentMode === mode) {
      return;
    }

    const previousMode = this.currentMode;
    this.currentMode = mode;
    this.config.mode = mode;

    await this.saveConfig();
    this.emit('mode:changed', this.currentMode, previousMode);
    
    this.logger.info(`Editor mode set to ${this.currentMode}`);
  }

  /**
   * Update vim configuration
   */
  async updateVimConfig(updates: Partial<EditorModeConfig['vimConfig']>): Promise<void> {
    if (!this.config.vimConfig) {
      this.config.vimConfig = {} as any;
    }

    Object.assign(this.config.vimConfig!, updates);
    await this.saveConfig();
    this.emit('config:updated', this.config);
    
    this.logger.info('Updated vim configuration', updates);
  }

  /**
   * Get configuration
   */
  getConfig(): EditorModeConfig {
    return { ...this.config };
  }

  /**
   * Load configuration from file
   */
  private async loadConfig(): Promise<void> {
    try {
      const data = await fs.readFile(this.configFile, 'utf-8');
      const loaded = JSON.parse(data);
      
      this.config = { ...this.config, ...loaded };
      this.currentMode = this.config.mode;
      
      this.logger.debug('Loaded editor mode config', this.config);
    } catch (error) {
      // Config file doesn't exist or is invalid
      this.logger.debug('Failed to load editor config', error);
    }
  }

  /**
   * Save configuration to file
   */
  private async saveConfig(): Promise<void> {
    try {
      const dir = path.dirname(this.configFile);
      await fs.mkdir(dir, { recursive: true });
      
      await fs.writeFile(this.configFile, JSON.stringify(this.config, null, 2));
      this.logger.debug('Saved editor mode config');
    } catch (error) {
      this.logger.error('Failed to save editor config', error);
    }
  }
}

/**
 * Vim command implementation
 */
export class VimCommand implements Command {
  name = 'vim';
  description = 'Toggle vim editing mode';
  
  private editorModeManager: EditorModeManager;

  constructor(editorModeManager?: EditorModeManager) {
    this.editorModeManager = editorModeManager || new EditorModeManager();
  }

  async execute(args: string[]): Promise<string> {
    const subcommand = args[0];

    if (!subcommand) {
      // Toggle mode
      const newMode = await this.editorModeManager.toggleMode();
      return this.formatModeChange(newMode);
    }

    switch (subcommand) {
      case 'on':
        await this.editorModeManager.setMode(EditorMode.Vim);
        return this.formatModeChange(EditorMode.Vim);

      case 'off':
        await this.editorModeManager.setMode(EditorMode.Normal);
        return this.formatModeChange(EditorMode.Normal);

      case 'status':
        return this.showStatus();

      case 'config':
        return this.manageConfig(args.slice(1));

      case 'help':
      default:
        return this.showHelp();
    }
  }

  /**
   * Format mode change message
   */
  private formatModeChange(mode: EditorMode): string {
    const modeDisplay = mode === EditorMode.Vim ? 'VIM' : 'NORMAL';
    const indicator = mode === EditorMode.Vim ? '-- INSERT --' : '';
    
    const lines = [
      `Editor mode: ${modeDisplay} ${indicator}`,
      ''
    ];

    if (mode === EditorMode.Vim) {
      lines.push('Vim keybindings enabled:');
      lines.push('  - Use :w to save files');
      lines.push('  - Use :q to quit');
      lines.push('  - Use :wq to save and quit');
      lines.push('  - Use ESC to exit insert mode');
      lines.push('  - Use i to enter insert mode');
      lines.push('');
      lines.push('Toggle back to normal mode with: vim off');
    } else {
      lines.push('Standard editor keybindings active');
      lines.push('Toggle to vim mode with: vim on');
    }

    return lines.join('\n');
  }

  /**
   * Show current status
   */
  private showStatus(): string {
    const mode = this.editorModeManager.getMode();
    const config = this.editorModeManager.getConfig();
    
    const lines = [
      `Current editor mode: ${mode.toUpperCase()}`,
      ''
    ];

    if (mode === EditorMode.Vim && config.vimConfig) {
      lines.push('Vim Configuration:');
      lines.push(`  Line numbers: ${config.vimConfig.showLineNumbers ? 'on' : 'off'}`);
      lines.push(`  Relative numbers: ${config.vimConfig.relativeNumbers ? 'on' : 'off'}`);
      lines.push(`  Highlight search: ${config.vimConfig.highlightSearch ? 'on' : 'off'}`);
      lines.push(`  Smart indent: ${config.vimConfig.smartIndent ? 'on' : 'off'}`);
      lines.push(`  Expand tab: ${config.vimConfig.expandTab ? 'on' : 'off'}`);
      lines.push(`  Tab stop: ${config.vimConfig.tabStop}`);
      lines.push(`  Shift width: ${config.vimConfig.shiftWidth}`);
    }

    return lines.join('\n');
  }

  /**
   * Manage vim configuration
   */
  private async manageConfig(args: string[]): Promise<string> {
    if (args.length === 0) {
      return this.showStatus();
    }

    const setting = args[0];
    const value = args[1];

    if (!value) {
      return `Error: No value provided for ${setting}`;
    }

    const updates: any = {};

    switch (setting) {
      case 'numbers':
        updates.showLineNumbers = value === 'on';
        break;
      case 'relativenumbers':
        updates.relativeNumbers = value === 'on';
        break;
      case 'hlsearch':
        updates.highlightSearch = value === 'on';
        break;
      case 'smartindent':
        updates.smartIndent = value === 'on';
        break;
      case 'expandtab':
        updates.expandTab = value === 'on';
        break;
      case 'tabstop':
        updates.tabStop = parseInt(value);
        if (isNaN(updates.tabStop)) {
          return `Error: Invalid number for tabstop: ${value}`;
        }
        break;
      case 'shiftwidth':
        updates.shiftWidth = parseInt(value);
        if (isNaN(updates.shiftWidth)) {
          return `Error: Invalid number for shiftwidth: ${value}`;
        }
        break;
      default:
        return `Error: Unknown setting: ${setting}`;
    }

    await this.editorModeManager.updateVimConfig(updates);
    return `Updated ${setting} to ${value}`;
  }

  /**
   * Show help
   */
  private showHelp(): string {
    return `
Vim Command - Toggle vim editing mode

Usage:
  vim                    Toggle between vim and normal mode
  vim on                 Enable vim mode
  vim off                Disable vim mode
  vim status             Show current mode and configuration
  vim config <setting> <value>  Update vim configuration
  vim help               Show this help message

Configuration Settings:
  numbers <on|off>       Show line numbers
  relativenumbers <on|off>  Show relative line numbers
  hlsearch <on|off>      Highlight search results
  smartindent <on|off>   Enable smart indentation
  expandtab <on|off>     Expand tabs to spaces
  tabstop <number>       Number of spaces for tab
  shiftwidth <number>    Number of spaces for indentation

Examples:
  vim                    # Toggle mode
  vim on                 # Enable vim mode
  vim config numbers on  # Show line numbers
  vim config tabstop 2   # Set tab width to 2

Note: Vim mode affects how text editing commands work in the agent.
`.trim();
  }

  /**
   * Get editor mode manager
   */
  getEditorModeManager(): EditorModeManager {
    return this.editorModeManager;
  }
}
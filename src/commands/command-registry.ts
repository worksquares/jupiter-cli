/**
 * Command Registry System
 * Manages and executes commands in the Intelligent Agent System
 */

import { EventEmitter } from 'eventemitter3';
import {
  Command,
  CommandRegistryConfig,
  CommandExecutionResult,
  CommandMetadata,
  CommandContext,
  AdvancedCommand
} from './types';
import { Logger } from '../utils/logger';

/**
 * Registry events
 */
interface CommandRegistryEvents {
  'command:registered': (name: string, command: Command) => void;
  'command:unregistered': (name: string) => void;
  'command:executed': (name: string, result: CommandExecutionResult) => void;
  'command:failed': (name: string, error: Error) => void;
}

/**
 * Command registry implementation
 */
export class CommandRegistry extends EventEmitter<CommandRegistryEvents> {
  private commands: Map<string, Command> = new Map();
  private aliases: Map<string, string> = new Map();
  private config: Required<CommandRegistryConfig>;
  private logger: Logger;
  private executionHistory: CommandExecutionResult[] = [];
  private readonly MAX_HISTORY = 100;

  constructor(config?: CommandRegistryConfig) {
    super();
    this.logger = new Logger('CommandRegistry');
    
    this.config = {
      caseSensitive: config?.caseSensitive ?? false,
      allowOverride: config?.allowOverride ?? false
    };
  }

  /**
   * Register a command
   */
  register(command: Command): void {
    const name = this.normalizeCommandName(command.name);
    
    // Check if already registered
    if (this.commands.has(name) && !this.config.allowOverride) {
      throw new Error(`Command '${command.name}' is already registered`);
    }

    this.commands.set(name, command);
    
    // Register aliases if it's an advanced command
    if (this.isAdvancedCommand(command) && command.metadata.aliases) {
      command.metadata.aliases.forEach(alias => {
        this.aliases.set(this.normalizeCommandName(alias), name);
      });
    }

    this.emit('command:registered', command.name, command);
    this.logger.info(`Registered command: ${command.name}`);
  }

  /**
   * Register multiple commands
   */
  registerAll(commands: Command[]): void {
    commands.forEach(command => this.register(command));
  }

  /**
   * Unregister a command
   */
  unregister(name: string): boolean {
    const normalizedName = this.normalizeCommandName(name);
    const command = this.commands.get(normalizedName);
    
    if (!command) {
      return false;
    }

    this.commands.delete(normalizedName);
    
    // Remove aliases
    if (this.isAdvancedCommand(command) && command.metadata.aliases) {
      command.metadata.aliases.forEach(alias => {
        this.aliases.delete(this.normalizeCommandName(alias));
      });
    }

    // Remove any aliases pointing to this command
    for (const [alias, target] of this.aliases.entries()) {
      if (target === normalizedName) {
        this.aliases.delete(alias);
      }
    }

    this.emit('command:unregistered', name);
    this.logger.info(`Unregistered command: ${name}`);
    return true;
  }

  /**
   * Execute a command
   */
  async execute(commandLine: string, context?: Partial<CommandContext>): Promise<CommandExecutionResult> {
    const startTime = Date.now();
    
    // Parse command line
    const { command, args, flags } = this.parseCommandLine(commandLine);
    
    if (!command) {
      throw new Error('No command specified');
    }

    // Find command
    const cmd = this.getCommand(command);
    if (!cmd) {
      throw new Error(`Unknown command: ${command}`);
    }

    // Build context
    const fullContext: CommandContext = {
      args,
      flags,
      cwd: context?.cwd || process.cwd(),
      env: context?.env || process.env as Record<string, string>,
      userId: context?.userId || 'system',
      sessionId: context?.sessionId || 'default',
      ...context
    };

    try {
      let output: string;

      // Validate if advanced command
      if (this.isAdvancedCommand(cmd)) {
        if (cmd.validate) {
          const isValid = await cmd.validate(fullContext);
          if (!isValid) {
            throw new Error('Command validation failed');
          }
        }
        output = await cmd.executeWithContext(fullContext);
      } else {
        output = await cmd.execute(args);
      }

      const result: CommandExecutionResult = {
        success: true,
        output,
        executionTime: Date.now() - startTime
      };

      this.recordExecution(result);
      this.emit('command:executed', cmd.name, result);
      
      return result;
    } catch (error) {
      const result: CommandExecutionResult = {
        success: false,
        output: '',
        error: error instanceof Error ? error : new Error(String(error)),
        executionTime: Date.now() - startTime
      };

      this.recordExecution(result);
      this.emit('command:failed', cmd.name, result.error!);
      
      return result;
    }
  }

  /**
   * Get command by name
   */
  getCommand(name: string): Command | undefined {
    const normalizedName = this.normalizeCommandName(name);
    
    // Check direct command
    let command = this.commands.get(normalizedName);
    if (command) {
      return command;
    }

    // Check aliases
    const targetName = this.aliases.get(normalizedName);
    if (targetName) {
      return this.commands.get(targetName);
    }

    return undefined;
  }

  /**
   * List all commands
   */
  listCommands(includeHidden: boolean = false): CommandMetadata[] {
    const metadata: CommandMetadata[] = [];

    for (const command of this.commands.values()) {
      if (this.isAdvancedCommand(command)) {
        if (!includeHidden && command.metadata.hidden) {
          continue;
        }
        metadata.push(command.metadata);
      } else {
        metadata.push({
          name: command.name,
          description: command.description
        });
      }
    }

    return metadata.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get command suggestions for partial input
   */
  getSuggestions(partial: string): string[] {
    const normalized = this.normalizeCommandName(partial);
    const suggestions: string[] = [];

    // Check commands
    for (const [name, command] of this.commands.entries()) {
      if (name.startsWith(normalized)) {
        suggestions.push(command.name);
      }
    }

    // Check aliases
    for (const [alias, target] of this.aliases.entries()) {
      if (alias.startsWith(normalized)) {
        const command = this.commands.get(target);
        if (command) {
          suggestions.push(alias);
        }
      }
    }

    return [...new Set(suggestions)].sort();
  }

  /**
   * Get help for a specific command
   */
  getHelp(commandName: string): string {
    const command = this.getCommand(commandName);
    if (!command) {
      return `Unknown command: ${commandName}`;
    }

    const lines: string[] = [];
    
    if (this.isAdvancedCommand(command)) {
      const meta = command.metadata;
      lines.push(`${meta.name} - ${meta.description}`);
      
      if (meta.usage) {
        lines.push('');
        lines.push(`Usage: ${meta.usage}`);
      }

      if (meta.aliases && meta.aliases.length > 0) {
        lines.push('');
        lines.push(`Aliases: ${meta.aliases.join(', ')}`);
      }

      if (meta.examples && meta.examples.length > 0) {
        lines.push('');
        lines.push('Examples:');
        meta.examples.forEach(example => {
          lines.push(`  ${example}`);
        });
      }
    } else {
      lines.push(`${command.name} - ${command.description}`);
    }

    return lines.join('\n');
  }

  /**
   * Get all help
   */
  getAllHelp(): string {
    const lines: string[] = ['Available Commands:', ''];
    
    const commands = this.listCommands();
    const maxNameLength = Math.max(...commands.map(cmd => cmd.name.length));

    commands.forEach(cmd => {
      const padding = ' '.repeat(maxNameLength - cmd.name.length + 2);
      lines.push(`  ${cmd.name}${padding}${cmd.description}`);
    });

    lines.push('');
    lines.push('Use "help <command>" for more information about a specific command.');

    return lines.join('\n');
  }

  /**
   * Get execution history
   */
  getHistory(): CommandExecutionResult[] {
    return [...this.executionHistory];
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory = [];
  }

  /**
   * Parse command line
   */
  private parseCommandLine(commandLine: string): {
    command: string;
    args: string[];
    flags: Record<string, string | boolean>;
  } {
    const parts = this.tokenize(commandLine);
    if (parts.length === 0) {
      return { command: '', args: [], flags: {} };
    }

    const command = parts[0];
    const args: string[] = [];
    const flags: Record<string, string | boolean> = {};

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      
      if (part.startsWith('--')) {
        // Long flag
        const flagName = part.substring(2);
        if (i + 1 < parts.length && !parts[i + 1].startsWith('-')) {
          flags[flagName] = parts[++i];
        } else {
          flags[flagName] = true;
        }
      } else if (part.startsWith('-') && part.length > 1) {
        // Short flags
        for (let j = 1; j < part.length; j++) {
          flags[part[j]] = true;
        }
      } else {
        // Regular argument
        args.push(part);
      }
    }

    return { command, args, flags };
  }

  /**
   * Tokenize command line
   */
  private tokenize(commandLine: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';
    let escape = false;

    for (let i = 0; i < commandLine.length; i++) {
      const char = commandLine[i];

      if (escape) {
        current += char;
        escape = false;
        continue;
      }

      if (char === '\\') {
        escape = true;
        continue;
      }

      if (inQuote) {
        if (char === quoteChar) {
          inQuote = false;
          quoteChar = '';
        } else {
          current += char;
        }
      } else {
        if (char === '"' || char === "'") {
          inQuote = true;
          quoteChar = char;
        } else if (char === ' ' || char === '\t') {
          if (current) {
            tokens.push(current);
            current = '';
          }
        } else {
          current += char;
        }
      }
    }

    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  /**
   * Normalize command name
   */
  private normalizeCommandName(name: string): string {
    return this.config.caseSensitive ? name : name.toLowerCase();
  }

  /**
   * Check if command is advanced
   */
  private isAdvancedCommand(command: Command): command is AdvancedCommand {
    return 'metadata' in command && 'executeWithContext' in command;
  }

  /**
   * Record execution result
   */
  private recordExecution(result: CommandExecutionResult): void {
    this.executionHistory.push(result);
    
    // Limit history size
    if (this.executionHistory.length > this.MAX_HISTORY) {
      this.executionHistory.shift();
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.commands.clear();
    this.aliases.clear();
    this.executionHistory = [];
    this.removeAllListeners();
  }
}
/**
 * Permissions Command
 * User-friendly command interface for managing permission rules
 */

import { Command } from './types';
import { PermissionSystem } from '../security/permission-system';
import { PermissionType, PermissionRule } from '../security/permission-types';

export class PermissionsCommand implements Command {
  name = 'permissions';
  description = 'Manage tool permission rules';

  constructor(private permissionSystem: PermissionSystem) {
  }

  async execute(args: string[]): Promise<string> {
    const subcommand = args[0] || 'list';

    try {
      switch (subcommand) {
        case 'list':
          return this.listRules(args.slice(1));
        
        case 'add':
          return this.addRule(args.slice(1));
        
        case 'remove':
        case 'delete':
          return this.removeRule(args[1]);
        
        case 'enable':
          return this.toggleRule(args[1], true);
        
        case 'disable':
          return this.toggleRule(args[1], false);
        
        case 'workspace':
          return this.manageWorkspace(args.slice(1));
        
        case 'check':
          return this.checkPermission(args.slice(1));
        
        case 'save':
          return this.saveRules();
        
        case 'load':
          return this.loadRules();
        
        case 'help':
        default:
          return this.showHelp();
      }
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * List permission rules
   */
  private async listRules(args: string[]): Promise<string> {
    const filter: any = {};
    
    // Parse filter arguments
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i];
      const value = args[i + 1];
      
      if (key === '--tool') {
        filter.toolName = value;
      } else if (key === '--type') {
        filter.type = value;
      } else if (key === '--source') {
        filter.source = value;
      }
    }

    const rules = this.permissionSystem.listRules(filter);
    
    if (rules.length === 0) {
      return 'No permission rules found.';
    }

    const lines: string[] = ['Permission Rules:', ''];
    
    // Group by type
    const byType = new Map<PermissionType, PermissionRule[]>();
    rules.forEach(rule => {
      const list = byType.get(rule.type) || [];
      list.push(rule);
      byType.set(rule.type, list);
    });

    // Display by type
    for (const [type, typeRules] of byType) {
      lines.push(`${type.toUpperCase()} RULES:`);
      
      typeRules.forEach(rule => {
        const status = rule.enabled ? '✓' : '✗';
        const pattern = rule.pattern ? ` (${rule.pattern})` : '';
        const source = rule.source === 'default' ? ' [default]' : '';
        
        lines.push(`  ${status} [${rule.id.substring(0, 8)}] ${rule.toolName}${pattern} - ${rule.description || 'No description'}${source}`);
        lines.push(`     Priority: ${rule.priority}`);
      });
      
      lines.push('');
    }

    // Summary
    const enabledCount = rules.filter(r => r.enabled).length;
    lines.push(`Total: ${rules.length} rules (${enabledCount} enabled)`);

    // Workspace info
    const workspace = this.permissionSystem.getWorkspace();
    if (workspace) {
      lines.push('');
      lines.push('Workspace Mode: ENABLED');
      lines.push(`  Primary: ${workspace.primaryDirectory}`);
      if (workspace.additionalDirectories.size > 0) {
        lines.push(`  Additional: ${Array.from(workspace.additionalDirectories).join(', ')}`);
      }
      lines.push(`  Subdirectories: ${workspace.allowSubdirectories ? 'Allowed' : 'Not allowed'}`);
      if (workspace.excludePatterns.length > 0) {
        lines.push(`  Exclude: ${workspace.excludePatterns.join(', ')}`);
      }
    } else {
      lines.push('');
      lines.push('Workspace Mode: DISABLED');
    }

    return lines.join('\n');
  }

  /**
   * Add a new rule
   */
  private async addRule(args: string[]): Promise<string> {
    if (args.length < 2) {
      return 'Error: Usage: permissions add <type> <tool> [pattern] [--description "desc"] [--priority N]';
    }

    const type = args[0] as PermissionType;
    const toolName = args[1];
    let pattern: string | undefined;
    let description: string | undefined;
    let priority: number | undefined;

    // Parse optional arguments
    let i = 2;
    if (i < args.length && !args[i].startsWith('--')) {
      pattern = args[i];
      i++;
    }

    while (i < args.length) {
      if (args[i] === '--description' && i + 1 < args.length) {
        description = args[i + 1];
        i += 2;
      } else if (args[i] === '--priority' && i + 1 < args.length) {
        priority = parseInt(args[i + 1]);
        i += 2;
      } else {
        i++;
      }
    }

    // Validate type
    if (!Object.values(PermissionType).includes(type)) {
      return `Error: Invalid permission type. Must be one of: ${Object.values(PermissionType).join(', ')}`;
    }

    const rule = await this.permissionSystem.addRule({
      type,
      toolName,
      pattern,
      description,
      priority
    });

    return `Added permission rule ${rule.id.substring(0, 8)}: ${type} ${toolName}${pattern ? ` (${pattern})` : ''}`;
  }

  /**
   * Remove a rule
   */
  private async removeRule(ruleId: string): Promise<string> {
    if (!ruleId) {
      return 'Error: No rule ID provided. Usage: permissions remove <rule-id>';
    }

    // Find full ID from short ID
    const fullId = this.findRuleByShortId(ruleId);
    if (!fullId) {
      return `Error: Rule not found: ${ruleId}`;
    }

    await this.permissionSystem.removeRule(fullId);
    return `Removed permission rule ${ruleId}`;
  }

  /**
   * Toggle rule enabled state
   */
  private async toggleRule(ruleId: string, enabled: boolean): Promise<string> {
    if (!ruleId) {
      return `Error: No rule ID provided. Usage: permissions ${enabled ? 'enable' : 'disable'} <rule-id>`;
    }

    // Find full ID from short ID
    const fullId = this.findRuleByShortId(ruleId);
    if (!fullId) {
      return `Error: Rule not found: ${ruleId}`;
    }

    await this.permissionSystem.updateRule(fullId, { enabled });
    return `${enabled ? 'Enabled' : 'Disabled'} permission rule ${ruleId}`;
  }

  /**
   * Manage workspace
   */
  private async manageWorkspace(args: string[]): Promise<string> {
    const action = args[0] || 'show';

    switch (action) {
      case 'set': {
        if (args.length < 2) {
          return 'Error: Usage: permissions workspace set <directory> [--additional dir1,dir2] [--subdirs] [--exclude pattern1,pattern2]';
        }

        const primaryDirectory = args[1];
        const additionalDirectories = new Set<string>();
        let allowSubdirectories = false;
        const excludePatterns: string[] = [];

        // Parse options
        for (let i = 2; i < args.length; i += 2) {
          const key = args[i];
          const value = args[i + 1];

          if (key === '--additional' && value) {
            value.split(',').forEach(dir => additionalDirectories.add(dir.trim()));
          } else if (key === '--subdirs') {
            allowSubdirectories = true;
            i--; // No value for this flag
          } else if (key === '--exclude' && value) {
            value.split(',').forEach(pattern => excludePatterns.push(pattern.trim()));
          }
        }

        await this.permissionSystem.setWorkspace({
          primaryDirectory,
          additionalDirectories,
          allowSubdirectories,
          excludePatterns
        });

        return `Set workspace to ${primaryDirectory}${additionalDirectories.size > 0 ? ` (+${additionalDirectories.size} additional)` : ''}`;
      }

      case 'clear': {
        this.permissionSystem.clearWorkspace();
        return 'Cleared workspace configuration';
      }

      case 'show':
      default: {
        const workspace = this.permissionSystem.getWorkspace();
        if (!workspace) {
          return 'No workspace configured';
        }

        const lines = [
          'Workspace Configuration:',
          `  Primary: ${workspace.primaryDirectory}`,
        ];

        if (workspace.additionalDirectories.size > 0) {
          lines.push(`  Additional: ${Array.from(workspace.additionalDirectories).join(', ')}`);
        }

        lines.push(`  Subdirectories: ${workspace.allowSubdirectories ? 'Allowed' : 'Not allowed'}`);

        if (workspace.excludePatterns.length > 0) {
          lines.push(`  Exclude: ${workspace.excludePatterns.join(', ')}`);
        }

        return lines.join('\n');
      }
    }
  }

  /**
   * Check permission for a tool
   */
  private async checkPermission(args: string[]): Promise<string> {
    if (args.length < 1) {
      return 'Error: Usage: permissions check <tool> [parameters...]';
    }

    const toolName = args[0];
    const parameters: any = {};

    // Parse parameters
    for (let i = 1; i < args.length; i += 2) {
      if (i + 1 < args.length) {
        const key = args[i].replace(/^--/, '');
        const value = args[i + 1];
        parameters[key] = value;
      }
    }

    const behavior = await this.permissionSystem.getToolBehavior(toolName, parameters);
    
    const lines = [
      `Permission check for tool: ${toolName}`,
      `Behavior: ${behavior.behavior.toUpperCase()}`,
    ];

    if (behavior.message) {
      lines.push(`Message: ${behavior.message}`);
    }

    if (behavior.rule) {
      lines.push(`Rule: [${behavior.rule.id.substring(0, 8)}] ${behavior.rule.description || 'No description'}`);
    }

    if (behavior.suggestions && behavior.suggestions.length > 0) {
      lines.push('');
      lines.push('Suggestions:');
      behavior.suggestions.forEach(s => lines.push(`  - ${s}`));
    }

    return lines.join('\n');
  }

  /**
   * Save rules to file
   */
  private async saveRules(): Promise<string> {
    await this.permissionSystem.saveRules();
    return 'Saved permission rules to file';
  }

  /**
   * Load rules from file
   */
  private async loadRules(): Promise<string> {
    await this.permissionSystem.loadRules();
    return 'Loaded permission rules from file';
  }

  /**
   * Show help
   */
  private showHelp(): string {
    return `
Permissions Command - Manage tool permission rules

Usage:
  permissions [subcommand] [args]

Subcommands:
  list [--tool <name>] [--type <type>] [--source <source>]
    List all permission rules with optional filters

  add <type> <tool> [pattern] [--description "desc"] [--priority N]
    Add a new permission rule
    Types: allow, deny, workspace
    
  remove <rule-id>
    Remove a permission rule

  enable <rule-id>
    Enable a permission rule

  disable <rule-id>
    Disable a permission rule

  workspace set <directory> [options]
    Set workspace directory for file operations
    Options:
      --additional dir1,dir2  Additional allowed directories
      --subdirs              Allow subdirectories
      --exclude pat1,pat2    Exclude patterns

  workspace clear
    Clear workspace configuration

  workspace show
    Show current workspace configuration

  check <tool> [--param value ...]
    Check permission for a tool with parameters

  save
    Save rules to file

  load
    Load rules from file

  help
    Show this help message

Examples:
  permissions list                              # List all rules
  permissions add deny bash "rm -rf /*"         # Deny dangerous command
  permissions add allow webFetch                # Allow all webFetch
  permissions add deny webFetch "domain:localhost"  # Deny localhost
  permissions workspace set /home/project --subdirs
  permissions check bash --command "ls -la"
  permissions disable abc12345                  # Disable rule by ID

Note: Rule IDs can be shortened to the first 8 characters.
`.trim();
  }

  /**
   * Find rule by short ID
   */
  private findRuleByShortId(shortId: string): string | null {
    const rules = this.permissionSystem.listRules();
    const matches = rules.filter(r => r.id.startsWith(shortId));
    
    if (matches.length === 1) {
      return matches[0].id;
    } else if (matches.length > 1) {
      throw new Error(`Ambiguous rule ID: ${shortId} matches ${matches.length} rules`);
    }
    
    return null;
  }
}
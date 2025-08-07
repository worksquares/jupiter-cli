/**
 * Hook Security Validator
 * Validates hook commands for security risks and dangerous patterns
 */

import { HookConfiguration, HookSecurityValidation } from './types';

/**
 * Dangerous command patterns that should be blocked or warned about
 */
const DANGEROUS_PATTERNS = [
  // Direct file system destruction
  { pattern: /\brm\s+-rf\s+\//, risk: 'critical', message: 'Destructive rm -rf on root filesystem' },
  { pattern: /\brm\s+-rf\s+~/, risk: 'high', message: 'Destructive rm -rf on home directory' },
  { pattern: /\brm\s+-rf\s+\*/, risk: 'high', message: 'Destructive rm -rf with wildcard' },
  { pattern: /\b(dd|mkfs|fdisk|parted)\s+/, risk: 'critical', message: 'Disk manipulation command' },
  
  // Privilege escalation
  { pattern: /\bsudo\b/, risk: 'high', message: 'Using sudo - hooks run with your user permissions' },
  { pattern: /\bsu\s+/, risk: 'high', message: 'Switching user context' },
  { pattern: /\bchmod\s+777/, risk: 'high', message: 'Setting overly permissive file permissions' },
  { pattern: /\bchown\s+/, risk: 'medium', message: 'Changing file ownership' },
  
  // Network and data exfiltration
  { pattern: /curl.*\|\s*(sh|bash)/, risk: 'critical', message: 'Downloading and executing remote code' },
  { pattern: /wget.*\|\s*(sh|bash)/, risk: 'critical', message: 'Downloading and executing remote code' },
  { pattern: /nc\s+-l/, risk: 'high', message: 'Opening network listener' },
  { pattern: /\bssh\s+/, risk: 'medium', message: 'SSH connection to remote host' },
  { pattern: /\brsync\s+/, risk: 'medium', message: 'Syncing files to remote location' },
  
  // System modification
  { pattern: /\b(systemctl|service)\s+(stop|disable)/, risk: 'high', message: 'Stopping system services' },
  { pattern: /\bkill\s+-9/, risk: 'medium', message: 'Force killing processes' },
  { pattern: /\bpkill\s+/, risk: 'medium', message: 'Killing processes by name' },
  { pattern: /\/etc\/(passwd|shadow|sudoers)/, risk: 'critical', message: 'Accessing system authentication files' },
  
  // Shell injection risks
  { pattern: /\$\(.*\)/, risk: 'medium', message: 'Command substitution - potential injection risk' },
  { pattern: /`.*`/, risk: 'medium', message: 'Backtick command substitution - potential injection risk' },
  { pattern: /eval\s+/, risk: 'high', message: 'Using eval - high injection risk' },
  
  // Path traversal
  { pattern: /\.\.\//, risk: 'medium', message: 'Path traversal pattern detected' },
  
  // Cryptocurrency mining
  { pattern: /\b(xmrig|cgminer|bfgminer|minerd)\b/, risk: 'critical', message: 'Cryptocurrency mining software' },
  
  // Sensitive file access
  { pattern: /\/(\.ssh|\.aws|\.docker|\.kube)\//, risk: 'high', message: 'Accessing sensitive configuration directory' },
  { pattern: /\b(private.*key|secret|password|token|credential)/i, risk: 'medium', message: 'Accessing potentially sensitive files' }
];

/**
 * Safe command patterns that are generally acceptable
 */
const SAFE_PATTERNS = [
  /^echo\s+/,
  /^jq\s+/,
  /^cat\s+/,
  /^grep\s+/,
  /^awk\s+/,
  /^sed\s+/,
  /^wc\s+/,
  /^date\s*/,
  /^pwd$/,
  /^ls\s+/,
  /^find\s+.*-name/,
  /^test\s+/,
  /^\[\[.*\]\]$/
];

/**
 * Environment variables that should not be accessed
 */
const SENSITIVE_ENV_VARS = [
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'GITHUB_TOKEN',
  'NPM_TOKEN',
  'DATABASE_PASSWORD',
  'API_KEY',
  'PRIVATE_KEY',
  'SECRET_KEY'
];

export class HookSecurityValidator {
  /**
   * Validate a hook configuration for security risks
   */
  validateHook(hook: HookConfiguration): HookSecurityValidation {
    const warnings: string[] = [];
    const errors: string[] = [];
    let maxRiskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Check command length
    if (hook.command.length > 5000) {
      errors.push('Command is too long (max 5000 characters)');
    }

    // Check for empty command
    if (hook.command.trim().length === 0) {
      errors.push('Command cannot be empty');
    }

    // Check for dangerous patterns
    for (const { pattern, risk, message } of DANGEROUS_PATTERNS) {
      if (pattern.test(hook.command)) {
        if (risk === 'critical') {
          errors.push(`Critical security risk: ${message}`);
        } else {
          warnings.push(`${risk.toUpperCase()} risk: ${message}`);
        }
        maxRiskLevel = this.getHigherRisk(maxRiskLevel, risk as 'low' | 'medium' | 'high' | 'critical');
      }
    }

    // Check for relative paths in executables
    const executablePattern = /^([^\/~\s]+)(\/[^\s]*)?(\s|$)/;
    const match = hook.command.match(executablePattern);
    if (match && match[1] && !this.isBuiltinCommand(match[1])) {
      warnings.push('Using relative path for executable - consider using absolute path');
      maxRiskLevel = this.getHigherRisk(maxRiskLevel, 'medium');
    }

    // Check for sensitive environment variable access
    for (const envVar of SENSITIVE_ENV_VARS) {
      if (hook.command.includes(`$${envVar}`) || hook.command.includes(`\${${envVar}}`)) {
        warnings.push(`Accessing sensitive environment variable: ${envVar}`);
        maxRiskLevel = this.getHigherRisk(maxRiskLevel, 'high');
      }
    }

    // Check for unquoted variable expansion
    const unquotedVarPattern = /\$[A-Za-z_][A-Za-z0-9_]*(?!["'}])/;
    if (unquotedVarPattern.test(hook.command)) {
      warnings.push('Unquoted variable expansion - use "$VAR" instead of $VAR');
      maxRiskLevel = this.getHigherRisk(maxRiskLevel, 'medium');
    }

    // Check for output redirection to sensitive locations
    const sensitiveRedirectPattern = />\s*(\/etc|\/sys|\/boot|~\/\.(ssh|aws))/;
    if (sensitiveRedirectPattern.test(hook.command)) {
      errors.push('Output redirection to sensitive system location');
      maxRiskLevel = 'critical';
    }

    // Check if command matches safe patterns
    let matchesSafePattern = false;
    for (const safePattern of SAFE_PATTERNS) {
      if (safePattern.test(hook.command)) {
        matchesSafePattern = true;
        break;
      }
    }

    if (matchesSafePattern && warnings.length === 0) {
      maxRiskLevel = 'low';
    }

    // Special validation for specific hook events
    this.validateEventSpecific(hook, warnings, errors);

    return {
      valid: errors.length === 0,
      warnings,
      errors,
      riskLevel: maxRiskLevel
    };
  }

  /**
   * Validate multiple hooks
   */
  validateHooks(hooks: HookConfiguration[]): Map<string, HookSecurityValidation> {
    const results = new Map<string, HookSecurityValidation>();
    
    for (const hook of hooks) {
      results.set(hook.id, this.validateHook(hook));
    }

    return results;
  }

  /**
   * Check if a command is a shell builtin
   */
  private isBuiltinCommand(command: string): boolean {
    const builtins = [
      'echo', 'cd', 'pwd', 'export', 'unset', 'alias', 'unalias',
      'history', 'exit', 'source', '.', 'true', 'false', 'test',
      '[', '[[', 'read', 'printf', 'let', 'declare', 'typeset',
      'local', 'return', 'break', 'continue', 'shift', 'exec',
      'fg', 'bg', 'jobs', 'kill', 'wait', 'suspend', 'logout',
      'times', 'type', 'hash', 'help', 'builtin', 'command'
    ];
    
    return builtins.includes(command);
  }

  /**
   * Get the higher risk level between two
   */
  private getHigherRisk(
    current: 'low' | 'medium' | 'high' | 'critical',
    new_: 'low' | 'medium' | 'high' | 'critical'
  ): 'low' | 'medium' | 'high' | 'critical' {
    const riskOrder = { low: 0, medium: 1, high: 2, critical: 3 };
    return riskOrder[new_] > riskOrder[current] ? new_ : current;
  }

  /**
   * Event-specific validation
   */
  private validateEventSpecific(
    hook: HookConfiguration,
    warnings: string[],
    errors: string[]
  ): void {
    switch (hook.event) {
      case 'PreToolUse':
        // Validate tool matcher if present
        if (hook.matcher) {
          try {
            new RegExp(hook.matcher);
          } catch {
            errors.push('Invalid regex pattern in tool matcher');
          }
        }
        break;

      case 'UserPromptSubmit':
        // Warn about modifying user input
        if (hook.command.includes('exit 2')) {
          warnings.push('This hook can block user prompts - ensure this is intended');
        }
        break;

      case 'PreCompact':
        // Warn about blocking compaction
        if (hook.command.includes('exit 2')) {
          warnings.push('This hook can block conversation compaction - may affect memory usage');
        }
        break;
    }
  }

  /**
   * Generate security recommendations for a command
   */
  generateRecommendations(command: string): string[] {
    const recommendations: string[] = [];

    // Check for unquoted variables
    if (/\$[A-Za-z_]/.test(command) && !/"\$[A-Za-z_][^"]*"/.test(command)) {
      recommendations.push('Quote all variable expansions: use "$VAR" instead of $VAR');
    }

    // Check for relative paths
    if (/^[^\/~\s]+\//.test(command)) {
      recommendations.push('Use absolute paths for scripts (~/scripts/check.sh not check.sh)');
    }

    // Check for curl/wget without validation
    if (/\b(curl|wget)\b/.test(command) && !/\b(curl|wget).*(-f|--fail)/.test(command)) {
      recommendations.push('Add --fail flag to curl/wget to handle HTTP errors properly');
    }

    // Check for missing error handling
    if (command.includes('|') && !command.includes('set -e') && !command.includes('|| ')) {
      recommendations.push('Consider adding error handling with || or set -e');
    }

    // Check for temporary file usage
    if (/\/tmp\//.test(command) && !/mktemp/.test(command)) {
      recommendations.push('Use mktemp for creating temporary files safely');
    }

    return recommendations;
  }

  /**
   * Sanitize a hook command (remove obviously dangerous parts)
   */
  sanitizeCommand(command: string): string {
    let sanitized = command;

    // Remove sudo
    sanitized = sanitized.replace(/\bsudo\s+/g, '');

    // Remove dangerous rm commands
    sanitized = sanitized.replace(/\brm\s+-rf\s+\//g, 'echo "Blocked: rm -rf /"');

    // Remove eval
    sanitized = sanitized.replace(/\beval\s+/g, 'echo "Blocked: eval" #');

    return sanitized;
  }
}
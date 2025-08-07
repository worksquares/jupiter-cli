/**
 * Security Validator - Validates and enforces security policies
 */

import { Task, Tool, SecurityConfig, AgentError, ErrorCode } from '../core/types';
import { Logger } from './logger';
import * as path from 'path';

export class SecurityValidator {
  private config: SecurityConfig;
  private logger: Logger;
  private _allowedPaths: Set<string>;
  private deniedPaths: Set<string>;
  private sensitivePatterns: RegExp[];

  constructor(config: SecurityConfig) {
    this.config = config;
    this.logger = new Logger('SecurityValidator');
    this._allowedPaths = new Set();
    this.deniedPaths = new Set([
      '/etc',
      '/System',
      '/Windows/System32',
      process.env.HOME + '/.ssh',
      process.env.HOME + '/.aws',
      process.env.HOME + '/.config'
    ]);
    
    this.sensitivePatterns = [
      /api[_-]?key/i,
      /api[_-]?secret/i,
      /password/i,
      /passwd/i,
      /private[_-]?key/i,
      /access[_-]?token/i,
      /auth[_-]?token/i,
      /bearer/i,
      /credentials/i,
      /secret/i,
      /\\bkey\\b/i,
      /\\btoken\\b/i
    ];
  }

  /**
   * Validate a task
   */
  validateTask(task: Task): void {
    this.logger.debug(`Validating task: ${task.id}`);

    // Check task description for malicious patterns
    this.checkForMaliciousPatterns(task.description);

    // Validate file paths
    if (task.context.files) {
      for (const file of task.context.files) {
        this.validateFilePath(file);
      }
    }

    // Check for command injection attempts
    if (task.description.includes('$(') || 
        task.description.includes('`') ||
        task.description.includes('&&') ||
        task.description.includes('||') ||
        task.description.includes(';')) {
      throw new AgentError(
        'Potential command injection detected',
        ErrorCode.SECURITY_ERROR
      );
    }
  }

  /**
   * Validate a tool
   */
  validateTool(tool: Tool): void {
    // Check if tool is allowed
    if (this.config.allowedTools.length > 0 && 
        !this.config.allowedTools.includes(tool.name)) {
      throw new AgentError(
        `Tool not allowed: ${tool.name}`,
        ErrorCode.SECURITY_ERROR
      );
    }

    // Check if tool is denied
    if (this.config.deniedTools.includes(tool.name)) {
      throw new AgentError(
        `Tool is denied: ${tool.name}`,
        ErrorCode.SECURITY_ERROR
      );
    }
  }

  /**
   * Validate tool execution
   */
  validateToolExecution(tool: Tool, params: any): boolean {
    this.logger.debug(`Validating tool execution: ${tool.name}`);

    try {
      // Validate based on tool type
      switch (tool.name) {
        case 'bash':
          this.validateBashCommand(params.command);
          break;
        
        case 'read':
        case 'write':
      case 'edit':
      case 'multiEdit':
        if (params.file_path || params.path) {
          this.validateFilePath(params.file_path || params.path);
        }
        break;
      
      case 'webFetch':
        this.validateUrl(params.url);
        break;
      }

      // Check for sensitive data in parameters
      this.checkForSensitiveData(params);
      
      return true;
    } catch (error) {
      this.logger.warn('Tool validation failed', error);
      return false;
    }
  }

  /**
   * Validate file path
   */
  validateFilePath(filePath: string): void {
    const normalized = path.normalize(filePath);
    const absolute = path.isAbsolute(normalized) ? normalized : path.resolve(normalized);

    // Check if path is in denied list
    for (const denied of this.deniedPaths) {
      if (absolute.startsWith(denied)) {
        throw new AgentError(
          `Access denied to path: ${filePath}`,
          ErrorCode.SECURITY_ERROR
        );
      }
    }

    // Check for path traversal
    if (filePath.includes('..')) {
      throw new AgentError(
        'Path traversal detected',
        ErrorCode.SECURITY_ERROR
      );
    }

    // Check file size if reading
    if (this.config.maxFileSize) {
      // This would need actual file system check
      // For now, just validate the path format
    }

    // Check file type
    if (this.config.allowedFileTypes && this.config.allowedFileTypes.length > 0) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext && !this.config.allowedFileTypes.includes(ext)) {
        throw new AgentError(
          `File type not allowed: ${ext}`,
          ErrorCode.SECURITY_ERROR
        );
      }
    }
  }

  /**
   * Validate bash command
   */
  private validateBashCommand(command: string): void {
    if (!command) return;

    // Dangerous commands
    const dangerousCommands = [
      'rm -rf',
      'format',
      'del /f',
      'chmod 777',
      'curl.*\\|.*sh',
      'wget.*\\|.*sh',
      'eval',
      'exec'
    ];

    for (const dangerous of dangerousCommands) {
      if (new RegExp(dangerous, 'i').test(command)) {
        throw new AgentError(
          `Dangerous command detected: ${dangerous}`,
          ErrorCode.SECURITY_ERROR
        );
      }
    }

    // Check for command chaining that could be malicious
    const chainOperators = ['&&', '||', ';', '|', '$(', '`'];
    const chainCount = chainOperators.reduce((count, op) => 
      count + (command.split(op).length - 1), 0
    );

    if (chainCount > 2) {
      throw new AgentError(
        'Complex command chaining detected',
        ErrorCode.SECURITY_ERROR
      );
    }

    // Check for output redirection to sensitive locations
    if (command.includes('>')) {
      const parts = command.split('>');
      if (parts.length > 1) {
        const outputPath = parts[1].trim().split(' ')[0];
        this.validateFilePath(outputPath);
      }
    }
  }

  /**
   * Validate URL
   */
  private validateUrl(url: string): void {
    try {
      const parsed = new URL(url);

      // Check protocol
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new AgentError(
          `Invalid protocol: ${parsed.protocol}`,
          ErrorCode.SECURITY_ERROR
        );
      }

      // Check for local addresses
      const hostname = parsed.hostname.toLowerCase();
      if (hostname === 'localhost' || 
          hostname === '127.0.0.1' ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname.startsWith('172.')) {
        throw new AgentError(
          'Access to local addresses not allowed',
          ErrorCode.SECURITY_ERROR
        );
      }

      // Check for SSRF patterns
      if (hostname.includes('metadata') || 
          hostname.includes('instance-data')) {
        throw new AgentError(
          'Potential SSRF detected',
          ErrorCode.SECURITY_ERROR
        );
      }
    } catch (error) {
      if (error instanceof AgentError) throw error;
      
      throw new AgentError(
        'Invalid URL',
        ErrorCode.SECURITY_ERROR
      );
    }
  }

  /**
   * Check for malicious patterns
   */
  private checkForMaliciousPatterns(text: string): void {
    // SQL injection patterns
    const sqlPatterns = [
      /union.*select/i,
      /drop.*table/i,
      /insert.*into/i,
      /delete.*from/i,
      /update.*set/i,
      /;.*--/
    ];

    for (const pattern of sqlPatterns) {
      if (pattern.test(text)) {
        throw new AgentError(
          'Potential SQL injection detected',
          ErrorCode.SECURITY_ERROR
        );
      }
    }

    // XSS patterns
    const xssPatterns = [
      /<script[\s\S]*?>/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe/i
    ];

    for (const pattern of xssPatterns) {
      if (pattern.test(text)) {
        throw new AgentError(
          'Potential XSS detected',
          ErrorCode.SECURITY_ERROR
        );
      }
    }
  }

  /**
   * Check for sensitive data
   */
  private checkForSensitiveData(data: any): void {
    const text = JSON.stringify(data);

    for (const pattern of this.sensitivePatterns) {
      if (pattern.test(text)) {
        // Check if it's actually a sensitive value
        const matches = text.match(pattern);
        if (matches) {
          // Look for actual secret patterns nearby
          const context = text.substring(
            Math.max(0, text.indexOf(matches[0]) - 50),
            Math.min(text.length, text.indexOf(matches[0]) + 50)
          );

          // Common secret patterns
          if (/[A-Za-z0-9+\/]{32,}/.test(context) || // Base64
              /[a-f0-9]{32,}/.test(context) || // Hex
              /sk_[a-zA-Z0-9]{32,}/.test(context) || // Stripe
              /ghp_[a-zA-Z0-9]{36,}/.test(context)) { // GitHub
            throw new AgentError(
              'Potential sensitive data detected',
              ErrorCode.SECURITY_ERROR
            );
          }
        }
      }
    }
  }

  /**
   * Sanitize output
   */
  sanitizeOutput(output: any): any {
    if (typeof output === 'string') {
      // Remove potential secrets
      let sanitized = output;
      
      // Replace common secret patterns
      sanitized = sanitized.replace(/api[_-]?key[\"\'\\s]*[:=][\"\'\\s]*[^\"\'\s]+/gi, 'api_key=***');
      sanitized = sanitized.replace(/password[\"\'\\s]*[:=][\"\'\\s]*[^\"\'\s]+/gi, 'password=***');
      sanitized = sanitized.replace(/token[\"\'\\s]*[:=][\"\'\\s]*[^\"\'\s]+/gi, 'token=***');
      
      // Replace potential credit card numbers
      sanitized = sanitized.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '****-****-****-****');
      
      // Replace potential SSNs
      sanitized = sanitized.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '***-**-****');
      
      return sanitized;
    }
    
    if (typeof output === 'object' && output !== null) {
      const sanitized: any = Array.isArray(output) ? [] : {};
      
      for (const key in output) {
        // Check if key contains sensitive patterns
        const lowerKey = key.toLowerCase();
        if (this.sensitivePatterns.some(pattern => pattern.test(lowerKey))) {
          sanitized[key] = '***';
        } else {
          sanitized[key] = this.sanitizeOutput(output[key]);
        }
      }
      
      return sanitized;
    }
    
    return output;
  }

  /**
   * Check if operation is allowed in sandbox
   */
  isAllowedInSandbox(operation: string): boolean {
    if (!this.config.sandboxed) return true;

    const deniedInSandbox = [
      'network_access',
      'file_system_write',
      'process_spawn',
      'system_info'
    ];

    return !deniedInSandbox.includes(operation);
  }

  /**
   * Validate file content before writing
   */
  validateFileContent(content: string, filePath: string): void {
    // Check for executable content
    if (filePath.endsWith('.sh') || filePath.endsWith('.bat') || filePath.endsWith('.exe')) {
      this.validateExecutableContent(content);
    }

    // Check for sensitive data
    this.checkForSensitiveData(content);

    // Check file size
    if (this.config.maxFileSize && content.length > this.config.maxFileSize) {
      throw new AgentError(
        `File size exceeds limit: ${content.length} > ${this.config.maxFileSize}`,
        ErrorCode.SECURITY_ERROR
      );
    }
  }

  /**
   * Validate executable content
   */
  private validateExecutableContent(content: string): void {
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,
      /:(){ :|:& };:/,  // Fork bomb
      /nc\s+-e/,  // Netcat reverse shell
      /\/dev\/tcp\//,  // Bash reverse shell
      /chmod\s+777/,
      /curl.*\|.*sh/,
      /wget.*\|.*sh/
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(content)) {
        throw new AgentError(
          'Dangerous executable content detected',
          ErrorCode.SECURITY_ERROR
        );
      }
    }
  }
}
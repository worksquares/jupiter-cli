/**
 * Centralized Environment Configuration with Validation
 * Ensures all required environment variables are properly validated
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

export interface EnvironmentConfig {
  // Server Configuration
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
  
  // Security Configuration
  jwtSecret: string;
  credentialEncryptionKey: string;
  apiKeys: string[];
  allowedOrigins: string[];
  
  // Azure Configuration
  azureSubscriptionId: string;
  azureResourceGroup: string;
  azureContainerRegistry: string;
  azureContainerRegistryUsername: string;
  azureContainerRegistryPassword: string;
  azureStorageConnectionString?: string;
  
  // Database Configuration
  dbHost: string;
  dbUser: string;
  dbPassword: string;
  dbName: string;
  dbPort: number;
  
  // GitHub Configuration
  githubToken: string;
  githubOrg: string;
  
  // CosmosAPI Configuration
  cosmosApiKey: string;
  cosmosApiUrl: string;
  
  // Logging Configuration
  logLevel: string;
  
  // Application Paths
  homeDir: string;
  dataDir: string;
}

class EnvironmentValidator {
  private static instance: EnvironmentValidator;
  private config: EnvironmentConfig | null = null;
  private logger = Logger.getInstance().child({ component: 'EnvironmentValidator' });
  
  private constructor() {}
  
  static getInstance(): EnvironmentValidator {
    if (!this.instance) {
      this.instance = new EnvironmentValidator();
    }
    return this.instance;
  }
  
  /**
   * Load and validate environment configuration
   */
  loadConfig(): EnvironmentConfig {
    if (this.config) {
      return this.config;
    }
    
    // Load .env file if it exists
    this.loadEnvFile();
    
    // Validate and build configuration
    this.config = {
      // Server Configuration
      port: this.getNumber('PORT', 3000),
      nodeEnv: this.getEnum('NODE_ENV', ['development', 'test', 'production'], 'development') as any,
      
      // Security Configuration
      jwtSecret: this.getRequiredString('JWT_SECRET', this.generateSecureSecret('jwt')),
      credentialEncryptionKey: this.getRequiredString('CREDENTIAL_ENCRYPTION_KEY', this.generateSecureSecret('encryption')),
      apiKeys: this.getStringArray('API_KEYS', []),
      allowedOrigins: this.getStringArray('ALLOWED_ORIGINS', ['http://localhost:3000']),
      
      // Azure Configuration
      azureSubscriptionId: this.getRequiredString('AZURE_SUBSCRIPTION_ID'),
      azureResourceGroup: this.getRequiredString('AZURE_RESOURCE_GROUP'),
      azureContainerRegistry: this.getRequiredString('AZURE_CONTAINER_REGISTRY'),
      azureContainerRegistryUsername: this.getRequiredString('AZURE_CONTAINER_REGISTRY_USERNAME'),
      azureContainerRegistryPassword: this.getRequiredString('AZURE_CONTAINER_REGISTRY_PASSWORD'),
      azureStorageConnectionString: this.getString('AZURE_STORAGE_CONNECTION_STRING'),
      
      // Database Configuration
      dbHost: this.getRequiredString('DB_HOST'),
      dbUser: this.getRequiredString('DB_USER'),
      dbPassword: this.getRequiredString('DB_PASSWORD'),
      dbName: this.getRequiredString('DB_NAME'),
      dbPort: this.getNumber('DB_PORT', 3306),
      
      // GitHub Configuration
      githubToken: this.getRequiredString('GITHUB_TOKEN'),
      githubOrg: this.getString('GITHUB_ORG', 'default-org') || 'default-org',
      
      // CosmosAPI Configuration
      cosmosApiKey: this.getRequiredString('COSMOSAPI_KEY'),
      cosmosApiUrl: this.getString('COSMOSAPI_URL', 'https://cosmosapi.digisquares.com') || 'https://cosmosapi.digisquares.com',
      
      // Logging Configuration
      logLevel: this.getString('LOG_LEVEL', 'info') || 'info',
      
      // Application Paths
      homeDir: this.getHomeDir(),
      dataDir: this.getDataDir()
    };
    
    // Validate critical security configurations
    this.validateSecurityConfig();
    
    this.logger.info('Environment configuration loaded successfully');
    return this.config;
  }
  
  /**
   * Get the validated configuration
   */
  getConfig(): EnvironmentConfig {
    if (!this.config) {
      throw new Error('Environment configuration not loaded. Call loadConfig() first.');
    }
    return this.config;
  }
  
  /**
   * Load .env file if it exists
   */
  private loadEnvFile(): void {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
      this.logger.info('Loaded .env file', { path: envPath });
    }
  }
  
  /**
   * Get required string from environment
   */
  private getRequiredString(key: string, defaultValue?: string): string {
    const value = process.env[key] || defaultValue;
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  }
  
  /**
   * Get optional string from environment
   */
  private getString(key: string, defaultValue?: string): string | undefined {
    return process.env[key] || defaultValue;
  }
  
  /**
   * Get number from environment
   */
  private getNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (!value) return defaultValue;
    
    const num = parseInt(value, 10);
    if (isNaN(num)) {
      throw new Error(`Environment variable ${key} must be a number, got: ${value}`);
    }
    return num;
  }
  
  /**
   * Get string array from environment (comma-separated)
   */
  private getStringArray(key: string, defaultValue: string[]): string[] {
    const value = process.env[key];
    if (!value) return defaultValue;
    
    return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
  }
  
  /**
   * Get enum value from environment
   */
  private getEnum<T extends string>(key: string, validValues: T[], defaultValue: T): T {
    const value = (process.env[key] || defaultValue) as T;
    if (!validValues.includes(value)) {
      throw new Error(`Environment variable ${key} must be one of: ${validValues.join(', ')}, got: ${value}`);
    }
    return value;
  }
  
  /**
   * Generate a secure secret if not provided
   */
  private generateSecureSecret(type: string): string {
    const secretFile = path.join(this.getDataDir(), `.${type}-secret`);
    
    // Check if secret already exists
    if (fs.existsSync(secretFile)) {
      try {
        const secret = fs.readFileSync(secretFile, 'utf8').trim();
        if (secret) {
          this.logger.info(`Loaded ${type} secret from file`);
          return secret;
        }
      } catch (error) {
        this.logger.warn(`Failed to read ${type} secret file`, error);
      }
    }
    
    // Generate new secret
    const secret = crypto.randomBytes(32).toString('hex');
    
    // Save for future use
    try {
      fs.mkdirSync(path.dirname(secretFile), { recursive: true });
      fs.writeFileSync(secretFile, secret, { mode: 0o600 });
      this.logger.warn(`Generated new ${type} secret and saved to file`);
    } catch (error) {
      this.logger.error(`Failed to save ${type} secret`, error);
    }
    
    return secret;
  }
  
  /**
   * Get home directory
   */
  private getHomeDir(): string {
    return process.env.HOME || process.env.USERPROFILE || '';
  }
  
  /**
   * Get data directory for application
   */
  private getDataDir(): string {
    const homeDir = this.getHomeDir();
    if (process.platform === 'win32') {
      return path.join(process.env.APPDATA || homeDir, 'intelligent-agent-system');
    }
    return path.join(homeDir, '.intelligent-agent-system');
  }
  
  /**
   * Validate security configuration
   */
  private validateSecurityConfig(): void {
    if (!this.config) return;
    
    // Check JWT secret strength
    if (this.config.jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long');
    }
    
    // Check encryption key strength
    if (this.config.credentialEncryptionKey.length < 32) {
      throw new Error('CREDENTIAL_ENCRYPTION_KEY must be at least 32 characters long');
    }
    
    // Warn about default values in production
    if (this.config.nodeEnv === 'production') {
      if (this.config.jwtSecret.includes('default') || this.config.jwtSecret.includes('test')) {
        throw new Error('JWT_SECRET contains unsafe patterns for production');
      }
      
      if (this.config.credentialEncryptionKey.includes('default') || this.config.credentialEncryptionKey.includes('test')) {
        throw new Error('CREDENTIAL_ENCRYPTION_KEY contains unsafe patterns for production');
      }
      
      if (this.config.allowedOrigins.includes('*')) {
        this.logger.warn('ALLOWED_ORIGINS contains wildcard (*) in production');
      }
    }
  }
}

// Export singleton instance
export const envConfig = EnvironmentValidator.getInstance();

// Export convenience function
export function getEnvConfig(): EnvironmentConfig {
  return envConfig.getConfig();
}

// Initialize on import if not in test environment
if (process.env.NODE_ENV !== 'test') {
  try {
    envConfig.loadConfig();
  } catch (error) {
    console.error('Failed to load environment configuration:', error);
    process.exit(1);
  }
}
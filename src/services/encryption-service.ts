/**
 * Encryption Service
 * Provides secure encryption/decryption for sensitive data
 */

import * as crypto from 'crypto';
import { Logger } from '../utils/logger';
import { JupiterDBClient, getDBClient } from '../database/jupiter-db-client';
import { v4 as uuidv4 } from 'uuid';

export interface EncryptionKey {
  id: string;
  keyName: string;
  keyType: 'AES256' | 'RSA2048' | 'RSA4096';
  publicKey?: string;
  isActive: boolean;
  createdAt: Date;
  expiresAt?: Date;
}

export interface EncryptedData {
  cipherText: string;
  iv: string;
  authTag?: string;
  keyId: string;
  algorithm: string;
}

export class EncryptionService {
  private static instance: EncryptionService;
  private logger: Logger;
  private masterKey: Buffer;
  private activeKeyId: string;
  private algorithm: string = 'aes-256-gcm';
  private dbClient: JupiterDBClient | null = null;
  private keyCache: Map<string, Buffer> = new Map();

  private constructor() {
    this.logger = new Logger('EncryptionService');
    
    // Get master key from environment or generate
    const masterKeyHex = process.env.MASTER_ENCRYPTION_KEY;
    if (masterKeyHex) {
      this.masterKey = Buffer.from(masterKeyHex, 'hex');
    } else {
      // Generate and log warning in development
      this.masterKey = crypto.randomBytes(32);
      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn('MASTER_ENCRYPTION_KEY not set, using generated key (not for production!)');
        this.logger.warn(`Generated key: ${this.masterKey.toString('hex')}`);
      }
    }
    
    this.activeKeyId = 'default';
  }

  static getInstance(): EncryptionService {
    if (!this.instance) {
      this.instance = new EncryptionService();
    }
    return this.instance;
  }

  private async getDbClient(): Promise<JupiterDBClient> {
    if (!this.dbClient) {
      this.dbClient = await getDBClient();
    }
    return this.dbClient;
  }

  /**
   * Derive key from master key using PBKDF2
   */
  private deriveKey(salt: string, keyId: string): Buffer {
    const cached = this.keyCache.get(`${keyId}-${salt}`);
    if (cached) {
      return cached;
    }

    const key = crypto.pbkdf2Sync(
      this.masterKey,
      Buffer.from(salt),
      100000,
      32,
      'sha256'
    );

    // Cache for performance
    this.keyCache.set(`${keyId}-${salt}`, key);
    
    // Clear cache after 5 minutes
    setTimeout(() => {
      this.keyCache.delete(`${keyId}-${salt}`);
    }, 5 * 60 * 1000);

    return key;
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  encrypt(plainText: string, context?: string): EncryptedData {
    try {
      // Generate random IV
      const iv = crypto.randomBytes(16);
      
      // Derive key with context-specific salt
      const salt = context || 'default';
      const key = this.deriveKey(salt, this.activeKeyId);
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      
      // Encrypt data
      let encrypted = cipher.update(plainText, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Get auth tag for GCM
      const authTag = (cipher as any).getAuthTag();
      
      return {
        cipherText: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        keyId: this.activeKeyId,
        algorithm: this.algorithm
      };
    } catch (error) {
      this.logger.error('Encryption failed', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  decrypt(encryptedData: EncryptedData, context?: string): string {
    try {
      // Derive key with context-specific salt
      const salt = context || 'default';
      const key = this.deriveKey(salt, encryptedData.keyId);
      
      // Create decipher
      const decipher = crypto.createDecipheriv(
        encryptedData.algorithm || this.algorithm,
        key,
        Buffer.from(encryptedData.iv, 'hex')
      );
      
      // Set auth tag for GCM
      if (encryptedData.authTag) {
        (decipher as any).setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
      }
      
      // Decrypt data
      let decrypted = decipher.update(encryptedData.cipherText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      this.logger.error('Decryption failed', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Encrypt object as JSON
   */
  encryptObject(obj: any, context?: string): EncryptedData {
    const jsonString = JSON.stringify(obj);
    return this.encrypt(jsonString, context);
  }

  /**
   * Decrypt object from JSON
   */
  decryptObject<T = any>(encryptedData: EncryptedData, context?: string): T {
    const jsonString = this.decrypt(encryptedData, context);
    return JSON.parse(jsonString);
  }

  /**
   * Hash data using SHA-256 (for non-reversible hashing)
   */
  hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate secure random token
   */
  generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Compare plain text with hashed value (for passwords)
   */
  async compareHash(plainText: string, hash: string): Promise<boolean> {
    const newHash = this.hash(plainText);
    return crypto.timingSafeEqual(Buffer.from(newHash), Buffer.from(hash));
  }

  /**
   * Create or rotate encryption key
   */
  async createEncryptionKey(
    keyName: string,
    keyType: 'AES256' | 'RSA2048' | 'RSA4096' = 'AES256'
  ): Promise<EncryptionKey> {
    try {
      const db = await this.getDbClient();
      const keyId = uuidv4();
      
      let publicKey: string | undefined;
      
      // Generate key based on type
      if (keyType.startsWith('RSA')) {
        const keySize = keyType === 'RSA2048' ? 2048 : 4096;
        const { publicKey: pubKey } = crypto.generateKeyPairSync('rsa', {
          modulusLength: keySize,
          publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
          },
          privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
            cipher: 'aes-256-cbc',
            passphrase: this.masterKey.toString('hex')
          }
        });
        publicKey = pubKey;
      }
      
      // Store key metadata in database
      await db.execute(
        `INSERT INTO encryption_keys 
         (id, key_name, key_type, public_key, is_active, created_at)
         VALUES (?, ?, ?, ?, TRUE, NOW())`,
        [keyId, keyName, keyType, publicKey || null]
      );
      
      const encryptionKey: EncryptionKey = {
        id: keyId,
        keyName,
        keyType,
        publicKey,
        isActive: true,
        createdAt: new Date()
      };
      
      this.logger.info(`Created encryption key: ${keyName} (${keyType})`);
      return encryptionKey;
      
    } catch (error) {
      this.logger.error('Failed to create encryption key', error);
      throw error;
    }
  }

  /**
   * Get active encryption key
   */
  async getActiveKey(): Promise<EncryptionKey | null> {
    try {
      const db = await this.getDbClient();
      const result = await db.queryOne<any>(
        `SELECT * FROM encryption_keys 
         WHERE is_active = TRUE 
         AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY created_at DESC
         LIMIT 1`
      );
      
      if (!result) {
        return null;
      }
      
      return {
        id: result.id,
        keyName: result.key_name,
        keyType: result.key_type,
        publicKey: result.public_key,
        isActive: result.is_active,
        createdAt: result.created_at,
        expiresAt: result.expires_at
      };
    } catch (error) {
      this.logger.error('Failed to get active key', error);
      return null;
    }
  }

  /**
   * Rotate encryption keys
   */
  async rotateKeys(): Promise<void> {
    try {
      const db = await this.getDbClient();
      
      // Deactivate old keys
      await db.execute(
        `UPDATE encryption_keys 
         SET is_active = FALSE, 
             rotation_date = NOW()
         WHERE is_active = TRUE`
      );
      
      // Create new key
      await this.createEncryptionKey('rotated-key-' + Date.now());
      
      this.logger.info('Encryption keys rotated successfully');
    } catch (error) {
      this.logger.error('Failed to rotate keys', error);
      throw error;
    }
  }

  /**
   * Encrypt environment variable value
   */
  encryptEnvValue(value: string, projectId: string): string {
    const encrypted = this.encrypt(value, `project-${projectId}`);
    // Store as JSON string for easy retrieval
    return JSON.stringify(encrypted);
  }

  /**
   * Decrypt environment variable value
   */
  decryptEnvValue(encryptedValue: string, projectId: string): string {
    try {
      const encrypted = JSON.parse(encryptedValue) as EncryptedData;
      return this.decrypt(encrypted, `project-${projectId}`);
    } catch (error) {
      // If not encrypted or invalid format, return as-is
      this.logger.warn('Failed to decrypt env value, returning raw value');
      return encryptedValue;
    }
  }

  /**
   * Clear key cache
   */
  clearCache(): void {
    this.keyCache.clear();
  }
}

// Export singleton instance
export const encryptionService = EncryptionService.getInstance();
/**
 * Authentication Middleware with Enhanced Security
 */

import { Request, Response, NextFunction } from 'express';
import { Logger } from '../../utils/logger';
import { JupiterDBClient, getDBClient } from '../../database/jupiter-db-client';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

const logger = Logger.getInstance();

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name?: string;
    role: string;
    projectId?: string;
  };
  apiKey?: string;
}

interface ApiKeyRecord {
  id: string;
  key_hash: string;
  user_id: string;
  name: string;
  permissions: string[];
  is_active: boolean;
  last_used_at?: Date;
  expires_at?: Date;
}

class AuthenticationService {
  private static instance: AuthenticationService;
  private dbClient: JupiterDBClient | null = null;
  private jwtSecret: string;
  private apiKeyCache: Map<string, ApiKeyRecord> = new Map();
  private cacheExpiry: number = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    this.jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
    if (!process.env.JWT_SECRET) {
      logger.warn('JWT_SECRET not set, using generated secret');
    }
  }

  static getInstance(): AuthenticationService {
    if (!this.instance) {
      this.instance = new AuthenticationService();
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
   * Hash API key for secure storage
   */
  private hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Validate JWT token
   */
  async validateJWT(token: string): Promise<any> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      return decoded;
    } catch (error) {
      logger.error('JWT validation failed', error);
      return null;
    }
  }

  /**
   * Generate JWT token
   */
  generateJWT(payload: any, expiresIn: string | number = '24h'): string {
    return jwt.sign(payload, this.jwtSecret, { expiresIn } as jwt.SignOptions);
  }

  /**
   * Validate API key against database
   */
  async validateApiKey(apiKey: string): Promise<ApiKeyRecord | null> {
    try {
      // Check cache first
      const cached = this.apiKeyCache.get(apiKey);
      if (cached && cached.expires_at && cached.expires_at > new Date()) {
        return cached;
      }

      const keyHash = this.hashApiKey(apiKey);
      const db = await this.getDbClient();
      
      // Query database for API key
      const result = await db.queryOne<any>(
        `SELECT ak.*, u.email, u.name, u.role 
         FROM api_keys ak
         JOIN users u ON ak.user_id = u.id
         WHERE ak.key_hash = ? 
         AND ak.is_active = TRUE
         AND (ak.expires_at IS NULL OR ak.expires_at > NOW())`,
        [keyHash]
      );

      if (!result) {
        return null;
      }

      // Update last used timestamp
      await db.execute(
        'UPDATE api_keys SET last_used_at = NOW() WHERE id = ?',
        [result.id]
      );

      const apiKeyRecord: ApiKeyRecord = {
        id: result.id,
        key_hash: result.key_hash,
        user_id: result.user_id,
        name: result.name,
        permissions: result.permissions ? JSON.parse(result.permissions) : [],
        is_active: result.is_active,
        last_used_at: new Date(),
        expires_at: result.expires_at
      };

      // Cache the result
      this.apiKeyCache.set(apiKey, apiKeyRecord);
      setTimeout(() => this.apiKeyCache.delete(apiKey), this.cacheExpiry);

      return apiKeyRecord;
    } catch (error) {
      logger.error('API key validation error', error);
      return null;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<any> {
    try {
      const db = await this.getDbClient();
      const user = await db.queryOne(
        'SELECT id, email, name, role FROM users WHERE id = ?',
        [userId]
      );
      return user;
    } catch (error) {
      logger.error('Failed to get user', error);
      return null;
    }
  }

  /**
   * Log authentication attempt
   */
  async logAuthAttempt(
    success: boolean,
    method: 'jwt' | 'apikey',
    userId?: string,
    ip?: string
  ): Promise<void> {
    try {
      const db = await this.getDbClient();
      await db.execute(
        `INSERT INTO auth_logs (user_id, method, success, ip_address, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [userId || null, method, success, ip || null]
      );
    } catch (error) {
      logger.error('Failed to log auth attempt', error);
    }
  }
}

const authService = AuthenticationService.getInstance();

/**
 * Main authentication middleware
 */
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.header('Authorization');
    const apiKey = req.header('X-API-Key');
    const clientIp = req.ip || req.connection.remoteAddress;

    // Check for JWT token
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = await authService.validateJWT(token);
      
      if (decoded && decoded.userId) {
        const user = await authService.getUserById(decoded.userId);
        if (user) {
          req.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            projectId: decoded.projectId
          };
          
          await authService.logAuthAttempt(true, 'jwt', user.id, clientIp);
          next();
          return;
        }
      }
      
      await authService.logAuthAttempt(false, 'jwt', undefined, clientIp);
      res.status(401).json({ 
        success: false, 
        error: 'Invalid or expired token' 
      });
      return;
    }

    // Check for API key
    if (apiKey) {
      const apiKeyRecord = await authService.validateApiKey(apiKey);
      
      if (apiKeyRecord) {
        const user = await authService.getUserById(apiKeyRecord.user_id);
        if (user) {
          req.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
          };
          req.apiKey = apiKey;
          
          await authService.logAuthAttempt(true, 'apikey', user.id, clientIp);
          next();
          return;
        }
      }
      
      await authService.logAuthAttempt(false, 'apikey', undefined, clientIp);
      res.status(401).json({ 
        success: false, 
        error: 'Invalid API key' 
      });
      return;
    }

    // No authentication provided
    res.status(401).json({ 
      success: false, 
      error: 'Authentication required. Please provide a valid JWT token or API key.' 
    });
  } catch (error) {
    logger.error('Authentication error', error);
    res.status(500).json({ 
      success: false, 
      error: 'Authentication service error' 
    });
  }
};

/**
 * Middleware to require specific role
 */
export const requireRole = (role: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ 
        success: false, 
        error: 'Not authenticated' 
      });
      return;
    }

    // Admin has access to everything
    if (req.user.role === 'admin') {
      next();
      return;
    }

    // Check specific role
    if (req.user.role !== role) {
      res.status(403).json({ 
        success: false, 
        error: `Insufficient permissions. Required role: ${role}` 
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to require specific permissions
 */
export const requirePermissions = (permissions: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ 
        success: false, 
        error: 'Not authenticated' 
      });
      return;
    }

    // Admin has all permissions
    if (req.user.role === 'admin') {
      next();
      return;
    }

    // Check if using API key with specific permissions
    if (req.apiKey) {
      const apiKeyRecord = await authService.validateApiKey(req.apiKey);
      if (apiKeyRecord) {
        const hasAllPermissions = permissions.every(p => 
          apiKeyRecord.permissions.includes(p)
        );
        
        if (hasAllPermissions) {
          next();
          return;
        }
      }
    }

    res.status(403).json({ 
      success: false, 
      error: `Insufficient permissions. Required: ${permissions.join(', ')}` 
    });
  };
};

/**
 * Optional authentication - continues even if auth fails
 */
export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.header('Authorization');
    const apiKey = req.header('X-API-Key');

    if (authHeader || apiKey) {
      await authenticate(req, res, () => {
        // Continue even if auth fails
        next();
      });
    } else {
      // No auth provided, continue as anonymous
      next();
    }
  } catch (error) {
    // Continue on error
    next();
  }
};

// Export auth service for use in other modules
export { authService };

// Aliases for backward compatibility
export const authMiddleware = authenticate;
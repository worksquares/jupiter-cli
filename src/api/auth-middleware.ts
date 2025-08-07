/**
 * Authentication middleware for API security
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Logger } from '../utils/logger';

export interface AuthConfig {
  jwtSecret: string;
  apiKeys?: string[];
  enableJWT?: boolean;
  enableAPIKey?: boolean;
  tokenExpiry?: string;
  excludePaths?: string[];
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    name: string;
    role: string;
  };
  apiKey?: string;
}

export class AuthMiddleware {
  private logger: Logger;
  private config: AuthConfig;
  private apiKeyHashes: Set<string>;

  constructor(config: AuthConfig) {
    this.logger = new Logger('AuthMiddleware');
    this.config = {
      enableJWT: true,
      enableAPIKey: true,
      tokenExpiry: '24h',
      excludePaths: ['/health', '/login'],
      ...config
    };

    // Hash API keys for secure storage
    this.apiKeyHashes = new Set(
      (config.apiKeys || []).map(key => this.hashAPIKey(key))
    );
  }

  /**
   * Main authentication middleware
   */
  authenticate = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Check if path is excluded
      if (this.isPathExcluded(req.path)) {
        return next();
      }

      // Try JWT authentication
      if (this.config.enableJWT) {
        const token = this.extractToken(req);
        if (token) {
          const decoded = await this.verifyJWT(token);
          if (decoded) {
            req.user = decoded as any;
            return next();
          }
        }
      }

      // Try API key authentication
      if (this.config.enableAPIKey) {
        const apiKey = this.extractAPIKey(req);
        if (apiKey && this.verifyAPIKey(apiKey)) {
          req.apiKey = apiKey;
          return next();
        }
      }

      // No valid authentication found
      res.status(401).json({
        error: 'Authentication required',
        message: 'Please provide a valid JWT token or API key'
      });
    } catch (error) {
      this.logger.error('Authentication error', error);
      res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid authentication credentials'
      });
    }
  };

  /**
   * Generate a new JWT token
   */
  generateToken(user: { id: string; name: string; role: string }): string {
    return jwt.sign(
      {
        id: user.id,
        name: user.name,
        role: user.role,
        iat: Date.now()
      },
      this.config.jwtSecret,
      {
        expiresIn: this.config.tokenExpiry
      } as jwt.SignOptions
    );
  }

  /**
   * Generate a new API key
   */
  generateAPIKey(): string {
    const key = `ia_${crypto.randomBytes(32).toString('hex')}`;
    this.apiKeyHashes.add(this.hashAPIKey(key));
    return key;
  }

  /**
   * Revoke an API key
   */
  revokeAPIKey(apiKey: string): boolean {
    const hash = this.hashAPIKey(apiKey);
    return this.apiKeyHashes.delete(hash);
  }

  /**
   * Rate limiting middleware
   */
  rateLimit(maxRequests: number = 100, windowMs: number = 60000) {
    const requests = new Map<string, { count: number; resetTime: number }>();

    return (req: AuthRequest, res: Response, next: NextFunction): void => {
      const key = req.user?.id || req.apiKey || req.ip || 'unknown';
      const now = Date.now();
      const requestData = requests.get(key);

      if (!requestData || requestData.resetTime < now) {
        requests.set(key, {
          count: 1,
          resetTime: now + windowMs
        });
        return next();
      }

      if (requestData.count >= maxRequests) {
        const retryAfter = Math.ceil((requestData.resetTime - now) / 1000);
        res.status(429).json({
          error: 'Too many requests',
          message: `Rate limit exceeded. Please try again in ${retryAfter} seconds`,
          retryAfter
        });
        return;
      }

      requestData.count++;
      next();
    };
  }

  /**
   * Role-based access control
   */
  requireRole(...roles: string[]) {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User authentication is required for this endpoint'
        });
        return;
      }

      if (!roles.includes(req.user.role)) {
        res.status(403).json({
          error: 'Forbidden',
          message: `This endpoint requires one of the following roles: ${roles.join(', ')}`
        });
        return;
      }

      next();
    };
  }

  /**
   * Extract JWT token from request
   */
  private extractToken(req: Request): string | null {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check query parameter
    if (req.query.token && typeof req.query.token === 'string') {
      return req.query.token;
    }

    // Check cookie
    if (req.cookies && req.cookies.token) {
      return req.cookies.token;
    }

    return null;
  }

  /**
   * Extract API key from request
   */
  private extractAPIKey(req: Request): string | null {
    // Check X-API-Key header
    const apiKeyHeader = req.headers['x-api-key'];
    if (apiKeyHeader && typeof apiKeyHeader === 'string') {
      return apiKeyHeader;
    }

    // Check query parameter
    if (req.query.apiKey && typeof req.query.apiKey === 'string') {
      return req.query.apiKey;
    }

    return null;
  }

  /**
   * Verify JWT token
   */
  private async verifyJWT(token: string): Promise<any> {
    try {
      return jwt.verify(token, this.config.jwtSecret);
    } catch (error) {
      this.logger.debug('JWT verification failed', error);
      return null;
    }
  }

  /**
   * Verify API key
   */
  private verifyAPIKey(apiKey: string): boolean {
    const hash = this.hashAPIKey(apiKey);
    return this.apiKeyHashes.has(hash);
  }

  /**
   * Hash API key for secure storage
   */
  private hashAPIKey(apiKey: string): string {
    return crypto
      .createHash('sha256')
      .update(apiKey)
      .digest('hex');
  }

  /**
   * Check if path is excluded from authentication
   */
  private isPathExcluded(path: string): boolean {
    return this.config.excludePaths?.some(excluded => 
      path === excluded || path.startsWith(excluded + '/')
    ) || false;
  }

  /**
   * Sanitize error messages to prevent information leakage
   */
  sanitizeError(error: any): { message: string; code: string } {
    // Don't expose internal error details
    if (error.code === 'ECONNREFUSED') {
      return { message: 'Service temporarily unavailable', code: 'SERVICE_UNAVAILABLE' };
    }
    
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      return { message: 'Access denied', code: 'ACCESS_DENIED' };
    }
    
    if (error.message && error.message.includes('password')) {
      return { message: 'Authentication failed', code: 'AUTH_FAILED' };
    }
    
    // Default safe error
    return { message: 'An error occurred', code: 'INTERNAL_ERROR' };
  }
}
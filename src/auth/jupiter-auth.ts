/**
 * Jupiter Auth Provider
 * Integrates with JupiterAPI's JWT token system
 */

import jwt from 'jsonwebtoken';
import { Logger } from '../utils/logger';

export interface JupiterJWTPayload {
  userId: string;
  email: string;
  permissions: string[];
  tenantId?: string;
  exp: number;
  iat: number;
}

export interface JupiterAuthConfig {
  jupiterApiUrl: string;
  sharedSecret: string;
  tokenExpiry?: number;
  refreshBeforeExpiry?: number;
}

export class JupiterAuthProvider {
  private logger: Logger;
  private tokenCache: Map<string, { payload: JupiterJWTPayload; expiresAt: number }> = new Map();

  constructor(private config: JupiterAuthConfig) {
    this.logger = new Logger('JupiterAuthProvider');
    
    // Clean up expired tokens periodically
    setInterval(() => this.cleanupExpiredTokens(), 60000); // Every minute
  }

  /**
   * Validate JWT token from JupiterAPI
   */
  async validateToken(token: string): Promise<JupiterJWTPayload> {
    try {
      // Check cache first
      const cached = this.tokenCache.get(token);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.payload;
      }

      // Verify token with shared secret
      const payload = jwt.verify(token, this.config.sharedSecret) as JupiterJWTPayload;
      
      // Validate required fields
      if (!payload.userId || !payload.email) {
        throw new Error('Invalid token payload: missing required fields');
      }

      // Cache the validated token
      this.tokenCache.set(token, {
        payload,
        expiresAt: payload.exp * 1000 // Convert to milliseconds
      });

      this.logger.info('Token validated successfully', { 
        userId: payload.userId,
        email: payload.email 
      });

      return payload;
    } catch (error) {
      this.logger.error('Token validation failed', error);
      
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      }
      
      throw error;
    }
  }

  /**
   * Generate a new token (for service-to-service communication)
   */
  generateServiceToken(
    serviceId: string,
    permissions: string[] = []
  ): string {
    const payload: Partial<JupiterJWTPayload> = {
      userId: `service:${serviceId}`,
      email: `${serviceId}@jupiter.ai`,
      permissions,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (this.config.tokenExpiry || 3600)
    };

    return jwt.sign(payload, this.config.sharedSecret);
  }

  /**
   * Refresh token if close to expiry
   */
  async refreshTokenIfNeeded(token: string): Promise<string | null> {
    try {
      const payload = jwt.decode(token) as JupiterJWTPayload;
      if (!payload || !payload.exp) {
        return null;
      }

      const refreshThreshold = this.config.refreshBeforeExpiry || 300; // 5 minutes
      const expiresIn = payload.exp - Math.floor(Date.now() / 1000);

      if (expiresIn < refreshThreshold) {
        // In a real implementation, this would call JupiterAPI to refresh
        this.logger.info('Token needs refresh', { 
          userId: payload.userId,
          expiresIn 
        });
        
        // For now, return null to indicate refresh needed
        return null;
      }

      return token;
    } catch (error) {
      this.logger.error('Token refresh check failed', error);
      return null;
    }
  }

  /**
   * Verify user has required permissions
   */
  hasPermission(
    payload: JupiterJWTPayload,
    requiredPermission: string
  ): boolean {
    return payload.permissions.includes(requiredPermission) ||
           payload.permissions.includes('*') || // Admin wildcard
           payload.permissions.includes('admin');
  }

  /**
   * Verify user has any of the required permissions
   */
  hasAnyPermission(
    payload: JupiterJWTPayload,
    requiredPermissions: string[]
  ): boolean {
    return requiredPermissions.some(perm => this.hasPermission(payload, perm));
  }

  /**
   * Verify user has all required permissions
   */
  hasAllPermissions(
    payload: JupiterJWTPayload,
    requiredPermissions: string[]
  ): boolean {
    return requiredPermissions.every(perm => this.hasPermission(payload, perm));
  }

  /**
   * Extract bearer token from authorization header
   */
  extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    return authHeader.substring(7);
  }

  /**
   * Clean up expired tokens from cache
   */
  private cleanupExpiredTokens(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [token, data] of this.tokenCache.entries()) {
      if (data.expiresAt < now) {
        this.tokenCache.delete(token);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired tokens from cache`);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; oldestToken: number | null } {
    let oldest: number | null = null;

    for (const data of this.tokenCache.values()) {
      if (oldest === null || data.expiresAt < oldest) {
        oldest = data.expiresAt;
      }
    }

    return {
      size: this.tokenCache.size,
      oldestToken: oldest
    };
  }
}
/**
 * Authentication Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { Logger } from '../../utils/logger';

const logger = Logger.getInstance();

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.header('X-API-Key') || req.header('Authorization');
    
    if (!apiKey) {
      res.status(401).json({ 
        success: false, 
        error: 'API key is required' 
      });
      return;
    }

    // TODO: Validate API key against database or service
    // For now, just check if it exists
    if (apiKey.length < 10) {
      res.status(401).json({ 
        success: false, 
        error: 'Invalid API key' 
      });
      return;
    }

    // Set user context
    req.user = {
      id: 'user-' + Date.now(),
      email: 'user@example.com',
      role: 'user'
    };

    next();
  } catch (error) {
    logger.error('Authentication error', error);
    res.status(500).json({ 
      success: false, 
      error: 'Authentication failed' 
    });
  }
};

export const requireRole = (role: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ 
        success: false, 
        error: 'Not authenticated' 
      });
      return;
    }

    if (req.user.role !== role && req.user.role !== 'admin') {
      res.status(403).json({ 
        success: false, 
        error: 'Insufficient permissions' 
      });
      return;
    }

    next();
  };
};

// Aliases for backward compatibility
export const authMiddleware = authenticate;
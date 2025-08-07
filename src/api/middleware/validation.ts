/**
 * Validation Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Logger } from '../../utils/logger';

const logger = Logger.getInstance();

export const validate = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Validation error', { errors: error.errors });
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }
      
      logger.error('Unexpected validation error', error);
      res.status(500).json({
        success: false,
        error: 'Internal validation error'
      });
    }
  };
};

export const validateParams = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync(req.params);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Parameter validation error', { errors: error.errors });
        res.status(400).json({
          success: false,
          error: 'Invalid parameters',
          details: error.errors
        });
        return;
      }
      
      logger.error('Unexpected parameter validation error', error);
      res.status(500).json({
        success: false,
        error: 'Internal validation error'
      });
    }
  };
};

export const validateQuery = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync(req.query);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Query validation error', { errors: error.errors });
        res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: error.errors
        });
        return;
      }
      
      logger.error('Unexpected query validation error', error);
      res.status(500).json({
        success: false,
        error: 'Internal validation error'
      });
    }
  };
};

// Alias for backward compatibility
export const validateRequest = validate;
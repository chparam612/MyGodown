/**
 * ============================================================================
 * File: backend/src/middleware/rateLimiter.js
 * Purpose: Express rate limiting middleware to prevent brute force login attempts.
 * Why it exists: Enforces security requirements for login endpoints (BR-01).
 * ============================================================================
 */

import rateLimit from 'express-rate-limit';

export function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);
  const isTest = process.env.NODE_ENV === 'test';
  const defaultMax = isTest ? 1000 : 10;
  const envMax = isTest
    ? (process.env.RATE_LIMIT_MAX_TEST ? parseInt(process.env.RATE_LIMIT_MAX_TEST, 10) : defaultMax)
    : parseInt(process.env.RATE_LIMIT_MAX || '10', 10);
  const max = options.max !== undefined ? options.max : envMax;

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      return res.status(429).json({
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many authentication attempts from this IP, please try again later.',
        },
      });
    },
  });
}

export const loginRateLimiter = createRateLimiter();

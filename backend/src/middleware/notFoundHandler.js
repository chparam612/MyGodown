/**
 * ============================================================================
 * File: backend/src/middleware/notFoundHandler.js
 * Purpose: Express fallback 404 route handler.
 * Why it exists: Returns standard JSON error envelope for non-existent endpoints.
 * ============================================================================
 */

import { NotFoundError } from '../utils/errors.js';

export function notFoundHandler(req, res, next) {
  next(new NotFoundError(`Endpoint not found: ${req.method} ${req.originalUrl}`));
}

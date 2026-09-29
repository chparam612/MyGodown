/**
 * ============================================================================
 * File: backend/src/middleware/errorHandler.js
 * Purpose: Global error handling middleware for Express.
 * Why it exists: Translates exceptions and MySQL error codes into standard JSON
 * response envelopes ({ success: false, error: { code, message, details? } }),
 * preventing stack traces and raw SQL from leaking in responses.
 * ============================================================================
 */

import { AppError } from '../utils/errors.js';
import { sendError } from '../utils/response.js';

export function errorHandler(err, req, res, next) {
  // If response has already started sending, delegate to Express default
  if (res.headersSent) {
    return next(err);
  }

  // Handle known operational AppError instances
  if (err instanceof AppError) {
    return sendError(res, {
      code: err.code,
      message: err.message,
      details: err.details,
    }, err.statusCode);
  }

  // Handle MySQL errors
  if (err.code) {
    switch (err.code) {
      case 'ER_DUP_ENTRY':
        return sendError(res, {
          code: 'CONFLICT',
          message: 'A record with this unique identifier already exists',
        }, 409);

      case 'ER_NO_REFERENCED_ROW_2':
        return sendError(res, {
          code: 'UNPROCESSABLE_ENTITY',
          message: 'Referenced parent record does not exist',
        }, 422);

      case 'ER_ROW_IS_REFERENCED_2':
        return sendError(res, {
          code: 'CONFLICT',
          message: 'Cannot modify or delete this record because it is referenced by other data',
        }, 409);

      case 'ER_CHECK_CONSTRAINT_VIOLATED':
        return sendError(res, {
          code: 'UNPROCESSABLE_ENTITY',
          message: 'Database check constraint violation: value out of allowed range',
        }, 422);

      case 'ER_DATA_TOO_LONG':
        return sendError(res, {
          code: 'VALIDATION_ERROR',
          message: 'Input data exceeds maximum allowed field length',
        }, 400);

      case 'ECONNREFUSED':
        return sendError(res, {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Unable to connect to the database service',
        }, 503);

      default:
        break;
    }
  }

  // Handle malformed JSON body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return sendError(res, {
      code: 'INVALID_JSON',
      message: 'Malformed JSON payload in request body',
    }, 400);
  }

  // Unhandled / Unexpected error (fallback 500)
  if (process.env.NODE_ENV !== 'test') {
    console.error('[Unhandled Server Error]:', err);
  }

  return sendError(res, {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected internal server error occurred',
  }, 500);
}

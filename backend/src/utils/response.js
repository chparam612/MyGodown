/**
 * ============================================================================
 * File: backend/src/utils/response.js
 * Purpose: Standard response envelope helpers for RIMS API.
 * Why it exists: Enforces consistent JSON response shape across all endpoints:
 *   Success: { success: true, data, meta? }
 *   Error:   { success: false, error: { code, message, details? } }
 * ============================================================================
 */

export function sendSuccess(res, data, statusCode = 200, meta = null) {
  const payload = {
    success: true,
    data,
  };
  if (meta !== null && typeof meta === 'object') {
    payload.meta = meta;
  }
  return res.status(statusCode).json(payload);
}

export function sendError(res, error, statusCode = 500) {
  const payload = {
    success: false,
    error: {
      code: error.code || 'INTERNAL_SERVER_ERROR',
      message: error.message || 'An unexpected error occurred',
    },
  };
  if (error.details) {
    payload.error.details = error.details;
  }
  return res.status(statusCode).json(payload);
}

// Aliases for developer convenience
export const successResponse = sendSuccess;
export const errorResponse = sendError;
export const paginatedResponse = (res, data, meta, statusCode = 200) => sendSuccess(res, data, statusCode, meta);

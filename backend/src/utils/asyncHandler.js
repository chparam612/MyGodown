/**
 * ============================================================================
 * File: backend/src/utils/asyncHandler.js
 * Purpose: Asynchronous controller wrapper for Express route handlers.
 * Why it exists: Eliminates redundant try/catch blocks in controllers by
 * catching unhandled Promise rejections and passing them to next().
 * ============================================================================
 */

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

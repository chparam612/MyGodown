/**
 * ============================================================================
 * File: backend/src/utils/errors.js
 * Purpose: Custom operational application error classes for RIMS.
 * Why it exists: Enforces consistent error structure across controllers and
 * services, automatically mapping HTTP status codes and machine-readable error codes.
 * ============================================================================
 */

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details = null) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details = null) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', details = null) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden for this role', details = null) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

export class InsufficientStockError extends AppError {
  constructor(message = 'Insufficient stock available for this operation', details = null) {
    super(message, 422, 'INSUFFICIENT_STOCK', details);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message = 'Operation cannot be processed', details = null) {
    super(message, 422, 'UNPROCESSABLE_ENTITY', details);
  }
}

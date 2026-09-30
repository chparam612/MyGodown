/**
 * ============================================================================
 * File: backend/src/middleware/auth.js
 * Purpose: JWT authentication and role-based authorization middleware.
 * Why it exists: Protects secured routes, verifies token signatures, validates
 * that user remains active in database, and enforces role access boundaries.
 * ============================================================================
 */

import jwt from 'jsonwebtoken';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { execute } from '../config/db.js';

/**
 * Authenticates requests carrying a Bearer JWT token.
 * Re-validates user existence and is_active status directly against database.
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication token is required');
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('FATAL: JWT_SECRET environment variable is not set. Refusing to verify tokens without a configured secret.');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Session has expired, please log in again');
      }
      throw new UnauthorizedError('Invalid authentication token');
    }

    if (!decoded || !decoded.id) {
      throw new UnauthorizedError('Malformed authentication token');
    }

    // Re-check user in database to ensure they are not deactivated
    const [rows] = await execute(
      'SELECT id, name, email, role, is_active FROM users WHERE id = ? LIMIT 1;',
      [decoded.id]
    );

    if (rows.length === 0) {
      throw new UnauthorizedError('User account not found');
    }

    const user = rows[0];
    if (!user.is_active) {
      throw new UnauthorizedError('User account has been deactivated');
    }

    // Attach verified user profile to request (no password)
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Authorizes user based on permitted roles list.
 * @param {...string} allowedRoles - List of allowed role names (e.g. 'admin', 'manager')
 * @returns {Function} Express middleware.
 */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError(`Access denied: required role ${allowedRoles.join(' or ')}`));
    }

    next();
  };
}

/**
 * ============================================================================
 * File: backend/src/validators/user.validator.js
 * Purpose: Joi validation schemas for User Management endpoints (UC-03 to UC-06).
 * Why it exists: Enforces payload validation for user creation, update, and search.
 * ============================================================================
 */

import Joi from 'joi';
import { ROLES } from '../middleware/permissions.js';

const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const passwordErrorMessage = 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number';

export const createUserSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required().messages({
    'string.min': 'Name must be at least 2 characters',
    'string.max': 'Name cannot exceed 100 characters',
    'any.required': 'Name is required',
  }),
  email: Joi.string().email().trim().lowercase().required().messages({
    'string.email': 'A valid email address is required',
    'any.required': 'Email is required',
  }),
  password: Joi.string().pattern(passwordPattern).required().messages({
    'string.pattern.base': passwordErrorMessage,
    'any.required': 'Password is required',
  }),
  role: Joi.string().valid(ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF).default(ROLES.STAFF).messages({
    'any.only': `Role must be one of: ${ROLES.ADMIN}, ${ROLES.MANAGER}, ${ROLES.STAFF}`,
  }),
});

export const updateUserSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).optional(),
  email: Joi.string().email().trim().lowercase().optional(),
  role: Joi.string().valid(ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF).optional(),
  is_active: Joi.boolean().optional(),
  isActive: Joi.boolean().optional(),
}).min(1).messages({
  'object.min': 'At least one field must be provided for update',
});

export const adminResetPasswordSchema = Joi.object({
  password: Joi.string().pattern(passwordPattern).required().messages({
    'string.pattern.base': passwordErrorMessage,
    'any.required': 'Password is required',
  }),
});

export const userIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required().messages({
    'number.base': 'User ID must be a valid number',
    'number.positive': 'User ID must be positive',
    'any.required': 'User ID is required',
  }),
});

export const listUsersQuerySchema = Joi.object({
  role: Joi.string().valid(ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF).optional(),
  is_active: Joi.boolean().optional(),
  isActive: Joi.boolean().optional(),
  search: Joi.string().trim().allow('').optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

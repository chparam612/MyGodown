/**
 * ============================================================================
 * File: backend/src/validators/auth.validator.js
 * Purpose: Joi validation schemas for authentication routes (login, change password).
 * Why it exists: Enforces strict input validation on email and strong password rules
 * (min 8 chars, at least 1 uppercase, 1 lowercase, 1 digit).
 * ============================================================================
 */

import Joi from 'joi';

// Strong password rule: min 8, at least 1 uppercase, 1 lowercase, 1 number
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const passwordErrorMessage = 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number';

export const loginSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().required().messages({
    'string.email': 'A valid email address is required',
    'any.required': 'Email is required',
  }),
  password: Joi.string().required().messages({
    'any.required': 'Password is required',
  }),
});

export const changePasswordSchema = Joi.object({
  current_password: Joi.string().optional(),
  currentPassword: Joi.string().optional(),
  new_password: Joi.string().pattern(passwordPattern).optional().messages({
    'string.pattern.base': passwordErrorMessage,
  }),
  newPassword: Joi.string().pattern(passwordPattern).optional().messages({
    'string.pattern.base': passwordErrorMessage,
  }),
})
  .or('current_password', 'currentPassword')
  .or('new_password', 'newPassword')
  .messages({
    'object.missing': 'Both current password and new password are required',
  });

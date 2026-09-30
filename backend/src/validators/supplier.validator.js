/**
 * ============================================================================
 * File: backend/src/validators/supplier.validator.js
 * Purpose: Joi validation schemas for Supplier management endpoints (UC-21 to UC-24).
 * Why it exists: Enforces strict data contracts for input sanitization, type
 * coercion, and error messages before requests reach controllers.
 * ============================================================================
 */

import Joi from 'joi';

/**
 * UC-21: Create Supplier Validation Schema
 */
export const createSupplierSchema = Joi.object({
  name: Joi.string().trim().min(1).max(150).required().messages({
    'string.base': 'Supplier name must be a string',
    'string.empty': 'Supplier name cannot be empty',
    'string.max': 'Supplier name must not exceed 150 characters',
    'any.required': 'Supplier name is required',
  }),
  contactName: Joi.string().trim().max(100).allow(null, '').optional().messages({
    'string.base': 'Contact name must be a string',
    'string.max': 'Contact name must not exceed 100 characters',
  }),
  contact_name: Joi.string().trim().max(100).allow(null, '').optional(),
  email: Joi.string().trim().email().max(150).allow(null, '').optional().messages({
    'string.base': 'Email must be a string',
    'string.email': 'Email must be a valid email address',
    'string.max': 'Email must not exceed 150 characters',
  }),
  phone: Joi.string().trim().max(50).allow(null, '').optional().messages({
    'string.base': 'Phone must be a string',
    'string.max': 'Phone must not exceed 50 characters',
  }),
  address: Joi.string().trim().max(255).allow(null, '').optional().messages({
    'string.base': 'Address must be a string',
    'string.max': 'Address must not exceed 255 characters',
  }),
  isActive: Joi.boolean().default(true).optional(),
  is_active: Joi.boolean().optional(),
}).custom((value, helpers) => {
  // Normalize snake_case aliases to camelCase
  if (value.contact_name !== undefined && value.contactName === undefined) {
    value.contactName = value.contact_name;
  }
  if (value.is_active !== undefined && value.isActive === undefined) {
    value.isActive = value.is_active;
  }
  return value;
});

/**
 * UC-23: Update Supplier Validation Schema
 */
export const updateSupplierSchema = Joi.object({
  name: Joi.string().trim().min(1).max(150).optional().messages({
    'string.base': 'Supplier name must be a string',
    'string.empty': 'Supplier name cannot be empty',
    'string.max': 'Supplier name must not exceed 150 characters',
  }),
  contactName: Joi.string().trim().max(100).allow(null, '').optional(),
  contact_name: Joi.string().trim().max(100).allow(null, '').optional(),
  email: Joi.string().trim().email().max(150).allow(null, '').optional().messages({
    'string.base': 'Email must be a string',
    'string.email': 'Email must be a valid email address',
    'string.max': 'Email must not exceed 150 characters',
  }),
  phone: Joi.string().trim().max(50).allow(null, '').optional(),
  address: Joi.string().trim().max(255).allow(null, '').optional().messages({
    'string.base': 'Address must be a string',
    'string.max': 'Address must not exceed 255 characters',
  }),
  isActive: Joi.boolean().optional(),
  is_active: Joi.boolean().optional(),
})
  .min(1)
  .messages({
    'object.min': 'At least one field must be provided for update',
  })
  .custom((value, helpers) => {
    if (value.contact_name !== undefined && value.contactName === undefined) {
      value.contactName = value.contact_name;
    }
    if (value.is_active !== undefined && value.isActive === undefined) {
      value.isActive = value.is_active;
    }
    return value;
  });

/**
 * UC-22: List Suppliers Query Validation Schema
 */
export const listSuppliersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(20).optional(),
  search: Joi.string().trim().allow('').optional(),
  isActive: Joi.boolean().optional(),
  is_active: Joi.boolean().optional(),
  sortBy: Joi.string()
    .valid('id', 'name', 'email', 'contactName', 'createdAt', 'updatedAt', 'productCount')
    .default('name')
    .optional(),
  sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC').default('asc').optional(),
}).custom((value, helpers) => {
  if (value.is_active !== undefined && value.isActive === undefined) {
    value.isActive = value.is_active;
  }
  return value;
});

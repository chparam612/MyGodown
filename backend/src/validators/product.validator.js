/**
 * ============================================================================
 * File: backend/src/validators/product.validator.js
 * Purpose: Joi validation schemas for Product Management (Module 2: UC-07 to UC-10).
 * Why it exists: Validates incoming request payloads, URL parameters, and query
 * strings with descriptive field-level error messages before reaching controllers.
 * ============================================================================
 */

import Joi from 'joi';

/**
 * Validation schema for creating a new product (UC-07)
 */
export const createProductSchema = Joi.object({
  sku: Joi.string().trim().max(50).required().messages({
    'string.empty': 'Product SKU is required',
    'any.required': 'Product SKU is required',
    'string.max': 'Product SKU cannot exceed 50 characters',
  }),
  name: Joi.string().trim().max(150).required().messages({
    'string.empty': 'Product name is required',
    'any.required': 'Product name is required',
    'string.max': 'Product name cannot exceed 150 characters',
  }),
  description: Joi.string().trim().allow('', null).optional().messages({
    'string.base': 'Description must be a string',
  }),
  category: Joi.string().trim().max(100).default('General').messages({
    'string.max': 'Category cannot exceed 100 characters',
  }),
  unitPrice: Joi.number().precision(2).min(0).max(99999999.99).required().messages({
    'number.base': 'Unit price must be a valid number',
    'number.min': 'Unit price cannot be negative',
    'number.max': 'Unit price cannot exceed 99,999,999.99',
    'any.required': 'Unit price is required',
  }),
  costPrice: Joi.number().precision(2).min(0).max(99999999.99).default(0.00).messages({
    'number.base': 'Cost price must be a valid number',
    'number.min': 'Cost price cannot be negative',
    'number.max': 'Cost price cannot exceed 99,999,999.99',
  }),
  reorderLevel: Joi.number().integer().min(0).max(1000000).default(0).messages({
    'number.base': 'Reorder level must be an integer',
    'number.min': 'Reorder level cannot be negative',
    'number.max': 'Reorder level cannot exceed 1,000,000',
  }),
  supplierId: Joi.number().integer().positive().required().messages({
    'number.base': 'Supplier ID must be a positive integer',
    'number.positive': 'Supplier ID must be a positive integer',
    'any.required': 'Supplier ID is required',
  }),
});

/**
 * Validation schema for updating an existing product (UC-09)
 * Note: SKU cannot be modified after creation (BR-04)
 */
export const updateProductSchema = Joi.object({
  name: Joi.string().trim().max(150).optional().messages({
    'string.max': 'Product name cannot exceed 150 characters',
  }),
  description: Joi.string().trim().allow('', null).optional(),
  category: Joi.string().trim().max(100).optional(),
  unitPrice: Joi.number().precision(2).min(0).max(99999999.99).optional().messages({
    'number.min': 'Unit price cannot be negative',
    'number.max': 'Unit price cannot exceed 99,999,999.99',
  }),
  costPrice: Joi.number().precision(2).min(0).max(99999999.99).optional().messages({
    'number.min': 'Cost price cannot be negative',
    'number.max': 'Cost price cannot exceed 99,999,999.99',
  }),
  reorderLevel: Joi.number().integer().min(0).max(1000000).optional().messages({
    'number.min': 'Reorder level cannot be negative',
    'number.max': 'Reorder level cannot exceed 1,000,000',
  }),
  supplierId: Joi.number().integer().positive().optional().messages({
    'number.positive': 'Supplier ID must be a positive integer',
  }),
  isActive: Joi.boolean().optional(),
  sku: Joi.forbidden().messages({
    'any.unknown': 'SKU is immutable and cannot be modified after creation',
  }),
}).min(1).messages({
  'object.min': 'At least one field must be provided for update',
});

/**
 * Validation schema for querying products list (UC-08)
 */
export const queryProductSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().allow('').optional(),
  category: Joi.string().trim().optional(),
  supplierId: Joi.number().integer().positive().optional(),
  isActive: Joi.boolean().optional(),
  sortBy: Joi.string().valid('name', 'sku', 'unitPrice', 'costPrice', 'category', 'createdAt', 'reorderLevel', 'id').default('id'),
  sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC').default('asc'),
});

/**
 * Validation schema for product ID route parameter
 */
export const productIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required().messages({
    'number.base': 'Product ID must be a valid positive integer',
    'number.positive': 'Product ID must be a positive integer',
    'any.required': 'Product ID is required in URL parameter',
  }),
});

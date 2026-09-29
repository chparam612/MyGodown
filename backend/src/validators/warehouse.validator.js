/**
 * ============================================================================
 * File: backend/src/validators/warehouse.validator.js
 * Purpose: Joi validation schemas for Warehouse endpoints (UC-11 to UC-13).
 * Why it exists: Enforces payload validation for warehouse creation, update,
 * filtering, and route parameter parsing before reaching controllers.
 * ============================================================================
 */

import Joi from 'joi';

// Code pattern: Alphanumeric with hyphens and underscores (e.g., WH-CENTRAL, WH_EAST_01)
const warehouseCodePattern = /^[A-Za-z0-9_-]+$/;

export const createWarehouseSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required().messages({
    'string.min': 'Warehouse name must be at least 2 characters long',
    'string.max': 'Warehouse name cannot exceed 100 characters',
    'any.required': 'Warehouse name is required',
  }),
  code: Joi.string().trim().uppercase().min(2).max(50).pattern(warehouseCodePattern).required().messages({
    'string.pattern.base': 'Warehouse code may only contain letters, numbers, hyphens, and underscores',
    'string.min': 'Warehouse code must be at least 2 characters long',
    'string.max': 'Warehouse code cannot exceed 50 characters',
    'any.required': 'Warehouse code is required',
  }),
  city: Joi.string().trim().min(2).max(100).required().messages({
    'string.min': 'City must be at least 2 characters long',
    'string.max': 'City cannot exceed 100 characters',
    'any.required': 'City is required',
  }),
  address: Joi.string().trim().max(255).allow(null, '').optional().messages({
    'string.max': 'Address cannot exceed 255 characters',
  }),
  isActive: Joi.boolean().optional().default(true),
  is_active: Joi.boolean().optional(),
});

export const updateWarehouseSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).optional().messages({
    'string.min': 'Warehouse name must be at least 2 characters long',
    'string.max': 'Warehouse name cannot exceed 100 characters',
  }),
  code: Joi.string().trim().uppercase().min(2).max(50).optional().messages({
    'string.min': 'Warehouse code must be at least 2 characters long',
    'string.max': 'Warehouse code cannot exceed 50 characters',
  }),
  city: Joi.string().trim().min(2).max(100).optional().messages({
    'string.min': 'City must be at least 2 characters long',
    'string.max': 'City cannot exceed 100 characters',
  }),
  address: Joi.string().trim().max(255).allow(null, '').optional().messages({
    'string.max': 'Address cannot exceed 255 characters',
  }),
  isActive: Joi.boolean().optional(),
  is_active: Joi.boolean().optional(),
}).min(1).messages({
  'object.min': 'At least one field must be provided to update warehouse',
});

export const warehouseIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required().messages({
    'number.base': 'Warehouse ID must be a valid number',
    'number.positive': 'Warehouse ID must be a positive integer',
    'any.required': 'Warehouse ID is required',
  }),
});

export const listWarehousesQuerySchema = Joi.object({
  search: Joi.string().trim().allow('').optional(),
  city: Joi.string().trim().allow('').optional(),
  isActive: Joi.boolean().optional(),
  is_active: Joi.boolean().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().valid('id', 'name', 'code', 'city', 'createdAt').default('id'),
  sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
});

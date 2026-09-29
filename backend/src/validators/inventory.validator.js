/**
 * ============================================================================
 * File: backend/src/validators/inventory.validator.js
 * Purpose: Joi validation schemas for Inventory & Stock Movement endpoints (UC-14 to UC-20).
 * Why it exists: Enforces strict request body, query parameter, and route parameter
 * validation before execution reaches the inventory service.
 * ============================================================================
 */

import Joi from 'joi';

// ----------------------------------------------------------------------------
// UC-17: Adjust Stock Schema
// ----------------------------------------------------------------------------
export const adjustStockSchema = Joi.object({
  productId: Joi.number().integer().positive().required().messages({
    'number.base': 'Product ID must be a valid number',
    'number.positive': 'Product ID must be a positive integer',
    'any.required': 'Product ID is required',
  }),
  warehouseId: Joi.number().integer().positive().required().messages({
    'number.base': 'Warehouse ID must be a valid number',
    'number.positive': 'Warehouse ID must be a positive integer',
    'any.required': 'Warehouse ID is required',
  }),
  countedQuantity: Joi.number().integer().min(0).required().messages({
    'number.base': 'Counted quantity must be a valid number',
    'number.min': 'Counted quantity cannot be negative',
    'any.required': 'Counted quantity is required',
  }),
  reason: Joi.string().trim().min(3).max(255).required().messages({
    'string.empty': 'Adjustment reason is required',
    'string.min': 'Adjustment reason must be at least 3 characters long',
    'string.max': 'Adjustment reason cannot exceed 255 characters',
    'any.required': 'Adjustment reason is required',
  }),
});

// ----------------------------------------------------------------------------
// UC-18: Transfer Stock Schema
// ----------------------------------------------------------------------------
export const transferStockSchema = Joi.object({
  productId: Joi.number().integer().positive().required().messages({
    'number.base': 'Product ID must be a valid number',
    'number.positive': 'Product ID must be a positive integer',
    'any.required': 'Product ID is required',
  }),
  sourceWarehouseId: Joi.number().integer().positive().required().messages({
    'number.base': 'Source warehouse ID must be a valid number',
    'number.positive': 'Source warehouse ID must be a positive integer',
    'any.required': 'Source warehouse ID is required',
  }),
  destinationWarehouseId: Joi.number().integer().positive().required().messages({
    'number.base': 'Destination warehouse ID must be a valid number',
    'number.positive': 'Destination warehouse ID must be a positive integer',
    'any.required': 'Destination warehouse ID is required',
  }),
  quantity: Joi.number().integer().positive().min(1).required().messages({
    'number.base': 'Transfer quantity must be a valid number',
    'number.positive': 'Transfer quantity must be greater than zero',
    'number.min': 'Transfer quantity must be at least 1',
    'any.required': 'Transfer quantity is required',
  }),
  reason: Joi.string().trim().max(255).allow(null, '').optional(),
  reference: Joi.string().trim().max(100).allow(null, '').optional(),
});

// ----------------------------------------------------------------------------
// UC-16: Record Stock Movement Schema
// ----------------------------------------------------------------------------
export const recordMovementSchema = Joi.object({
  productId: Joi.number().integer().positive().required().messages({
    'number.base': 'Product ID must be a valid number',
    'number.positive': 'Product ID must be a positive integer',
    'any.required': 'Product ID is required',
  }),
  warehouseId: Joi.number().integer().positive().required().messages({
    'number.base': 'Warehouse ID must be a valid number',
    'number.positive': 'Warehouse ID must be a positive integer',
    'any.required': 'Warehouse ID is required',
  }),
  movementType: Joi.string().valid('in', 'out', 'adjustment').required().messages({
    'any.only': 'Movement type must be one of: in, out, adjustment',
    'any.required': 'Movement type is required',
  }),
  quantity: Joi.number().integer().positive().min(1).required().messages({
    'number.base': 'Movement quantity must be a valid number',
    'number.positive': 'Movement quantity must be greater than zero',
    'number.min': 'Movement quantity must be at least 1',
    'any.required': 'Movement quantity is required',
  }),
  reference: Joi.string().trim().max(100).allow(null, '').optional(),
});

// ----------------------------------------------------------------------------
// UC-15: Check Stock Availability Query Schema
// ----------------------------------------------------------------------------
export const checkAvailabilityQuerySchema = Joi.object({
  productId: Joi.number().integer().positive().required().messages({
    'number.base': 'Product ID must be a valid number',
    'number.positive': 'Product ID must be a positive integer',
    'any.required': 'Product ID is required',
  }),
  warehouseId: Joi.number().integer().positive().optional(),
  quantity: Joi.number().integer().positive().min(1).optional().messages({
    'number.base': 'Quantity must be a valid number',
    'number.positive': 'Quantity must be greater than zero',
  }),
});

// ----------------------------------------------------------------------------
// UC-14: List Inventory Query Schema
// ----------------------------------------------------------------------------
export const listInventoryQuerySchema = Joi.object({
  warehouseId: Joi.number().integer().positive().optional(),
  productId: Joi.number().integer().positive().optional(),
  category: Joi.string().trim().allow('').optional(),
  search: Joi.string().trim().allow('').optional(),
  lowStock: Joi.boolean().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().valid('id', 'quantity', 'productName', 'warehouseName', 'updatedAt').default('id'),
  sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
});

// ----------------------------------------------------------------------------
// UC-19: Movement History Query Schema
// ----------------------------------------------------------------------------
export const listMovementsQuerySchema = Joi.object({
  productId: Joi.number().integer().positive().optional(),
  warehouseId: Joi.number().integer().positive().optional(),
  type: Joi.string().valid('in', 'out', 'adjustment').optional(),
  userId: Joi.number().integer().positive().optional(),
  startDate: Joi.string().isoDate().optional().messages({
    'string.isoDate': 'Start date must be in valid ISO format (YYYY-MM-DD)',
  }),
  endDate: Joi.string().isoDate().optional().messages({
    'string.isoDate': 'End date must be in valid ISO format (YYYY-MM-DD)',
  }),
  search: Joi.string().trim().allow('').optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

// ----------------------------------------------------------------------------
// UC-20: Low Stock Query Schema
// ----------------------------------------------------------------------------
export const lowStockQuerySchema = Joi.object({
  warehouseId: Joi.number().integer().positive().optional(),
  category: Joi.string().trim().allow('').optional(),
  search: Joi.string().trim().allow('').optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

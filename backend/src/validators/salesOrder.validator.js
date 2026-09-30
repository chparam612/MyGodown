/**
 * ============================================================================
 * File: backend/src/validators/salesOrder.validator.js
 * Purpose: Joi validation schemas for Sales Orders API (UC-28 to UC-30).
 * Why it exists: Validates SO headers, customer names, line item shapes,
 * positive quantities, and state transitions before requests enter the service layer.
 * ============================================================================
 */

import Joi from 'joi';

const soItemSchema = Joi.object({
  productId: Joi.number().integer().positive(),
  product_id: Joi.number().integer().positive(),
  quantity: Joi.number().integer().positive().max(1000000).required().messages({
    'number.base': 'Item quantity must be a number',
    'number.integer': 'Item quantity must be an integer',
    'number.positive': 'Item quantity must be greater than zero',
    'number.max': 'Item quantity cannot exceed 1,000,000',
    'any.required': 'Item quantity is required',
  }),
  unitPrice: Joi.number().min(0).max(99999999.99).precision(2).allow(null).messages({
    'number.min': 'Item unit price cannot be negative',
    'number.max': 'Item unit price cannot exceed 99,999,999.99',
  }),
  unit_price: Joi.number().min(0).max(99999999.99).precision(2).allow(null).messages({
    'number.min': 'Item unit price cannot be negative',
    'number.max': 'Item unit price cannot exceed 99,999,999.99',
  }),
}).xor('productId', 'product_id').messages({
  'object.missing': 'Each line item must specify productId or product_id',
  'object.xor': 'Specify either productId or product_id, not both',
});

export const createSOSchema = Joi.object({
  customerName: Joi.string().trim().min(1).max(150),
  customer_name: Joi.string().trim().min(1).max(150),
  warehouseId: Joi.number().integer().positive(),
  warehouse_id: Joi.number().integer().positive(),
  status: Joi.string().valid('draft').default('draft'),
  notes: Joi.string().allow('', null).max(1000).optional(),
  items: Joi.array().items(soItemSchema).min(1).required().messages({
    'array.min': 'Sales order must have at least one line item',
    'any.required': 'Sales order line items are required',
  }),
})
  .or('customerName', 'customer_name')
  .or('warehouseId', 'warehouse_id')
  .messages({
    'object.missing': 'customerName and warehouseId are required',
  });

export const updateSOStatusSchema = Joi.object({
  status: Joi.string().valid('confirmed', 'fulfilled', 'cancelled').required().messages({
    'any.only': 'Status must be one of: confirmed, fulfilled, cancelled',
    'any.required': 'Status is required',
  }),
});

export const listSOQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  warehouseId: Joi.number().integer().positive().optional(),
  warehouse_id: Joi.number().integer().positive().optional(),
  status: Joi.string().valid('draft', 'confirmed', 'fulfilled', 'cancelled').optional(),
  search: Joi.string().trim().allow('').max(100).optional(),
});

export const soIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required().messages({
    'number.base': 'Sales order ID must be a positive integer',
  }),
});

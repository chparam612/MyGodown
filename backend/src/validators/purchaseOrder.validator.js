/**
 * ============================================================================
 * File: backend/src/validators/purchaseOrder.validator.js
 * Purpose: Joi validation schemas for Purchase Orders API (UC-25 to UC-27).
 * Why it exists: Validates PO headers, line item shapes, positive quantities,
 * and state transitions before requests enter the service layer.
 * ============================================================================
 */

import Joi from 'joi';

const poItemSchema = Joi.object({
  productId: Joi.number().integer().positive(),
  product_id: Joi.number().integer().positive(),
  quantity: Joi.number().integer().positive().max(1000000).required().messages({
    'number.base': 'Item quantity must be a number',
    'number.integer': 'Item quantity must be an integer',
    'number.positive': 'Item quantity must be greater than zero',
    'number.max': 'Item quantity cannot exceed 1,000,000',
    'any.required': 'Item quantity is required',
  }),
  unitCost: Joi.number().min(0).max(99999999.99).precision(2).allow(null).messages({
    'number.min': 'Item unit cost cannot be negative',
    'number.max': 'Item unit cost cannot exceed 99,999,999.99',
  }),
  unit_cost: Joi.number().min(0).max(99999999.99).precision(2).allow(null).messages({
    'number.min': 'Item unit cost cannot be negative',
    'number.max': 'Item unit cost cannot exceed 99,999,999.99',
  }),
}).xor('productId', 'product_id').messages({
  'object.missing': 'Each line item must specify productId or product_id',
  'object.xor': 'Specify either productId or product_id, not both',
});

export const createPOSchema = Joi.object({
  supplierId: Joi.number().integer().positive(),
  supplier_id: Joi.number().integer().positive(),
  warehouseId: Joi.number().integer().positive(),
  warehouse_id: Joi.number().integer().positive(),
  status: Joi.string().valid('draft', 'ordered').default('draft'),
  notes: Joi.string().allow('', null).max(1000).optional(),
  items: Joi.array().items(poItemSchema).min(1).required().messages({
    'array.min': 'Purchase order must have at least one line item',
    'any.required': 'Purchase order line items are required',
  }),
})
  .or('supplierId', 'supplier_id')
  .or('warehouseId', 'warehouse_id')
  .messages({
    'object.missing': 'supplierId and warehouseId are required',
  });

export const updatePOStatusSchema = Joi.object({
  status: Joi.string().valid('ordered', 'received', 'cancelled').required().messages({
    'any.only': 'Status must be one of: ordered, received, cancelled',
    'any.required': 'Status is required',
  }),
});

export const listPOQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  supplierId: Joi.number().integer().positive().optional(),
  supplier_id: Joi.number().integer().positive().optional(),
  warehouseId: Joi.number().integer().positive().optional(),
  warehouse_id: Joi.number().integer().positive().optional(),
  status: Joi.string().valid('draft', 'ordered', 'received', 'cancelled').optional(),
  search: Joi.string().trim().allow('').max(100).optional(),
});

export const poIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required().messages({
    'number.base': 'Purchase order ID must be a positive integer',
    'number.positive': 'Purchase order ID must be a positive integer',
    'any.required': 'Purchase order ID is required',
  }),
});

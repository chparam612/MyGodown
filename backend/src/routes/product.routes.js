/**
 * ============================================================================
 * File: backend/src/routes/product.routes.js
 * Purpose: Express routing definitions for Product Management (Module 2).
 * Why it exists: Binds HTTP endpoints to validation middleware, role-based
 * authorization checks, and controller actions.
 * ============================================================================
 */

import { Router } from 'express';
import productController from '../controllers/product.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createProductSchema,
  updateProductSchema,
  queryProductSchema,
  productIdParamSchema,
} from '../validators/product.validator.js';

const router = Router();

/**
 * @route   POST /api/products
 * @desc    Create a new catalog product (UC-07)
 * @access  Admin, Manager
 */
router.post(
  '/',
  authenticate,
  authorize('admin', 'manager'),
  validate({ body: createProductSchema }),
  asyncHandler((req, res) => productController.create(req, res))
);

/**
 * @route   GET /api/products
 * @desc    List products with pagination, search, category & supplier filters (UC-08)
 * @access  Admin, Manager, Staff (Cost price hidden from Staff)
 */
router.get(
  '/',
  authenticate,
  authorize('admin', 'manager', 'staff'),
  validate({ query: queryProductSchema }),
  asyncHandler((req, res) => productController.list(req, res))
);

/**
 * @route   GET /api/products/:id
 * @desc    Get product details by ID (UC-08)
 * @access  Admin, Manager, Staff (Cost price hidden from Staff)
 */
router.get(
  '/:id',
  authenticate,
  authorize('admin', 'manager', 'staff'),
  validate({ params: productIdParamSchema }),
  asyncHandler((req, res) => productController.getById(req, res))
);

/**
 * @route   PUT /api/products/:id
 * @desc    Update product details (UC-09) - SKU immutable
 * @access  Admin, Manager
 */
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'manager'),
  validate({ params: productIdParamSchema, body: updateProductSchema }),
  asyncHandler((req, res) => productController.update(req, res))
);

/**
 * @route   DELETE /api/products/:id
 * @desc    Soft-deactivate a product (UC-10)
 * @access  Admin, Manager
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin', 'manager'),
  validate({ params: productIdParamSchema }),
  asyncHandler((req, res) => productController.deactivate(req, res))
);

export default router;

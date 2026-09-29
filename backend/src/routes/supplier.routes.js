/**
 * ============================================================================
 * File: backend/src/routes/supplier.routes.js
 * Purpose: Route definitions for Supplier management endpoints (UC-21 to UC-24).
 * Why it exists: Binds routes to controller methods, attaches authentication,
 * role authorization, and Joi validation schemas.
 * ============================================================================
 */

import { Router } from 'express';
import { supplierController } from '../controllers/supplier.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { ROLES } from '../middleware/permissions.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createSupplierSchema,
  updateSupplierSchema,
  listSuppliersQuerySchema,
} from '../validators/supplier.validator.js';

const router = Router();

// All supplier routes require authentication
router.use(authenticate);

// UC-22: View & Search Suppliers (All authenticated roles: Admin, Manager, Staff)
router.get(
  '/',
  validate({ query: listSuppliersQuerySchema }),
  asyncHandler((req, res) => supplierController.getSuppliers(req, res))
);

// UC-22: View Supplier by ID (All authenticated roles; Staff gets 404 for inactive)
router.get(
  '/:id',
  asyncHandler((req, res) => supplierController.getSupplierById(req, res))
);

// UC-21: Add Supplier (Admin & Manager only; Staff gets 403)
router.post(
  '/',
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  validate({ body: createSupplierSchema }),
  asyncHandler((req, res) => supplierController.createSupplier(req, res))
);

// UC-23: Update Supplier (Admin & Manager only; Staff gets 403)
router.put(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  validate({ body: updateSupplierSchema }),
  asyncHandler((req, res) => supplierController.updateSupplier(req, res))
);

// UC-24: Deactivate Supplier (Admin & Manager only; Staff gets 403)
router.delete(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  asyncHandler((req, res) => supplierController.deactivateSupplier(req, res))
);

export default router;

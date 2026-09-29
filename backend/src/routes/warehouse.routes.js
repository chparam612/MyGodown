/**
 * ============================================================================
 * File: backend/src/routes/warehouse.routes.js
 * Purpose: Route definitions for Warehouse Management (UC-11 to UC-13).
 * Why it exists: Exposes RESTful endpoints for warehouse facilities, binding
 * Joi validation and Role-Based Access Control (Admin only for writes, All for reads).
 * ============================================================================
 */

import { Router } from 'express';
import { warehouseController } from '../controllers/warehouse.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { ROLES } from '../middleware/permissions.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createWarehouseSchema,
  updateWarehouseSchema,
  warehouseIdParamSchema,
  listWarehousesQuerySchema,
} from '../validators/warehouse.validator.js';

const router = Router();

// Global authentication for all warehouse operations
router.use(authenticate);

// UC-11: Add Warehouse (Admin only)
router.post(
  '/',
  authorize(ROLES.ADMIN),
  validate({ body: createWarehouseSchema }),
  asyncHandler((req, res) => warehouseController.createWarehouse(req, res))
);

// UC-12: List Warehouses (All authenticated roles: Admin, Manager, Staff)
router.get(
  '/',
  validate({ query: listWarehousesQuerySchema }),
  asyncHandler((req, res) => warehouseController.listWarehouses(req, res))
);

// UC-12: Get Warehouse Details by ID (All authenticated roles: Admin, Manager, Staff)
router.get(
  '/:id',
  validate({ params: warehouseIdParamSchema }),
  asyncHandler((req, res) => warehouseController.getWarehouseById(req, res))
);

// UC-13: Update Warehouse Details (Admin only)
router.put(
  '/:id',
  authorize(ROLES.ADMIN),
  validate({ params: warehouseIdParamSchema, body: updateWarehouseSchema }),
  asyncHandler((req, res) => warehouseController.updateWarehouse(req, res))
);

// UC-13: Deactivate Warehouse (Admin only - soft delete)
router.delete(
  '/:id',
  authorize(ROLES.ADMIN),
  validate({ params: warehouseIdParamSchema }),
  asyncHandler((req, res) => warehouseController.deactivateWarehouse(req, res))
);

export default router;

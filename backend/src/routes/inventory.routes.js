/**
 * ============================================================================
 * File: backend/src/routes/inventory.routes.js
 * Purpose: Route definitions for Inventory & Stock Movement endpoints (UC-14 to UC-20).
 * Why it exists: Exposes RESTful endpoints for stock levels, transfers, adjustments,
 * and movements, binding Joi validation and Role-Based Access Control (RBAC).
 * ============================================================================
 */

import { Router } from 'express';
import { inventoryController } from '../controllers/inventory.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { ROLES } from '../middleware/permissions.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  adjustStockSchema,
  transferStockSchema,
  recordMovementSchema,
  checkAvailabilityQuerySchema,
  listInventoryQuerySchema,
  listMovementsQuerySchema,
  lowStockQuerySchema,
} from '../validators/inventory.validator.js';

const router = Router();

// Global authentication for all inventory endpoints
router.use(authenticate);

// UC-14: View Current Inventory (All authenticated roles: Admin, Manager, Staff)
router.get(
  '/',
  validate({ query: listInventoryQuerySchema }),
  asyncHandler((req, res) => inventoryController.listInventory(req, res))
);

// UC-15: Check Stock Availability (All authenticated roles: Admin, Manager, Staff)
router.get(
  '/availability',
  validate({ query: checkAvailabilityQuerySchema }),
  asyncHandler((req, res) => inventoryController.checkAvailability(req, res))
);

// UC-20: Monitor Low Stock (All authenticated roles: Admin, Manager, Staff - costPrice hidden for staff)
router.get(
  '/low-stock',
  validate({ query: lowStockQuerySchema }),
  asyncHandler((req, res) => inventoryController.getLowStock(req, res))
);

// UC-19: View Stock Movement History (All authenticated roles: Admin, Manager, Staff)
router.get(
  '/movements',
  validate({ query: listMovementsQuerySchema }),
  asyncHandler((req, res) => inventoryController.listMovements(req, res))
);

// UC-16: Record Stock Movement (Admin & Manager only; Staff gets 403)
router.post(
  '/movements',
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  validate({ body: recordMovementSchema }),
  asyncHandler((req, res) => inventoryController.recordMovement(req, res))
);

// UC-17: Adjust Stock (Admin & Manager only; Staff gets 403)
router.post(
  '/adjust',
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  validate({ body: adjustStockSchema }),
  asyncHandler((req, res) => inventoryController.adjustStock(req, res))
);

// UC-18: Transfer Stock (Admin & Manager only; Staff gets 403)
router.post(
  '/transfer',
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  validate({ body: transferStockSchema }),
  asyncHandler((req, res) => inventoryController.transferStock(req, res))
);

export default router;

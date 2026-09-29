/**
 * ============================================================================
 * File: backend/src/routes/salesOrder.routes.js
 * Purpose: Express router for Sales Orders endpoints (UC-28 to UC-30).
 * Why it exists: Binds routes to validation middleware, RBAC checks, and controllers.
 * Access Control:
 *   - create, view, confirm, fulfil: admin, manager, staff
 *   - cancel: admin, manager only (staff receives 403 Forbidden)
 * ============================================================================
 */

import { Router } from 'express';
import { salesOrderController } from '../controllers/salesOrder.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../middleware/permissions.js';
import {
  createSOSchema,
  updateSOStatusSchema,
  listSOQuerySchema,
  soIdParamSchema,
} from '../validators/salesOrder.validator.js';

const router = Router();

// Protect ALL sales order routes: Authentication required
router.use(authenticate);

// UC-28: Create Sales Order (admin, manager, staff)
router.post(
  '/',
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF),
  validate(createSOSchema, 'body'),
  salesOrderController.create
);

// UC-29: View Sales Orders (list: admin, manager, staff)
router.get(
  '/',
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF),
  validate(listSOQuerySchema, 'query'),
  salesOrderController.list
);

// UC-29: View Sales Order by ID (admin, manager, staff)
router.get(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF),
  validate(soIdParamSchema, 'params'),
  salesOrderController.getById
);

// UC-30: State transition endpoint
router.patch(
  '/:id/status',
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF),
  validate({ params: soIdParamSchema, body: updateSOStatusSchema }),
  salesOrderController.updateStatus
);

// Confirm Sales Order
router.post(
  '/:id/confirm',
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF),
  validate(soIdParamSchema, 'params'),
  salesOrderController.confirm
);

// UC-30: Fulfill Sales Order
router.post(
  '/:id/fulfill',
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF),
  validate(soIdParamSchema, 'params'),
  salesOrderController.fulfill
);

// Cancel Sales Order (Admin and Manager only; Staff blocked with 403 Forbidden)
router.post(
  '/:id/cancel',
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  validate(soIdParamSchema, 'params'),
  salesOrderController.cancel
);

export default router;

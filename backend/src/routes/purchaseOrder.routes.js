/**
 * ============================================================================
 * File: backend/src/routes/purchaseOrder.routes.js
 * Purpose: Express router for Purchase Orders endpoints (UC-25 to UC-27).
 * Why it exists: Binds routes to validation middleware, RBAC checks, and controllers.
 * Access Control: Admin and Manager only (Staff blocked with 403 Forbidden).
 * ============================================================================
 */

import { Router } from 'express';
import { purchaseOrderController } from '../controllers/purchaseOrder.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../middleware/permissions.js';
import {
  createPOSchema,
  updatePOStatusSchema,
  listPOQuerySchema,
  poIdParamSchema,
} from '../validators/purchaseOrder.validator.js';

const router = Router();

// Protect ALL purchase order routes: Authentication required, Admin and Manager only
router.use(authenticate);
router.use(authorize(ROLES.ADMIN, ROLES.MANAGER));

// UC-25: Create Purchase Order
router.post(
  '/',
  validate(createPOSchema, 'body'),
  purchaseOrderController.create
);

// UC-26: View Purchase Orders (list)
router.get(
  '/',
  validate(listPOQuerySchema, 'query'),
  purchaseOrderController.list
);

// UC-26: View Purchase Order by ID
router.get(
  '/:id',
  validate(poIdParamSchema, 'params'),
  purchaseOrderController.getById
);

// UC-P08 / UC-26: Update Draft Purchase Order (supplier, warehouse, line items)
router.put(
  '/:id',
  validate({ params: poIdParamSchema, body: createPOSchema }),
  purchaseOrderController.update
);

// State transition endpoint
router.patch(
  '/:id/status',
  validate({ params: poIdParamSchema, body: updatePOStatusSchema }),
  purchaseOrderController.updateStatus
);

// UC-27: Receive Purchase Order
router.post(
  '/:id/receive',
  validate(poIdParamSchema, 'params'),
  purchaseOrderController.receive
);

// Cancel Purchase Order
router.post(
  '/:id/cancel',
  validate(poIdParamSchema, 'params'),
  purchaseOrderController.cancel
);

export default router;

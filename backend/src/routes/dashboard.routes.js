/**
 * ============================================================================
 * File: backend/src/routes/dashboard.routes.js
 * Purpose: Express router for Dashboard summary endpoints (UC-32).
 * Why it exists: Binds routes to authentication and dashboard controller.
 * Access Control: Open to all authenticated roles (admin, manager, staff).
 * Note: Staff users have stockValue omitted in the service layer (BR-05).
 * ============================================================================
 */

import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { ROLES } from '../middleware/permissions.js';

const router = Router();

// Protect ALL dashboard routes: Authentication required
router.use(authenticate);

// UC-32: View Dashboard Summary (admin, manager, staff)
router.get(
  '/summary',
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF),
  dashboardController.getSummary
);

export default router;

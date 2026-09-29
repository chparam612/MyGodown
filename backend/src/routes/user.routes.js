/**
 * ============================================================================
 * File: backend/src/routes/user.routes.js
 * Purpose: User Management routes (UC-04 to UC-06).
 * Why it exists: Exposes Administrator endpoints for user creation, listing,
 * details retrieval, profile updating, and soft deactivation.
 * ============================================================================
 */

import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { ROLES } from '../middleware/permissions.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createUserSchema,
  updateUserSchema,
  userIdParamSchema,
  listUsersQuerySchema,
  adminResetPasswordSchema,
} from '../validators/user.validator.js';

const router = Router();

// All user management routes require Administrator privileges
router.use(authenticate);
router.use(authorize(ROLES.ADMIN));

// UC-04: Create User
router.post(
  '/',
  validate({ body: createUserSchema }),
  asyncHandler((req, res) => userController.createUser(req, res))
);

// UC-05: List Users
router.get(
  '/',
  validate({ query: listUsersQuerySchema }),
  asyncHandler((req, res) => userController.listUsers(req, res))
);

// UC-05: Get User by ID
router.get(
  '/:id',
  validate({ params: userIdParamSchema }),
  asyncHandler((req, res) => userController.getUserById(req, res))
);

// UC-06: Update User
router.put(
  '/:id',
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  asyncHandler((req, res) => userController.updateUser(req, res))
);

// UC-06: Deactivate User (Soft delete)
router.delete(
  '/:id',
  validate({ params: userIdParamSchema }),
  asyncHandler((req, res) => userController.deactivateUser(req, res))
);

// Admin Reset User Password
router.post(
  '/:id/reset-password',
  validate({ params: userIdParamSchema, body: adminResetPasswordSchema }),
  asyncHandler((req, res) => userController.resetPassword(req, res))
);

export default router;

/**
 * ============================================================================
 * File: backend/src/routes/auth.routes.js
 * Purpose: Authentication routes (UC-01, UC-02, UC-03).
 * Why it exists: Exposes endpoints for user login, profile identity check,
 * and authenticated password change.
 * ============================================================================
 */

import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { loginRateLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { loginSchema, changePasswordSchema } from '../validators/auth.validator.js';

const router = Router();

// UC-01: User Login
router.post(
  '/login',
  loginRateLimiter,
  validate({ body: loginSchema }),
  asyncHandler((req, res) => authController.login(req, res))
);

// UC-02: Get Current User Profile (me)
router.get(
  '/me',
  authenticate,
  asyncHandler((req, res) => authController.getMe(req, res))
);

// UC-03: Change Own Password
router.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncHandler((req, res) => authController.changePassword(req, res))
);

export default router;

/**
 * ============================================================================
 * File: backend/src/controllers/auth.controller.js
 * Purpose: HTTP controller for Authentication endpoints.
 * Why it exists: Handles request parsing and standard response formatting for
 * login, session identity check, and password changes. Contains zero SQL.
 * ============================================================================
 */

import { authService } from '../services/auth.service.js';
import { sendSuccess } from '../utils/response.js';

export class AuthController {
  async login(req, res) {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    return sendSuccess(res, result, 200);
  }

  async getMe(req, res) {
    const user = await authService.getMe(req.user.id);
    return sendSuccess(res, user, 200);
  }

  async changePassword(req, res) {
    const currentPassword = req.body.current_password || req.body.currentPassword;
    const newPassword = req.body.new_password || req.body.newPassword;
    const result = await authService.changePassword(req.user.id, currentPassword, newPassword);
    return sendSuccess(res, result, 200);
  }
}

export const authController = new AuthController();

/**
 * ============================================================================
 * File: backend/src/controllers/user.controller.js
 * Purpose: HTTP controller for User Management endpoints (UC-03 to UC-06).
 * Why it exists: Dispatches user CRUD requests to UserService and sends
 * structured JSON responses. Contains zero direct SQL.
 * ============================================================================
 */

import { userService } from '../services/user.service.js';
import { sendSuccess } from '../utils/response.js';

export class UserController {
  async createUser(req, res) {
    const user = await userService.createUser(req.body);
    return sendSuccess(res, user, 201);
  }

  async listUsers(req, res) {
    const { users, pagination } = await userService.listUsers(req.query);
    return sendSuccess(res, users, 200, pagination);
  }

  async getUserById(req, res) {
    const user = await userService.getUserById(req.params.id);
    return sendSuccess(res, user, 200);
  }

  async updateUser(req, res) {
    const user = await userService.updateUser(req.params.id, req.body, req.user.id);
    return sendSuccess(res, user, 200);
  }

  async deactivateUser(req, res) {
    const result = await userService.deactivateUser(req.params.id, req.user.id);
    return sendSuccess(res, result, 200);
  }

  async resetPassword(req, res) {
    const result = await userService.resetPassword(req.params.id, req.body.password);
    return sendSuccess(res, result, 200);
  }
}

export const userController = new UserController();

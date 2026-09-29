/**
 * ============================================================================
 * File: backend/src/services/user.service.js
 * Purpose: User management business logic (UC-03 to UC-06).
 * Why it exists: Enforces business constraints on user creation, updates, and
 * deactivations, protecting the last active administrator and preventing self-demotion.
 * ============================================================================
 */

import bcrypt from 'bcryptjs';
import { userRepository } from '../repositories/user.repository.js';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from '../utils/errors.js';

const BCRYPT_ROUNDS = 10;

export class UserService {
  /**
   * Creates a new user record.
   * Checks for email duplication (409 ConflictError).
   */
  async createUser({ name, email, password, role }) {
    const existing = await userRepository.findByEmailWithPassword(email);
    if (existing) {
      throw new ConflictError('A user with this email address already exists');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    return userRepository.create({
      name,
      email,
      passwordHash,
      role,
      isActive: 1,
    });
  }

  /**
   * Retrieves paginated list of users with optional filtering.
   */
  async listUsers({ role, is_active, isActive, search, page = 1, limit = 20 }) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const activeInput = isActive !== undefined ? isActive : is_active;
    const isActiveFilter = activeInput !== undefined ? (activeInput === 'true' || activeInput === true || activeInput === '1' || activeInput === 1) : undefined;

    const { users, total } = await userRepository.findAll({
      role,
      isActive: isActiveFilter,
      search,
      offset,
      limit: limitNum,
    });

    const totalPages = Math.ceil(total / limitNum) || 1;

    return {
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
    };
  }

  /**
   * Retrieves single user by ID.
   */
  async getUserById(id) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new NotFoundError(`User with ID ${id} not found`);
    }
    return user;
  }

  /**
   * Updates an existing user record.
   * Enforces rules against self-deactivation, self-demotion, and last-admin removal.
   */
  async updateUser(id, updateData, actingAdminId) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new NotFoundError(`User with ID ${id} not found`);
    }

    // Check email uniqueness if email is being updated
    if (updateData.email && updateData.email !== user.email) {
      const emailConflict = await userRepository.findByEmailWithPassword(updateData.email);
      if (emailConflict) {
        throw new ConflictError('Email address is already in use by another user');
      }
    }

    // Rule: Prevent admin from deactivating or demoting themselves
    if (Number(id) === Number(actingAdminId)) {
      const deactivatingSelf =
        updateData.is_active === false ||
        updateData.is_active === 0 ||
        updateData.isActive === false ||
        updateData.isActive === 0;

      if (deactivatingSelf) {
        throw new ForbiddenError('Administrators cannot deactivate their own account');
      }
      if (updateData.role && updateData.role !== 'admin') {
        throw new ForbiddenError('Administrators cannot demote their own role');
      }
    }

    // Rule: Prevent removing or demoting the last active administrator
    const isTargetAdmin = user.role === 'admin' && Boolean(user.isActive !== undefined ? user.isActive : user.is_active);
    const willBeDemoted = updateData.role && updateData.role !== 'admin';
    const willBeDeactivated =
      updateData.is_active === false ||
      updateData.is_active === 0 ||
      updateData.isActive === false ||
      updateData.isActive === 0;

    if (isTargetAdmin && (willBeDemoted || willBeDeactivated)) {
      const activeAdminCount = await userRepository.countActiveAdmins();
      if (activeAdminCount <= 1) {
        throw new ForbiddenError('Cannot deactivate or demote the last remaining active administrator');
      }
    }

    return userRepository.update(id, updateData);
  }

  /**
   * Resets another user's password (Admin only).
   */
  async resetPassword(id, newPassword) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new NotFoundError(`User with ID ${id} not found`);
    }

    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await userRepository.update(id, { passwordHash });
    return { id: Number(id), message: 'Password reset successfully' };
  }

  /**
   * Soft-deactivates user (is_active = 0).
   * Enforces rules against self-deactivation and last-admin deactivation.
   */
  async deactivateUser(id, actingAdminId) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new NotFoundError(`User with ID ${id} not found`);
    }

    if (Number(id) === Number(actingAdminId)) {
      throw new ForbiddenError('Administrators cannot deactivate their own account');
    }

    if (user.role === 'admin' && Boolean(user.isActive !== undefined ? user.isActive : user.is_active)) {
      const activeAdminCount = await userRepository.countActiveAdmins();
      if (activeAdminCount <= 1) {
        throw new ForbiddenError('Cannot deactivate the last remaining active administrator');
      }
    }

    await userRepository.update(id, { isActive: false });
    return { id: Number(id), isActive: false, message: 'User successfully deactivated' };
  }
}

export const userService = new UserService();

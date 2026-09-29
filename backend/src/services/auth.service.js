/**
 * ============================================================================
 * File: backend/src/services/auth.service.js
 * Purpose: Authentication business logic (login, identity, password management).
 * Why it exists: Enforces credential validation, session token issuance,
 * and security rules while keeping controllers free of business logic.
 * ============================================================================
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { userRepository } from '../repositories/user.repository.js';
import { UnauthorizedError, NotFoundError } from '../utils/errors.js';

const BCRYPT_ROUNDS = 10;

export class AuthService {
  /**
   * Authenticates user credentials and returns signed JWT token.
   * Uses generic error message to prevent user enumeration attacks.
   */
  async login(email, password) {
    const user = await userRepository.findByEmailWithPassword(email);

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isActive = user.isActive !== undefined ? user.isActive : user.is_active;
    if (!isActive) {
      throw new UnauthorizedError('User account has been deactivated');
    }

    // JWT payload contains id and role only
    const payload = {
      id: user.id,
      role: user.role,
    };

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET || 'super_secret_jwt_key_rims_2026_secure',
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: Boolean(isActive),
      },
    };
  }

  /**
   * Retrieves profile of currently authenticated user.
   */
  async getMe(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User profile not found');
    }
    return user;
  }

  /**
   * Changes password for an authenticated user after verifying current password.
   */
  async changePassword(userId, currentPassword, newPassword) {
    const user = await userRepository.findByIdWithPassword(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      throw new UnauthorizedError('Current password does not match');
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await userRepository.update(userId, { passwordHash: newHash });

    return { message: 'Password changed successfully' };
  }
}

export const authService = new AuthService();

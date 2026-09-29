/**
 * ============================================================================
 * File: backend/tests/auth_users.test.js
 * Purpose: Integration tests for Module 1 (Auth + Users: UC-01 to UC-06).
 * Why it exists: Verifies login, token authentication, role authorization,
 * password rules, admin self-protection, and soft deactivation against inventory_test_db.
 * ============================================================================
 */

import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { setupTestDatabase } from './setupTestDb.js';

describe('Module 1: Auth & User Management (UC-01 to UC-06)', () => {
  let adminToken;
  let managerToken;
  let staffToken;

  beforeAll(async () => {
    // Reset test database to clean baseline state
    await setupTestDatabase();

    // Authenticate baseline seed users (password: Admin@123)
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'Admin@123' });
    adminToken = adminLogin.body.data.token;

    const managerLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'manager@test.com', password: 'Admin@123' });
    managerToken = managerLogin.body.data.token;

    const staffLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'staff@test.com', password: 'Admin@123' });
    staffToken = staffLogin.body.data.token;
  });

  afterAll(async () => {
    await pool.end();
  });

  // --------------------------------------------------------------------------
  // UC-01: Login
  // --------------------------------------------------------------------------
  describe('UC-01: Login', () => {
    test('Happy path: Valid credentials returns 200 with JWT and user profile', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'Admin@123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data.user).toMatchObject({
        id: 1,
        email: 'admin@test.com',
        role: 'admin',
      });
      expect(res.body.data.user).not.toHaveProperty('password_hash');
    });

    test('Validation failure: Missing password returns 400', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(res.body.error.details)).toBe(true);
    });

    test('Unknown email returns generic 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@test.com', password: 'Admin@123' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Invalid email or password');
    });

    test('Wrong password on active account returns generic 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'WrongPassword999!' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Invalid email or password');
    });

    test('Wrong password on deactivated account returns generic 401 (prevents user enumeration)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'inactive@test.com', password: 'WrongPassword999!' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Invalid email or password');
    });

    test('Correct password on deactivated account returns 401 with deactivated message', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'inactive@test.com', password: 'Admin@123' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('User account has been deactivated');
    });
  });

  // --------------------------------------------------------------------------
  // UC-02: Get Current User (Me)
  // --------------------------------------------------------------------------
  describe('UC-02: Get Current User Profile', () => {
    test('Authenticated request returns 200 with user profile without password', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        id: 1,
        email: 'admin@test.com',
        role: 'admin',
      });
      expect(res.body.data).not.toHaveProperty('password_hash');
    });

    test('Unauthenticated request without token returns 401', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // UC-03: Change Own Password
  // --------------------------------------------------------------------------
  describe('UC-03: Change Own Password', () => {
    test('Happy path: Change password with valid credentials returns 200', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          current_password: 'Admin@123',
          new_password: 'NewPassword123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify new password works
      const loginCheck = await request(app)
        .post('/api/auth/login')
        .send({ email: 'staff@test.com', password: 'NewPassword123!' });
      expect(loginCheck.status).toBe(200);

      // Restore password
      await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${loginCheck.body.data.token}`)
        .send({
          current_password: 'NewPassword123!',
          new_password: 'Admin@123',
        });
    });

    test('Wrong current password returns 401', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          current_password: 'IncorrectPassword!',
          new_password: 'ValidPassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('Weak new password failing Joi rules returns 400', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          current_password: 'Admin@123',
          new_password: 'weak',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // --------------------------------------------------------------------------
  // UC-04: Create User
  // --------------------------------------------------------------------------
  describe('UC-04: Create User', () => {
    test('Admin can create a new user (201 Created)', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'New Warehouse Clerk',
          email: 'clerk@test.com',
          password: 'ClerkPassword123!',
          role: 'staff',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        name: 'New Warehouse Clerk',
        email: 'clerk@test.com',
        role: 'staff',
        isActive: true,
      });
      expect(res.body.data).not.toHaveProperty('password_hash');
    });

    test('Duplicate email returns 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate Admin',
          email: 'admin@test.com',
          password: 'Password123!',
          role: 'staff',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    test('Manager role is denied creating user (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Unauthorized User',
          email: 'unauth@test.com',
          password: 'Password123!',
          role: 'staff',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Staff role is denied creating user (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          name: 'Unauthorized User',
          email: 'unauth2@test.com',
          password: 'Password123!',
          role: 'staff',
        });

      expect(res.status).toBe(403);
    });
  });

  // --------------------------------------------------------------------------
  // UC-05: List & Get Users
  // --------------------------------------------------------------------------
  describe('UC-05: List & Get Users', () => {
    test('Admin can list users with pagination meta', async () => {
      const res = await request(app)
        .get('/api/users?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toHaveProperty('total');
      expect(res.body.meta).toHaveProperty('page', 1);
      expect(res.body.meta).toHaveProperty('limit', 10);
    });

    test('Admin can get user by ID', async () => {
      const res = await request(app)
        .get('/api/users/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(1);
      expect(res.body.data).not.toHaveProperty('password_hash');
    });

    test('Non-existent ID returns 404', async () => {
      const res = await request(app)
        .get('/api/users/99999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    test('Staff role is denied listing users (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
    });

    test('Manager role is denied listing users (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Staff role is denied getting user by ID (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/users/1')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Manager role is denied getting user by ID (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/users/1')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // --------------------------------------------------------------------------
  // UC-06: Update & Deactivate User (Safety Rules)
  // --------------------------------------------------------------------------
  describe('UC-06: Update & Deactivate User', () => {
    test('Admin can update another user name or role', async () => {
      const res = await request(app)
        .put('/api/users/3')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Senior Sales Staff' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Senior Sales Staff');
    });

    test('Admin cannot demote their own role (403 Forbidden)', async () => {
      const res = await request(app)
        .put('/api/users/1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'manager' });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/cannot demote their own role/i);
    });

    test('Admin cannot deactivate their own account via PUT (403 Forbidden)', async () => {
      const res = await request(app)
        .put('/api/users/1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ is_active: false });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/cannot deactivate their own account/i);
    });

    test('Admin cannot deactivate their own account via DELETE (403 Forbidden)', async () => {
      const res = await request(app)
        .delete('/api/users/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/cannot deactivate their own account/i);
    });

    test('Admin can soft-deactivate another user (DELETE /api/users/:id)', async () => {
      const res = await request(app)
        .delete('/api/users/3')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: 3, isActive: false });

      // Verify that deactivated user token is immediately rejected on /api/auth/me
      const meCheck = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(meCheck.status).toBe(401);
      expect(meCheck.body.error.message).toMatch(/deactivated/i);

      // Verify that deactivated user token is rejected on other protected routes like /api/products
      const productsCheck = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(productsCheck.status).toBe(401);
      expect(productsCheck.body.error.message).toMatch(/deactivated/i);
    });

    test('Admin can reactivate a deactivated user (PUT /api/users/:id with isActive: true)', async () => {
      // Reactivate user 3
      const reactivateRes = await request(app)
        .put('/api/users/3')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true });

      expect(reactivateRes.status).toBe(200);
      expect(reactivateRes.body.data.isActive).toBe(true);

      // Verify reactivated user can now log in and make authenticated requests
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'staff@test.com', password: 'Admin@123' });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.token).toBeDefined();

      const newStaffToken = loginRes.body.data.token;
      const meCheck = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${newStaffToken}`);
      expect(meCheck.status).toBe(200);
    });

    test('Last active admin cannot be deactivated or demoted (403 Forbidden)', async () => {
      const { userService } = await import('../src/services/user.service.js');
      // When only 1 admin is active in the system, deactivating or demoting that admin throws 403 Forbidden
      await expect(
        userService.updateUser(1, { role: 'manager' }, 9999)
      ).rejects.toThrow('Cannot deactivate or demote the last remaining active administrator');

      await expect(
        userService.deactivateUser(1, 9999)
      ).rejects.toThrow('Cannot deactivate the last remaining active administrator');
    });
  });

  // --------------------------------------------------------------------------
  // Admin Reset User Password (UC-P02)
  // --------------------------------------------------------------------------
  describe('Admin Reset User Password (UC-P02)', () => {
    test('Admin can reset another user password (200 OK)', async () => {
      const res = await request(app)
        .post('/api/users/3/reset-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'ResetPassword@123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toMatch(/password reset successfully/i);

      // Verify the user can log in with new password
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'staff@test.com', password: 'ResetPassword@123' });
      expect(loginRes.status).toBe(200);

      // Restore password back to Admin@123 for subsequent tests
      await request(app)
        .post('/api/users/3/reset-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'Admin@123' });
    });

    test('Manager role is denied resetting password (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/users/3/reset-password')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ password: 'ResetPassword@123' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Staff role is denied resetting password (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/users/3/reset-password')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ password: 'ResetPassword@123' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Weak password returns 400 Bad Request (Validation Error)', async () => {
      const res = await request(app)
        .post('/api/users/3/reset-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'weak' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('Non-existent user ID returns 404 Not Found', async () => {
      const res = await request(app)
        .post('/api/users/999999/reset-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'ResetPassword@123' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // --------------------------------------------------------------------------
  // Rate Limiting (BR-01)
  // --------------------------------------------------------------------------
  describe('Rate Limiter (BR-01)', () => {
    test('createRateLimiter returns 429 with standard error envelope when limit exceeded', async () => {
      const express = (await import('express')).default;
      const { createRateLimiter } = await import('../src/middleware/rateLimiter.js');
      const testLimiterApp = express();
      testLimiterApp.use(express.json());
      testLimiterApp.post('/test-rate-limit', createRateLimiter({ max: 2, windowMs: 60000 }), (req, res) => {
        res.status(200).json({ success: true, message: 'OK' });
      });

      const res1 = await request(testLimiterApp).post('/test-rate-limit');
      expect(res1.status).toBe(200);

      const res2 = await request(testLimiterApp).post('/test-rate-limit');
      expect(res2.status).toBe(200);

      const res3 = await request(testLimiterApp).post('/test-rate-limit');
      expect(res3.status).toBe(429);
      expect(res3.body).toEqual({
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many authentication attempts from this IP, please try again later.',
        },
      });
    });
  });
});

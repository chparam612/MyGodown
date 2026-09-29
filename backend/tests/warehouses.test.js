/**
 * ============================================================================
 * File: backend/tests/warehouses.test.js
 * Purpose: Integration tests for Module 3 (Warehouses: UC-11 to UC-13).
 * Why it exists: Verifies warehouse creation, uniqueness, role authorizations,
 * stock-guarded deactivation (BR-08), code immutability, and search filtering
 * against inventory_test_db.
 * ============================================================================
 */

import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { setupTestDatabase } from './setupTestDb.js';

describe('Module 3: Warehouse Management (UC-11 to UC-13)', () => {
  let adminToken;
  let managerToken;
  let staffToken;

  beforeAll(async () => {
    // Reset test database to clean baseline state
    await setupTestDatabase();

    // Authenticate baseline test users (seeded with Admin@123 in testDb)
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
  // UC-11: Add Warehouse
  // --------------------------------------------------------------------------
  describe('UC-11: Add Warehouse', () => {
    const uniqueCode = `WH-TEST-${Date.now().toString().slice(-4)}`;

    test('Happy path: Administrator can create a warehouse (201 Created)', async () => {
      const res = await request(app)
        .post('/api/warehouses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Northern Regional Hub',
          code: uniqueCode,
          city: 'Minneapolis',
          address: '500 Logistics Way, Suite 100',
          isActive: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        name: 'Northern Regional Hub',
        code: uniqueCode,
        city: 'Minneapolis',
        address: '500 Logistics Way, Suite 100',
        isActive: true,
      });
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.createdAt).toBeDefined();
    });

    test('Conflict: Duplicate warehouse code returns 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/warehouses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Another Hub',
          code: uniqueCode, // duplicate
          city: 'Saint Paul',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toMatch(/already exists/i);
    });

    test('Validation failure: Missing required fields returns 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/warehouses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Incomplete Hub',
          // missing code and city
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(res.body.error.details)).toBe(true);
    });

    test('Validation failure: Invalid code characters returns 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/warehouses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Invalid Code Hub',
          code: 'WH SPACE !@#',
          city: 'Chicago',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('Authorization: Warehouse Manager is denied creating warehouse (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/warehouses')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Manager Attempt Hub',
          code: 'WH-MGR-FAIL',
          city: 'Dallas',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Authorization: Staff is denied creating warehouse (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/warehouses')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          name: 'Staff Attempt Hub',
          code: 'WH-STAFF-FAIL',
          city: 'Austin',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Authentication: Unauthenticated request returns 401', async () => {
      const res = await request(app)
        .post('/api/warehouses')
        .send({
          name: 'Unauth Hub',
          code: 'WH-UNAUTH',
          city: 'Boston',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // UC-12: View and Search Warehouses
  // --------------------------------------------------------------------------
  describe('UC-12: View and Search Warehouses', () => {
    test('Happy path: All authenticated roles can list warehouses with pagination', async () => {
      // Test for Staff role
      const res = await request(app)
        .get('/api/warehouses?page=1&limit=10')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.meta).toMatchObject({
        page: 1,
        limit: 10,
      });
      expect(res.body.meta.total).toBeDefined();

      // Check camelCase fields on warehouse object
      const firstWh = res.body.data[0];
      expect(firstWh).toHaveProperty('id');
      expect(firstWh).toHaveProperty('name');
      expect(firstWh).toHaveProperty('code');
      expect(firstWh).toHaveProperty('city');
      expect(firstWh).toHaveProperty('isActive');
      expect(firstWh).toHaveProperty('totalStock');
      expect(firstWh).toHaveProperty('productCount');
      expect(firstWh).toHaveProperty('createdAt');
      expect(firstWh).toHaveProperty('updatedAt');
    });

    test('Search: Filter warehouses by keyword matching name, code, or city', async () => {
      const res = await request(app)
        .get('/api/warehouses?search=Central')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].code).toBe('WH-CENTRAL');
    });

    test('Filter: Filter warehouses by city', async () => {
      const res = await request(app)
        .get('/api/warehouses?city=Newark')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].city).toBe('Newark');
    });

    test('Single lookup: All authenticated roles can get warehouse by ID with stock counts', async () => {
      const res = await request(app)
        .get('/api/warehouses/1')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(1);
      expect(res.body.data.code).toBe('WH-CENTRAL');
      expect(res.body.data.totalStock).toBeGreaterThan(0);
      expect(res.body.data.productCount).toBeGreaterThan(0);
    });

    test('Single lookup: Non-existent ID returns 404 Not Found', async () => {
      const res = await request(app)
        .get('/api/warehouses/999999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // --------------------------------------------------------------------------
  // UC-13: Update and Deactivate Warehouse
  // --------------------------------------------------------------------------
  describe('UC-13: Update and Deactivate Warehouse', () => {
    let emptyWarehouseId;

    beforeAll(async () => {
      // Create a warehouse with zero stock for deactivation tests
      const res = await request(app)
        .post('/api/warehouses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Empty Staging Facility',
          code: `WH-EMPTY-${Date.now().toString().slice(-4)}`,
          city: 'Omaha',
          address: '123 Plain St',
          isActive: true,
        });
      emptyWarehouseId = res.body.data.id;
    });

    test('Happy path: Administrator can update warehouse attributes (200 OK)', async () => {
      const res = await request(app)
        .put(`/api/warehouses/${emptyWarehouseId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Empty Staging Facility (Renamed)',
          city: 'Lincoln',
          address: '456 Updated Boulevard',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Empty Staging Facility (Renamed)');
      expect(res.body.data.city).toBe('Lincoln');
      expect(res.body.data.address).toBe('456 Updated Boulevard');
    });

    test('BR Guard: Warehouse code is immutable after creation (400 Bad Request)', async () => {
      const res = await request(app)
        .put(`/api/warehouses/${emptyWarehouseId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'WH-MODIFIED-FAIL',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/cannot be modified after creation/i);
    });

    test('Authorization: Warehouse Manager is denied updating warehouse (403 Forbidden)', async () => {
      const res = await request(app)
        .put(`/api/warehouses/${emptyWarehouseId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ name: 'Manager Attempt Update' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Authorization: Staff is denied updating warehouse (403 Forbidden)', async () => {
      const res = await request(app)
        .put(`/api/warehouses/${emptyWarehouseId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'Staff Attempt Update' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('BR-08: Deactivation blocked if warehouse holds inventory stock (422 Unprocessable Entity)', async () => {
      // Warehouse 1 has stock seeded in seed.sql
      const res = await request(app)
        .delete('/api/warehouses/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
      expect(res.body.error.message).toMatch(/holds inventory stock/i);
    });

    test('BR-08: PUT deactivation also blocked if warehouse holds stock (422 Unprocessable Entity)', async () => {
      const res = await request(app)
        .put('/api/warehouses/1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
      expect(res.body.error.message).toMatch(/holds inventory stock/i);
    });

    test('Authorization: Warehouse Manager denied deactivating warehouse (403 Forbidden)', async () => {
      const res = await request(app)
        .delete(`/api/warehouses/${emptyWarehouseId}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Authorization: Staff denied deactivating warehouse (403 Forbidden)', async () => {
      const res = await request(app)
        .delete(`/api/warehouses/${emptyWarehouseId}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Happy path: Administrator can soft-deactivate warehouse with 0 stock (200 OK)', async () => {
      const res = await request(app)
        .delete(`/api/warehouses/${emptyWarehouseId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        id: emptyWarehouseId,
        isActive: false,
      });

      // Verify that Staff lookup on deactivated warehouse returns 404 Not Found
      const staffLookup = await request(app)
        .get(`/api/warehouses/${emptyWarehouseId}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(staffLookup.status).toBe(404);
      expect(staffLookup.body.error.code).toBe('NOT_FOUND');
    });

    test('Reactivation: Administrator can reactivate warehouse via PUT (200 OK)', async () => {
      const res = await request(app)
        .put(`/api/warehouses/${emptyWarehouseId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isActive).toBe(true);

      // Now Staff can access the warehouse again
      const staffLookup = await request(app)
        .get(`/api/warehouses/${emptyWarehouseId}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(staffLookup.status).toBe(200);
      expect(staffLookup.body.data.id).toBe(emptyWarehouseId);
    });

    test('Not Found: Updating non-existent warehouse returns 404', async () => {
      const res = await request(app)
        .put('/api/warehouses/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Non Existent' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    test('Not Found: Deactivating non-existent warehouse returns 404', async () => {
      const res = await request(app)
        .delete('/api/warehouses/999999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});

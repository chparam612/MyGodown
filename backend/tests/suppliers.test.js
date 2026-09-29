/**
 * ============================================================================
 * File: backend/tests/suppliers.test.js
 * Purpose: Integration tests for Module 5 (Supplier Management: UC-21 to UC-24).
 * Why it exists: Proves CRUD operations, uniqueness constraints, RBAC,
 * open purchase order deactivation guards (BR-07), and staff inactive masking.
 * ============================================================================
 */

import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { setupTestDatabase } from './setupTestDb.js';

describe('Module 5: Supplier Management (UC-21 to UC-24)', () => {
  let adminToken;
  let managerToken;
  let staffToken;

  beforeAll(async () => {
    await setupTestDatabase();

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
  // UC-21: Add Supplier
  // --------------------------------------------------------------------------
  describe('UC-21: Add Supplier', () => {
    test('Happy path: Administrator can create a supplier (201 Created)', async () => {
      const res = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Apex Precision Tools Inc.',
          contactName: 'Arthur Dent',
          email: 'arthur@apexprecision.com',
          phone: '+1-555-0199',
          address: '42 Galaxy Way, Suite 100',
          isActive: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        name: 'Apex Precision Tools Inc.',
        contactName: 'Arthur Dent',
        email: 'arthur@apexprecision.com',
        phone: '+1-555-0199',
        isActive: true,
      });
      expect(res.body.data.id).toBeDefined();
    });

    test('Happy path: Warehouse Manager can create a supplier (201 Created)', async () => {
      const res = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'OmniFlow Hydraulics Ltd.',
          contactName: 'Ford Prefect',
          email: 'ford@omniflow.com',
          phone: '+1-555-0288',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('OmniFlow Hydraulics Ltd.');
      expect(res.body.data.isActive).toBe(true);
    });

    test('Allowed: Multiple suppliers can share the same name (201 Created)', async () => {
      const res = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Apex Precision Tools Inc.',
          email: 'unique_apex@test.com',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Apex Precision Tools Inc.');
      expect(res.body.data.email).toBe('unique_apex@test.com');
    });

    test('Conflict: Duplicate supplier email returns 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Brand New Unique Supplier',
          email: 'arthur@apexprecision.com', // Duplicate email
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toMatch(/email/i);
    });

    test('Validation failure: Missing required supplier name returns 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'noname@supplier.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('Validation failure: Invalid email format returns 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Invalid Email Supplier',
          email: 'not-a-valid-email',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('Authorization: Staff is denied creating supplier (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          name: 'Staff Supplier Attempt',
          email: 'staff@supplier.com',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Authentication: Unauthenticated request returns 401', async () => {
      const res = await request(app)
        .post('/api/suppliers')
        .send({ name: 'Unauth Supplier' });

      expect(res.status).toBe(401);
    });
  });

  // --------------------------------------------------------------------------
  // UC-22: View & Search Suppliers
  // --------------------------------------------------------------------------
  describe('UC-22: View & Search Suppliers', () => {
    test('Happy path: All authenticated roles can list suppliers with pagination meta', async () => {
      const res = await request(app)
        .get('/api/suppliers?page=1&limit=5')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.meta).toMatchObject({
        page: 1,
        limit: 5,
      });

      const s = res.body.data[0];
      expect(s).toHaveProperty('id');
      expect(s).toHaveProperty('name');
      expect(s).toHaveProperty('isActive');
      expect(s).toHaveProperty('productCount');
    });

    test('Search: Filter suppliers by search keyword matching name or email', async () => {
      const res = await request(app)
        .get('/api/suppliers?search=Apex')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.some((s) => s.name.includes('Apex'))).toBe(true);
    });

    test('Filter: Filter suppliers by isActive flag', async () => {
      const res = await request(app)
        .get('/api/suppliers?isActive=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((s) => s.isActive === true)).toBe(true);
    });

    test('Single lookup: All authenticated roles can get supplier by ID with productCount', async () => {
      // Seed supplier 1 (VoltCore Electronics)
      const res = await request(app)
        .get('/api/suppliers/1')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(1);
      expect(res.body.data.name).toBe('Apex Industrial Tools');
      expect(typeof res.body.data.productCount).toBe('number');
    });

    test('Single lookup: Staff gets 404 for inactive supplier (consistent with products & warehouses)', async () => {
      // Create an inactive supplier via admin
      const createRes = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Deactivated Hidden Supplier',
          email: 'hidden@supplier.com',
          isActive: false,
        });
      const hiddenId = createRes.body.data.id;

      // Staff query returns 404
      const res = await request(app)
        .get(`/api/suppliers/${hiddenId}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');

      // Admin can view the inactive supplier
      const adminRes = await request(app)
        .get(`/api/suppliers/${hiddenId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.isActive).toBe(false);
    });

    test('Single lookup: Non-existent ID returns 404 Not Found', async () => {
      const res = await request(app)
        .get('/api/suppliers/999999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // --------------------------------------------------------------------------
  // UC-23: Update Supplier
  // --------------------------------------------------------------------------
  describe('UC-23: Update Supplier', () => {
    let targetSupplierId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Pre-Update Supplier',
          contactName: 'Original Contact',
          email: 'preupdate@supplier.com',
          phone: '+1-555-1111',
        });
      targetSupplierId = res.body.data.id;
    });

    test('Happy path: Manager can update supplier details (200 OK)', async () => {
      const res = await request(app)
        .put(`/api/suppliers/${targetSupplierId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Post-Update Supplier Modernized',
          contactName: 'New Contact Person',
          phone: '+1-555-9999',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Post-Update Supplier Modernized');
      expect(res.body.data.contactName).toBe('New Contact Person');
      expect(res.body.data.phone).toBe('+1-555-9999');
    });

    test('Allowed: Updating to share an existing supplier name succeeds (200 OK)', async () => {
      const res = await request(app)
        .put(`/api/suppliers/${targetSupplierId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'VoltCore Electronics', // Seeded supplier 1
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('VoltCore Electronics');
    });

    test('Conflict: Updating to an existing supplier email returns 409 Conflict', async () => {
      const res = await request(app)
        .put(`/api/suppliers/${targetSupplierId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'arthur@apexprecision.com', // Belongs to Apex
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    test('Validation failure: Updating with invalid email returns 400 Bad Request', async () => {
      const res = await request(app)
        .put(`/api/suppliers/${targetSupplierId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          email: 'invalid-email-format',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('Authorization: Staff is denied updating supplier (403 Forbidden)', async () => {
      const res = await request(app)
        .put(`/api/suppliers/${targetSupplierId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          contactName: 'Unauthorized Staff Edit',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Reactivation: Admin or Manager can reactivate supplier via PUT (200 OK)', async () => {
      // First deactivate
      await request(app)
        .delete(`/api/suppliers/${targetSupplierId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Reactivate via PUT
      const res = await request(app)
        .put(`/api/suppliers/${targetSupplierId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          isActive: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(true);
    });

    test('Not Found: Updating non-existent supplier returns 404', async () => {
      const res = await request(app)
        .put('/api/suppliers/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Does Not Exist' });

      expect(res.status).toBe(404);
    });
  });

  // --------------------------------------------------------------------------
  // UC-24: Deactivate Supplier
  // --------------------------------------------------------------------------
  describe('UC-24: Deactivate Supplier', () => {
    let poSupplierId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Procurement Bound Supplier',
          email: 'po_bound@supplier.com',
        });
      poSupplierId = res.body.data.id;

      // Seed an open purchase order directly in the test database for this supplier
      await pool.query(
        `INSERT INTO purchase_orders 
          (po_number, supplier_id, warehouse_id, status, total_amount, created_by)
         VALUES 
          (?, ?, 1, 'ordered', 1250.00, 1);`,
        [`PO-TEST-DEACT-${Date.now()}`, poSupplierId]
      );
    });

    test('Authorization: Staff is denied deactivating supplier (403 Forbidden)', async () => {
      const res = await request(app)
        .delete(`/api/suppliers/${poSupplierId}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('BR-07: Deactivation blocked with 422 if supplier has open purchase orders', async () => {
      const res = await request(app)
        .delete(`/api/suppliers/${poSupplierId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
      expect(res.body.error.message).toMatch(/open purchase orders awaiting receipt/i);
    });

    test('BR-07: PUT deactivation is also blocked if supplier has open purchase orders', async () => {
      const res = await request(app)
        .put(`/api/suppliers/${poSupplierId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ isActive: false });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
      expect(res.body.error.message).toMatch(/open purchase orders awaiting receipt/i);
    });

    test('Happy path: Manager can soft-deactivate supplier with zero open POs (200 OK)', async () => {
      const createRes = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Deactivatable Supplier No Orders',
          email: 'no_orders@supplier.com',
        });
      const cleanId = createRes.body.data.id;

      const res = await request(app)
        .delete(`/api/suppliers/${cleanId}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isActive).toBe(false);

      // Verify row is still preserved in DB (soft-deactivate, not delete)
      const [rows] = await pool.query('SELECT is_active FROM suppliers WHERE id = ?;', [cleanId]);
      expect(rows.length).toBe(1);
      expect(rows[0].is_active).toBe(0);
    });

    test('Not Found: Deactivating non-existent supplier returns 404', async () => {
      const res = await request(app)
        .delete('/api/suppliers/999999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});

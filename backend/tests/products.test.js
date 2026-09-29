/**
 * ============================================================================
 * File: backend/tests/products.test.js
 * Purpose: Integration tests for Module 2 (Products: UC-07 to UC-10).
 * Why it exists: Validates SKU uniqueness (409), active supplier validation (422),
 * search, pagination, category filtering, cost price masking for Staff (BR-05),
 * SKU immutability (BR-04), and soft deactivation against inventory_test_db.
 * ============================================================================
 */

import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { setupTestDatabase } from './setupTestDb.js';

describe('Module 2: Product Management (UC-07 to UC-10)', () => {
  let adminToken;
  let managerToken;
  let staffToken;
  let activeSupplierId;
  let inactiveSupplierId;

  beforeAll(async () => {
    // Reset test database to clean baseline state
    await setupTestDatabase();

    // Clean up any test-specific products from previous runs
    await pool.execute("DELETE FROM products WHERE sku LIKE 'TEST-%';");

    // Ensure an inactive supplier exists for testing BR-07 / 422 validation
    await pool.execute(`
      INSERT INTO suppliers (name, contact_name, email, phone, address, is_active)
      VALUES ('Inactive Test Supplier', 'Contact', 'inactive.sup@test.com', '555-0199', '100 Void St', 0)
      ON DUPLICATE KEY UPDATE is_active = 0;
    `);

    // Fetch supplier IDs
    const [activeSupRows] = await pool.execute(
      "SELECT id FROM suppliers WHERE name = 'Apex Industrial Tools' LIMIT 1;"
    );
    activeSupplierId = activeSupRows[0].id;

    const [inactiveSupRows] = await pool.execute(
      "SELECT id FROM suppliers WHERE name = 'Inactive Test Supplier' LIMIT 1;"
    );
    inactiveSupplierId = inactiveSupRows[0].id;

    // Authenticate baseline test users
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
    await pool.execute("DELETE FROM products WHERE sku LIKE 'TEST-%';");
    await pool.end();
  });

  // --------------------------------------------------------------------------
  // UC-07: Add Product
  // --------------------------------------------------------------------------
  describe('UC-07: Add Product', () => {
    test('Happy path: Warehouse Manager can create product (201 Created)', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sku: 'TEST-PROD-001',
          name: 'Industrial Heavy Duty Drill',
          description: 'A powerful drill for testing',
          category: 'Power Tools',
          unitPrice: 149.99,
          costPrice: 95.00,
          reorderLevel: 10,
          supplierId: activeSupplierId,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        sku: 'TEST-PROD-001',
        name: 'Industrial Heavy Duty Drill',
        category: 'Power Tools',
        unitPrice: 149.99,
        costPrice: 95.00,
        reorderLevel: 10,
        supplierId: activeSupplierId,
        isActive: true,
      });
      expect(res.body.data.id).toBeDefined();
    });

    test('Conflict: Duplicate SKU returns 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sku: 'TEST-PROD-001', // already created above
          name: 'Duplicate Drill',
          unitPrice: 199.99,
          supplierId: activeSupplierId,
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('SKU already exists');
    });

    test('Validation: Non-existent supplier returns 422 Unprocessable Entity', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sku: 'TEST-PROD-999',
          name: 'Orphan Product',
          unitPrice: 50.00,
          supplierId: 99999, // non-existent supplier
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
      expect(res.body.error.message).toContain('Supplier does not exist or is inactive');
    });

    test('Validation: Deactivated supplier returns 422 Unprocessable Entity', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sku: 'TEST-PROD-002',
          name: 'Inactive Supplier Product',
          unitPrice: 75.00,
          supplierId: inactiveSupplierId,
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
      expect(res.body.error.message).toContain('Supplier does not exist or is inactive');
    });

    test('Validation failure: Negative price or missing SKU returns 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sku: '',
          name: 'Invalid Price Product',
          unitPrice: -25.00,
          supplierId: activeSupplierId,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('Authorization: Staff is denied creating product (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          sku: 'TEST-PROD-STAFF',
          name: 'Staff Created Product',
          unitPrice: 50.00,
          supplierId: activeSupplierId,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Authentication: Unauthenticated request returns 401', async () => {
      const res = await request(app)
        .post('/api/products')
        .send({
          sku: 'TEST-NO-AUTH',
          name: 'No Auth Product',
          unitPrice: 50.00,
          supplierId: activeSupplierId,
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // --------------------------------------------------------------------------
  // UC-08: View and Search Products
  // --------------------------------------------------------------------------
  describe('UC-08: View and Search Products', () => {
    test('Happy path: Authenticated users can list products with pagination meta', async () => {
      const res = await request(app)
        .get('/api/products?page=1&limit=5')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeLessThanOrEqual(5);
      expect(res.body.meta).toMatchObject({
        page: 1,
        limit: 5,
      });
      expect(res.body.meta.total).toBeGreaterThan(0);
    });

    test('Search: Filter by search keyword matching SKU or name', async () => {
      const res = await request(app)
        .get('/api/products?search=TEST-PROD-001')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].sku).toBe('TEST-PROD-001');
    });

    test('Filter: Filter by product category', async () => {
      const res = await request(app)
        .get('/api/products?category=Power Tools')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      res.body.data.forEach((prod) => {
        expect(prod.category).toBe('Power Tools');
      });
    });

    test('BR-05: Manager sees costPrice in product listing', async () => {
      const res = await request(app)
        .get('/api/products?search=TEST-PROD-001')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data[0].costPrice).toBe(95.00);
    });

    test('BR-05: Staff DOES NOT see costPrice in product listing', async () => {
      const res = await request(app)
        .get('/api/products?search=TEST-PROD-001')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data[0].costPrice).toBeUndefined();
    });

    test('Single product lookup: Manager sees all fields including costPrice', async () => {
      const searchRes = await request(app)
        .get('/api/products?search=TEST-PROD-001')
        .set('Authorization', `Bearer ${managerToken}`);
      const productId = searchRes.body.data[0].id;

      const res = await request(app)
        .get(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(productId);
      expect(res.body.data.sku).toBe('TEST-PROD-001');
      expect(res.body.data.costPrice).toBe(95.00);
      expect(res.body.data.totalStock).toBeDefined();
    });

    test('Single product lookup: Staff sees product but costPrice is hidden', async () => {
      const searchRes = await request(app)
        .get('/api/products?search=TEST-PROD-001')
        .set('Authorization', `Bearer ${managerToken}`);
      const productId = searchRes.body.data[0].id;

      const res = await request(app)
        .get(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(productId);
      expect(res.body.data.costPrice).toBeUndefined();
    });

    test('Single product lookup: Non-existent ID returns 404 Not Found', async () => {
      const res = await request(app)
        .get('/api/products/999999')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // --------------------------------------------------------------------------
  // UC-09: Update Product
  // --------------------------------------------------------------------------
  describe('UC-09: Update Product', () => {
    let testProductId;

    beforeAll(async () => {
      const createRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sku: 'TEST-PROD-UPD',
          name: 'Original Product Name',
          category: 'Hardware',
          unitPrice: 25.00,
          costPrice: 15.00,
          supplierId: activeSupplierId,
        });
      testProductId = createRes.body.data.id;
    });

    test('Happy path: Manager can update product details (200 OK)', async () => {
      const res = await request(app)
        .put(`/api/products/${testProductId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Updated Product Name',
          unitPrice: 29.99,
          reorderLevel: 25,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Product Name');
      expect(res.body.data.unitPrice).toBe(29.99);
      expect(res.body.data.reorderLevel).toBe(25);
    });

    test('BR-04: Attempting to modify SKU is rejected (400 Bad Request)', async () => {
      const res = await request(app)
        .put(`/api/products/${testProductId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sku: 'NEW-SKU-VALUE',
          name: 'Trying to change SKU',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('Validation: Updating to inactive supplier returns 422', async () => {
      const res = await request(app)
        .put(`/api/products/${testProductId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: inactiveSupplierId,
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
    });

    test('Authorization: Staff is denied updating product (403 Forbidden)', async () => {
      const res = await request(app)
        .put(`/api/products/${testProductId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          name: 'Staff Unauthorized Edit',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Not Found: Updating non-existent product returns 404', async () => {
      const res = await request(app)
        .put('/api/products/999999')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Non Existent',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // --------------------------------------------------------------------------
  // UC-10: Deactivate Product
  // --------------------------------------------------------------------------
  describe('UC-10: Deactivate Product', () => {
    let deactProductId;

    beforeAll(async () => {
      const createRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          sku: 'TEST-PROD-DEACT',
          name: 'Product to be deactivated',
          unitPrice: 10.00,
          supplierId: activeSupplierId,
        });
      deactProductId = createRes.body.data.id;
    });

    test('Authorization: Staff is denied deactivating product (403 Forbidden)', async () => {
      const res = await request(app)
        .delete(`/api/products/${deactProductId}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Happy path: Manager can soft-deactivate product (200 OK)', async () => {
      const res = await request(app)
        .delete(`/api/products/${deactProductId}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isActive).toBe(false);
      expect(res.body.data.remainingStock).toBeDefined();
    });

    test('BR-07: Inactive product is hidden from Staff single lookup (404)', async () => {
      const res = await request(app)
        .get(`/api/products/${deactProductId}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    test('Not Found: Deactivating non-existent product returns 404', async () => {
      const res = await request(app)
        .delete('/api/products/999999')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});

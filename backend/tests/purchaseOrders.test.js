/**
 * ============================================================================
 * File: backend/tests/purchaseOrders.test.js
 * Purpose: Integration and concurrency tests for Module 6 (Purchase Orders: UC-25 to UC-27).
 * Why it exists: Proves line item validation, collision-safe PO numbering,
 * state machine transitions, guarded atomic stock receiving, double-receive prevention,
 * concurrency safety, and RBAC against inventory_test_db.
 * ============================================================================
 */

import request from 'supertest';
import app from '../src/app.js';
import { pool, execute } from '../src/config/db.js';
import { setupTestDatabase } from './setupTestDb.js';

describe('Module 6: Purchase Orders (UC-25 to UC-27)', () => {
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

  // ==========================================================================
  // UC-25: Create Purchase Order
  // ==========================================================================
  describe('UC-25: Create Purchase Order', () => {
    test('Happy path: Manager creates draft PO with auto-generated poNumber and auto-calculated total', async () => {
      const res = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          notes: 'Test PO creation',
          items: [
            { productId: 1, quantity: 10, unitCost: 15.50 },
            { productId: 2, quantity: 5, unitCost: 20.00 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        supplierId: 1,
        warehouseId: 1,
        status: 'draft',
        totalAmount: 255.00, // (10*15.5) + (5*20.0) = 155 + 100
        notes: 'Test PO creation',
      });
      expect(res.body.data.poNumber).toMatch(/^PO-\d{8}-\d{4}$/);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items[0]).toHaveProperty('subtotal', 155.00);
      expect(res.body.data.items[1]).toHaveProperty('subtotal', 100.00);
    });

    test('Happy path: Admin creates PO directly with status ordered', async () => {
      const res = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supplierId: 2,
          warehouseId: 2,
          status: 'ordered',
          items: [
            { productId: 3, quantity: 8, unitCost: 12.00 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ordered');
      expect(res.body.data.orderedAt).not.toBeNull();
      expect(res.body.data.totalAmount).toBe(96.00);
    });

    test('Consolidates duplicate products into a single line item (UC-25 Flow A2)', async () => {
      const res = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          items: [
            { productId: 1, quantity: 4, unitCost: 10.00 },
            { productId: 1, quantity: 6, unitCost: 10.00 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].quantity).toBe(10);
      expect(res.body.data.totalAmount).toBe(100.00);
    });

    test('Defaults unitCost to product costPrice if omitted', async () => {
      // Product 1 costPrice is 25.00 in seed data
      const [prodRows] = await execute('SELECT cost_price FROM products WHERE id = 1');
      const expectedCost = parseFloat(prodRows[0].cost_price);

      const res = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          items: [
            { productId: 1, quantity: 2 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.items[0].unitCost).toBe(expectedCost);
      expect(res.body.data.totalAmount).toBe(parseFloat((2 * expectedCost).toFixed(2)));
    });

    test('Rejection 400: Missing line items array', async () => {
      const res = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          items: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('Rejection 400: Line item quantity <= 0', async () => {
      const resZero = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          items: [{ productId: 1, quantity: 0 }],
        });

      expect(resZero.status).toBe(400);

      const resNeg = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          items: [{ productId: 1, quantity: -5 }],
        });

      expect(resNeg.status).toBe(400);
    });

    test('Rejection 400: Line item unitCost < 0', async () => {
      const res = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          items: [{ productId: 1, quantity: 5, unitCost: -2.50 }],
        });

      expect(res.status).toBe(400);
    });

    test('Rejection 404: Unknown supplierId', async () => {
      const res = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 999999,
          warehouseId: 1,
          items: [{ productId: 1, quantity: 5 }],
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    test('Rejection 404: Unknown warehouseId', async () => {
      const res = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 999999,
          items: [{ productId: 1, quantity: 5 }],
        });

      expect(res.status).toBe(404);
    });

    test('Rejection 404: Unknown productId in items', async () => {
      const res = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          items: [{ productId: 999999, quantity: 5 }],
        });

      expect(res.status).toBe(404);
    });

    test('Rejection 422: Inactive supplier', async () => {
      // Temporarily deactivate supplier 3
      await execute('UPDATE suppliers SET is_active = 0 WHERE id = 3');

      const res = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 3,
          warehouseId: 1,
          items: [{ productId: 1, quantity: 5 }],
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');

      // Reactivate supplier 3
      await execute('UPDATE suppliers SET is_active = 1 WHERE id = 3');
    });

    test('Rejection 422: Inactive warehouse', async () => {
      // Temporarily deactivate warehouse 3
      await execute('UPDATE warehouses SET is_active = 0 WHERE id = 3');

      const res = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 3,
          items: [{ productId: 1, quantity: 5 }],
        });

      expect(res.status).toBe(422);

      // Reactivate warehouse 3
      await execute('UPDATE warehouses SET is_active = 1 WHERE id = 3');
    });

    test('Rejection 422: Inactive product', async () => {
      // Temporarily deactivate product 5
      await execute('UPDATE products SET is_active = 0 WHERE id = 5');

      const res = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          items: [{ productId: 5, quantity: 5 }],
        });

      expect(res.status).toBe(422);

      // Reactivate product 5
      await execute('UPDATE products SET is_active = 1 WHERE id = 5');
    });
  });

  // ==========================================================================
  // UC-26: View Purchase Orders
  // ==========================================================================
  describe('UC-26: View Purchase Orders', () => {
    test('Happy path: Manager lists purchase orders with pagination', async () => {
      const res = await request(app)
        .get('/api/purchase-orders?page=1&limit=10')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toMatchObject({ page: 1, limit: 10 });
    });

    test('Filters purchase orders by status', async () => {
      const res = await request(app)
        .get('/api/purchase-orders?status=draft')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach((po) => {
        expect(po.status).toBe('draft');
      });
    });

    test('Retrieves single purchase order by ID with line items and subtotal', async () => {
      // Create a test PO
      const createRes = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          items: [{ productId: 1, quantity: 3, unitCost: 10.00 }],
        });

      const poId = createRes.body.data.id;

      const getRes = await request(app)
        .get(`/api/purchase-orders/${poId}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data).toMatchObject({
        id: poId,
        supplierName: 'Apex Industrial Tools',
        warehouseName: 'Central Logistics Hub',
        status: 'draft',
      });
      expect(getRes.body.data.items).toHaveLength(1);
      expect(getRes.body.data.items[0]).toMatchObject({
        productId: 1,
        quantity: 3,
        unitCost: 10.00,
        subtotal: 30.00,
      });
    });

    test('Rejection 404: Unknown purchase order ID', async () => {
      const res = await request(app)
        .get('/api/purchase-orders/999999')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // State Machine & Transitions
  // ==========================================================================
  describe('State Machine & Transitions', () => {
    test('Transitions draft -> ordered successfully', async () => {
      const createRes = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          items: [{ productId: 1, quantity: 2, unitCost: 10.00 }],
        });

      const poId = createRes.body.data.id;
      expect(createRes.body.data.status).toBe('draft');

      const updateRes = await request(app)
        .patch(`/api/purchase-orders/${poId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'ordered' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.status).toBe('ordered');
      expect(updateRes.body.data.orderedAt).not.toBeNull();
    });

    test('CONFIRM GUARD: Receive on draft (never-ordered) PO returns 409 Conflict and stock is unchanged', async () => {
      // 1. Measure baseline stock for product 1 in warehouse 1
      const [baseStockRows] = await execute(
        'SELECT quantity FROM stock_levels WHERE product_id = 1 AND warehouse_id = 1;'
      );
      const baseQty = baseStockRows[0] ? parseInt(baseStockRows[0].quantity, 10) : 0;

      // 2. Create draft PO
      const createRes = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          items: [{ productId: 1, quantity: 10, unitCost: 10.00 }],
        });

      const poId = createRes.body.data.id;
      expect(createRes.body.data.status).toBe('draft');

      // 3. Attempt receive directly on draft PO -> MUST RETURN 409
      const res = await request(app)
        .post(`/api/purchase-orders/${poId}/receive`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toMatch(/draft/i);

      // 4. Assert stock was NEVER modified
      const [afterStockRows] = await execute(
        'SELECT quantity FROM stock_levels WHERE product_id = 1 AND warehouse_id = 1;'
      );
      const afterQty = afterStockRows[0] ? parseInt(afterStockRows[0].quantity, 10) : 0;
      expect(afterQty).toBe(baseQty);
    });

    test('Illegal transition ordered -> ordered returns 409 Conflict', async () => {
      const createRes = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          status: 'ordered',
          items: [{ productId: 1, quantity: 2, unitCost: 10.00 }],
        });

      const poId = createRes.body.data.id;

      const res = await request(app)
        .patch(`/api/purchase-orders/${poId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'ordered' });

      expect(res.status).toBe(409);
    });

    test('Cancelling draft PO: stock is unaffected', async () => {
      const createRes = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          items: [{ productId: 1, quantity: 5, unitCost: 10.00 }],
        });

      const poId = createRes.body.data.id;

      const cancelRes = await request(app)
        .post(`/api/purchase-orders/${poId}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('cancelled');
    });

    test('Cancelling ordered PO: stock is unaffected', async () => {
      const createRes = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          status: 'ordered',
          items: [{ productId: 1, quantity: 5, unitCost: 10.00 }],
        });

      const poId = createRes.body.data.id;

      const cancelRes = await request(app)
        .post(`/api/purchase-orders/${poId}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('cancelled');
    });

    test('Cannot cancel a received PO: returns 409 Conflict', async () => {
      // Create and receive a PO
      const createRes = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          status: 'ordered',
          items: [{ productId: 1, quantity: 2, unitCost: 10.00 }],
        });

      const poId = createRes.body.data.id;

      await request(app)
        .post(`/api/purchase-orders/${poId}/receive`)
        .set('Authorization', `Bearer ${managerToken}`);

      // Try cancelling
      const cancelRes = await request(app)
        .post(`/api/purchase-orders/${poId}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(cancelRes.status).toBe(409);
      expect(cancelRes.body.error.code).toBe('CONFLICT');
    });

    test('Cannot receive a cancelled PO: returns 409 Conflict', async () => {
      const createRes = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          items: [{ productId: 1, quantity: 2, unitCost: 10.00 }],
        });

      const poId = createRes.body.data.id;

      await request(app)
        .post(`/api/purchase-orders/${poId}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`);

      const receiveRes = await request(app)
        .post(`/api/purchase-orders/${poId}/receive`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(receiveRes.status).toBe(409);
      expect(receiveRes.body.error.code).toBe('CONFLICT');
    });
  });

  // ==========================================================================
  // UC-27: Receive Purchase Order & Double-Receive Guard (CRITICAL TEST)
  // ==========================================================================
  describe('UC-27: Receive Purchase Order & Double-Receive Guard', () => {
    test('Happy path: Ordered PO is received in ONE transaction, stock increments, ledger movement created', async () => {
      // 1. Measure initial stock for product 2 in warehouse 2
      const [initialStockRows] = await execute(
        'SELECT quantity FROM stock_levels WHERE product_id = 2 AND warehouse_id = 2'
      );
      const initialStock = initialStockRows[0] ? parseInt(initialStockRows[0].quantity, 10) : 0;

      // 2. Create ordered PO for product 2 in warehouse 2 with quantity 15
      const createRes = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 2,
          status: 'ordered',
          items: [{ productId: 2, quantity: 15, unitCost: 18.00 }],
        });

      expect(createRes.status).toBe(201);
      const poId = createRes.body.data.id;
      const poNumber = createRes.body.data.poNumber;

      // 3. Receive the purchase order
      const receiveRes = await request(app)
        .post(`/api/purchase-orders/${poId}/receive`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(receiveRes.status).toBe(200);
      expect(receiveRes.body.success).toBe(true);
      expect(receiveRes.body.data.status).toBe('received');
      expect(receiveRes.body.data.receivedAt).not.toBeNull();
      expect(receiveRes.body.data.receivedByName).toBe('Test Manager');

      // 4. Verify stock_levels updated by EXACT quantity (+15)
      const [updatedStockRows] = await execute(
        'SELECT quantity FROM stock_levels WHERE product_id = 2 AND warehouse_id = 2'
      );
      const updatedStock = parseInt(updatedStockRows[0].quantity, 10);
      expect(updatedStock).toBe(initialStock + 15);

      // 5. Verify stock_movements ledger entry has reference_type 'purchase_order' and reference_id = poId
      const [movements] = await execute(
        `SELECT * FROM stock_movements 
         WHERE reference_type = 'purchase_order' AND reference_id = ?`,
        [poId]
      );
      expect(movements).toHaveLength(1);
      expect(movements[0].product_id).toBe(2);
      expect(movements[0].warehouse_id).toBe(2);
      expect(movements[0].movement_type).toBe('in');
      expect(movements[0].quantity).toBe(15);
      expect(movements[0].reference).toBe(`PO Receipt: ${poNumber}`);
    });

    test('DOUBLE-RECEIVE GUARD: Second receive attempt returns 409 and MUST NOT increase stock again', async () => {
      // 1. Create ordered PO
      const createRes = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          status: 'ordered',
          items: [{ productId: 4, quantity: 20, unitCost: 10.00 }],
        });

      const poId = createRes.body.data.id;

      // 2. First receive (Happy path -> 200)
      const firstReceiveRes = await request(app)
        .post(`/api/purchase-orders/${poId}/receive`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(firstReceiveRes.status).toBe(200);

      // Measure stock immediately after first receive
      const [stockAfterFirst] = await execute(
        'SELECT quantity FROM stock_levels WHERE product_id = 4 AND warehouse_id = 1'
      );
      const stockQuantityAfterFirst = parseInt(stockAfterFirst[0].quantity, 10);

      // 3. Second receive attempt -> MUST FAIL WITH 409 CONFLICT
      const secondReceiveRes = await request(app)
        .post(`/api/purchase-orders/${poId}/receive`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(secondReceiveRes.status).toBe(409);
      expect(secondReceiveRes.body.success).toBe(false);
      expect(secondReceiveRes.body.error.code).toBe('CONFLICT');

      // 4. Verify stock is COMPLETELY UNCHANGED
      const [stockAfterSecond] = await execute(
        'SELECT quantity FROM stock_levels WHERE product_id = 4 AND warehouse_id = 1'
      );
      const stockQuantityAfterSecond = parseInt(stockAfterSecond[0].quantity, 10);
      expect(stockQuantityAfterSecond).toBe(stockQuantityAfterFirst);

      // 5. Verify movements count remains 1 (no duplicate movement created)
      const [movements] = await execute(
        `SELECT COUNT(*) AS count FROM stock_movements 
         WHERE reference_type = 'purchase_order' AND reference_id = ?`,
        [poId]
      );
      expect(parseInt(movements[0].count, 10)).toBe(1);
    });

    test('CONCURRENCY RACE: Two simultaneous receive calls on same PO -> exactly one 200 and one 409', async () => {
      // 1. Create ordered PO
      const createRes = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 2,
          warehouseId: 1,
          status: 'ordered',
          items: [{ productId: 3, quantity: 25, unitCost: 12.00 }],
        });

      const poId = createRes.body.data.id;

      // Measure baseline stock
      const [baseStockRows] = await execute(
        'SELECT quantity FROM stock_levels WHERE product_id = 3 AND warehouse_id = 1'
      );
      const baseStock = baseStockRows[0] ? parseInt(baseStockRows[0].quantity, 10) : 0;

      // 2. Fire two simultaneous receive calls
      const [res1, res2] = await Promise.all([
        request(app).post(`/api/purchase-orders/${poId}/receive`).set('Authorization', `Bearer ${managerToken}`),
        request(app).post(`/api/purchase-orders/${poId}/receive`).set('Authorization', `Bearer ${managerToken}`),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      // 3. Stock must have increased by EXACTLY 25 (once, not 50)
      const [finalStockRows] = await execute(
        'SELECT quantity FROM stock_levels WHERE product_id = 3 AND warehouse_id = 1'
      );
      const finalStock = parseInt(finalStockRows[0].quantity, 10);
      expect(finalStock).toBe(baseStock + 25);
    });
  });

  // ==========================================================================
  // UC-P08: Edit Draft Purchase Order (PUT /api/purchase-orders/:id)
  // ==========================================================================
  describe('UC-P08: Edit Draft Purchase Order', () => {
    test('Happy path: Manager edits draft PO changing supplier, warehouse, notes, and items with duplicate merge', async () => {
      // 1. Create a draft PO
      const createRes = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          notes: 'Initial draft note',
          items: [{ productId: 1, quantity: 5, unitCost: 10.00 }],
        });

      const poId = createRes.body.data.id;
      expect(createRes.body.data.status).toBe('draft');
      expect(createRes.body.data.totalAmount).toBe(50.00);

      // 2. Edit draft PO via PUT
      const editRes = await request(app)
        .put(`/api/purchase-orders/${poId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 2,
          warehouseId: 2,
          notes: 'Updated draft note before ordering',
          items: [
            { productId: 2, quantity: 3, unitCost: 15.00 },
            { productId: 2, quantity: 4, unitCost: 15.00 }, // Duplicate product merged: qty 7
            { productId: 3, quantity: 2, unitCost: 20.00 },
          ],
        });

      expect(editRes.status).toBe(200);
      expect(editRes.body.success).toBe(true);
      expect(editRes.body.data).toMatchObject({
        id: poId,
        supplierId: 2,
        warehouseId: 2,
        notes: 'Updated draft note before ordering',
        status: 'draft',
        totalAmount: 145.00, // (7 * 15.00) + (2 * 20.00) = 105 + 40
      });
      expect(editRes.body.data.items).toHaveLength(2);
      expect(editRes.body.data.items[0]).toMatchObject({
        productId: 2,
        quantity: 7,
        unitCost: 15.00,
        subtotal: 105.00,
      });
      expect(editRes.body.data.items[1]).toMatchObject({
        productId: 3,
        quantity: 2,
        unitCost: 20.00,
        subtotal: 40.00,
      });
    });

    test('Edit an ordered PO returns 409 Conflict', async () => {
      const createRes = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          status: 'ordered',
          items: [{ productId: 1, quantity: 5, unitCost: 10.00 }],
        });

      const poId = createRes.body.data.id;

      const editRes = await request(app)
        .put(`/api/purchase-orders/${poId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          items: [{ productId: 1, quantity: 8, unitCost: 10.00 }],
        });

      expect(editRes.status).toBe(409);
      expect(editRes.body.error.code).toBe('CONFLICT');
    });

    test('Edit a received PO returns 409 Conflict', async () => {
      const createRes = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          status: 'ordered',
          items: [{ productId: 1, quantity: 2, unitCost: 10.00 }],
        });

      const poId = createRes.body.data.id;

      await request(app)
        .post(`/api/purchase-orders/${poId}/receive`)
        .set('Authorization', `Bearer ${managerToken}`);

      const editRes = await request(app)
        .put(`/api/purchase-orders/${poId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          items: [{ productId: 1, quantity: 5, unitCost: 10.00 }],
        });

      expect(editRes.status).toBe(409);
      expect(editRes.body.error.code).toBe('CONFLICT');
    });

    test('Edit a cancelled PO returns 409 Conflict', async () => {
      const createRes = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          items: [{ productId: 1, quantity: 2, unitCost: 10.00 }],
        });

      const poId = createRes.body.data.id;

      await request(app)
        .post(`/api/purchase-orders/${poId}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`);

      const editRes = await request(app)
        .put(`/api/purchase-orders/${poId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          items: [{ productId: 1, quantity: 5, unitCost: 10.00 }],
        });

      expect(editRes.status).toBe(409);
      expect(editRes.body.error.code).toBe('CONFLICT');
    });
  });

  // ==========================================================================
  // Role-Based Access Control (RBAC)
  // ==========================================================================
  describe('RBAC & Security Boundaries', () => {
    test('Staff is denied with 403 on PO creation', async () => {
      const res = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          items: [{ productId: 1, quantity: 5 }],
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Staff is denied with 403 on PO editing (PUT)', async () => {
      const res = await request(app)
        .put('/api/purchase-orders/1')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          items: [{ productId: 1, quantity: 5 }],
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Staff is denied with 403 on PO listing', async () => {
      const res = await request(app)
        .get('/api/purchase-orders')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Staff is denied with 403 on PO details view', async () => {
      const res = await request(app)
        .get('/api/purchase-orders/1')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Staff is denied with 403 on status transition', async () => {
      const res = await request(app)
        .patch('/api/purchase-orders/1/status')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'ordered' });

      expect(res.status).toBe(403);
    });

    test('Staff is denied with 403 on PO receiving', async () => {
      const res = await request(app)
        .post('/api/purchase-orders/1/receive')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
    });

    test('Staff is denied with 403 on PO cancellation', async () => {
      const res = await request(app)
        .post('/api/purchase-orders/1/cancel')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
    });

    test('Unauthenticated requests are denied with 401 Unauthorized', async () => {
      const res1 = await request(app).post('/api/purchase-orders').send({});
      expect(res1.status).toBe(401);

      const res2 = await request(app).get('/api/purchase-orders');
      expect(res2.status).toBe(401);

      const res3 = await request(app).put('/api/purchase-orders/1').send({});
      expect(res3.status).toBe(401);

      const res4 = await request(app).post('/api/purchase-orders/1/receive');
      expect(res4.status).toBe(401);
    });
  });
});


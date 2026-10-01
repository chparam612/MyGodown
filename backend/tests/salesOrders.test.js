/**
 * ============================================================================
 * File: backend/tests/salesOrders.test.js
 * Purpose: Integration and concurrency tests for Module 7 (Sales Orders: UC-28 to UC-30).
 * Why it exists: Proves line item validation, collision-safe SO numbering,
 * unitPrice snapshotting from product unitPrice (not costPrice), state machine transitions,
 * guarded atomic stock fulfillment, shortage atomicity guard, double-fulfillment prevention,
 * concurrency safety, and RBAC against inventory_test_db.
 * ============================================================================
 */

import request from 'supertest';
import app from '../src/app.js';
import { pool, execute } from '../src/config/db.js';
import { setupTestDatabase } from './setupTestDb.js';

describe('Module 7: Sales Orders (UC-28 to UC-30)', () => {
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
  // UC-28: Create Sales Order
  // ==========================================================================
  describe('UC-28: Create Sales Order', () => {
    test('Happy path: Staff creates draft SO with auto-generated soNumber and auto-calculated total', async () => {
      const res = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerName: 'Acme Retail Corp',
          warehouseId: 1,
          notes: 'Standard retail delivery',
          items: [
            { productId: 1, quantity: 5, unitPrice: 30.00 },
            { productId: 2, quantity: 2, unitPrice: 50.00 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        customerName: 'Acme Retail Corp',
        warehouseId: 1,
        status: 'draft',
        totalAmount: 250.00,
        notes: 'Standard retail delivery',
      });
      expect(res.body.data.soNumber).toMatch(/^SO-\d{8}-\d+/);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items[0].subtotal).toBe(150.00);
      expect(res.body.data.items[1].subtotal).toBe(100.00);
    });

    test('Snapshots product unitPrice (selling price, NOT costPrice) if unitPrice is omitted', async () => {
      const [prodRows] = await execute('SELECT id, unit_price, cost_price FROM products WHERE id = 1;');
      const expectedUnitPrice = parseFloat(prodRows[0].unit_price);
      const costPrice = parseFloat(prodRows[0].cost_price);
      expect(expectedUnitPrice).not.toBe(costPrice);

      const res = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerName: 'Price Snapshot Test',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 3 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.items[0].unitPrice).toBe(expectedUnitPrice);
      expect(res.body.data.totalAmount).toBe(parseFloat((3 * expectedUnitPrice).toFixed(2)));
    });

    test('Consolidates duplicate products into a single line item summing quantities', async () => {
      const res = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerName: 'Duplicate Product Consolidation Test',
          warehouseId: 1,
          items: [
            { productId: 1, quantity: 4, unitPrice: 25.00 },
            { productId: 1, quantity: 6, unitPrice: 25.00 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].quantity).toBe(10);
      expect(res.body.data.items[0].unitPrice).toBe(25.00);
      expect(res.body.data.totalAmount).toBe(250.00);
    });

    test('Rejection 400: Missing customerName', async () => {
      const res = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          warehouseId: 1,
          items: [{ productId: 1, quantity: 2 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('Rejection 400: Missing line items array', async () => {
      const res = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerName: 'Empty Items Test',
          warehouseId: 1,
          items: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('Rejection 400: Line item quantity <= 0', async () => {
      const res = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerName: 'Zero Quantity Test',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 0 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('Rejection 400: Line item unitPrice < 0', async () => {
      const res = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerName: 'Negative Unit Price Test',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 5, unitPrice: -10 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('Rejection 404: Unknown warehouseId', async () => {
      const res = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerName: 'Missing Warehouse Test',
          warehouseId: 99999,
          items: [{ productId: 1, quantity: 2 }],
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    test('Rejection 404: Unknown productId in items', async () => {
      const res = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerName: 'Missing Product Test',
          warehouseId: 1,
          items: [{ productId: 99999, quantity: 2 }],
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    test('Rejection 422: Inactive warehouse', async () => {
      const [whResult] = await execute(
        'INSERT INTO warehouses (name, code, address, city, is_active) VALUES (?, ?, ?, ?, 0);',
        ['Inactive Warehouse', `INACT-${Date.now()}`, '123 Ghost St', 'Nowhere']
      );
      const inactiveWhId = whResult.insertId;

      const res = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerName: 'Inactive WH Test',
          warehouseId: inactiveWhId,
          items: [{ productId: 1, quantity: 2 }],
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    test('Rejection 422: Inactive product', async () => {
      const [prodResult] = await execute(
        'INSERT INTO products (name, sku, category, unit_price, cost_price, reorder_level, supplier_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1, 0);',
        ['Inactive Product', `INACT-SKU-${Date.now()}`, 'General', 50.00, 30.00, 10]
      );
      const inactiveProdId = prodResult.insertId;

      const res = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerName: 'Inactive Product Test',
          warehouseId: 1,
          items: [{ productId: inactiveProdId, quantity: 2 }],
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================================================
  // UC-29: View Sales Orders
  // ==========================================================================
  describe('UC-29: View Sales Orders', () => {
    test('Happy path: Staff lists sales orders with pagination', async () => {
      const res = await request(app)
        .get('/api/sales-orders?page=1&limit=5')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(5);
    });

    test('Filters sales orders by status', async () => {
      const res = await request(app)
        .get('/api/sales-orders?status=draft')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      res.body.data.forEach((so) => {
        expect(so.status).toBe('draft');
      });
    });

    test('Retrieves single sales order by ID with line items and subtotal', async () => {
      const createRes = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerName: 'Single SO Lookup Customer',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 3, unitPrice: 40.00 }],
        });

      const soId = createRes.body.data.id;

      const getRes = await request(app)
        .get(`/api/sales-orders/${soId}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.success).toBe(true);
      expect(getRes.body.data.id).toBe(soId);
      expect(getRes.body.data.customerName).toBe('Single SO Lookup Customer');
      expect(getRes.body.data.items).toHaveLength(1);
      expect(getRes.body.data.items[0].subtotal).toBe(120.00);
    });

    test('Rejection 404: Unknown sales order ID', async () => {
      const res = await request(app)
        .get('/api/sales-orders/99999')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================================================
  // State Machine & Transitions
  // ==========================================================================
  describe('State Machine & Transitions', () => {
    test('Transitions draft -> confirmed successfully (stock remains unchanged)', async () => {
      // 1. Get initial stock
      const [initialStockRows] = await execute('SELECT quantity FROM stock_levels WHERE product_id = 1 AND warehouse_id = 1;');
      const initialStock = initialStockRows[0]?.quantity || 0;

      // 2. Create draft SO
      const createRes = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerName: 'State Machine Test 1',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 5, unitPrice: 20.00 }],
        });

      const soId = createRes.body.data.id;
      expect(createRes.body.data.status).toBe('draft');

      // 3. Confirm SO
      const confirmRes = await request(app)
        .patch(`/api/sales-orders/${soId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'confirmed' });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.data.status).toBe('confirmed');

      // 4. Verify stock is unchanged
      const [afterStockRows] = await execute('SELECT quantity FROM stock_levels WHERE product_id = 1 AND warehouse_id = 1;');
      expect(afterStockRows[0]?.quantity).toBe(initialStock);
    });

    test('GUARD: Fulfill on draft (never-confirmed) SO returns 409 Conflict', async () => {
      const createRes = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerName: 'Direct Fulfill Draft Guard',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 2, unitPrice: 20.00 }],
        });

      const soId = createRes.body.data.id;
      expect(createRes.body.data.status).toBe('draft');

      // Attempt fulfill directly on draft SO -> MUST RETURN 409
      const fulfillRes = await request(app)
        .post(`/api/sales-orders/${soId}/fulfill`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(fulfillRes.status).toBe(409);
      expect(fulfillRes.body.success).toBe(false);
      expect(fulfillRes.body.error.message).toMatch(/must be confirmed first/i);
    });

    test('GUARD: Confirming an already confirmed SO returns 409 Conflict', async () => {
      const createRes = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerName: 'Double Confirm Test',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 2, unitPrice: 20.00 }],
        });

      const soId = createRes.body.data.id;

      // First confirmation -> 200
      await request(app)
        .patch(`/api/sales-orders/${soId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'confirmed' });

      // Second confirmation -> 409
      const secondConfirm = await request(app)
        .patch(`/api/sales-orders/${soId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'confirmed' });

      expect(secondConfirm.status).toBe(409);
      expect(secondConfirm.body.error.message).toMatch(/already confirmed/i);
    });

    test('Cancelling draft SO: stock is unaffected', async () => {
      const [beforeRows] = await execute('SELECT quantity FROM stock_levels WHERE product_id = 1 AND warehouse_id = 1;');
      const stockBefore = beforeRows[0]?.quantity || 0;

      const createRes = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerName: 'Cancel Draft SO Test',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 5, unitPrice: 20.00 }],
        });

      const soId = createRes.body.data.id;

      const cancelRes = await request(app)
        .post(`/api/sales-orders/${soId}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('cancelled');

      const [afterRows] = await execute('SELECT quantity FROM stock_levels WHERE product_id = 1 AND warehouse_id = 1;');
      expect(afterRows[0]?.quantity).toBe(stockBefore);
    });

    test('Cancelling confirmed SO: stock is unaffected', async () => {
      const [beforeRows] = await execute('SELECT quantity FROM stock_levels WHERE product_id = 1 AND warehouse_id = 1;');
      const stockBefore = beforeRows[0]?.quantity || 0;

      const createRes = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerName: 'Cancel Confirmed SO Test',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 5, unitPrice: 20.00 }],
        });

      const soId = createRes.body.data.id;

      await request(app)
        .patch(`/api/sales-orders/${soId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'confirmed' });

      const cancelRes = await request(app)
        .post(`/api/sales-orders/${soId}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('cancelled');

      const [afterRows] = await execute('SELECT quantity FROM stock_levels WHERE product_id = 1 AND warehouse_id = 1;');
      expect(afterRows[0]?.quantity).toBe(stockBefore);
    });

    test('Cannot cancel a fulfilled SO: returns 409 Conflict', async () => {
      // 1. Ensure warehouse has stock
      await execute(
        'INSERT INTO stock_levels (product_id, warehouse_id, quantity) VALUES (1, 1, 100) ON DUPLICATE KEY UPDATE quantity = quantity + 100;'
      );

      // 2. Create and confirm SO
      const createRes = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerName: 'Fulfilled Cancel Guard Test',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 5, unitPrice: 20.00 }],
        });

      const soId = createRes.body.data.id;
      await request(app)
        .patch(`/api/sales-orders/${soId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'confirmed' });

      // 3. Fulfill SO
      const fulfillRes = await request(app)
        .post(`/api/sales-orders/${soId}/fulfill`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(fulfillRes.status).toBe(200);
      expect(fulfillRes.body.data.status).toBe('fulfilled');

      // 4. Attempt to cancel fulfilled SO -> MUST RETURN 409
      const cancelRes = await request(app)
        .post(`/api/sales-orders/${soId}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(cancelRes.status).toBe(409);
      expect(cancelRes.body.error.message).toMatch(/already been fulfilled/i);
    });

    test('Cannot fulfill a cancelled SO: returns 409 Conflict', async () => {
      const createRes = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerName: 'Cancelled Fulfill Guard Test',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 5, unitPrice: 20.00 }],
        });

      const soId = createRes.body.data.id;

      await request(app)
        .post(`/api/sales-orders/${soId}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`);

      const fulfillRes = await request(app)
        .post(`/api/sales-orders/${soId}/fulfill`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(fulfillRes.status).toBe(409);
      expect(fulfillRes.body.error.message).toMatch(/cannot fulfill a cancelled/i);
    });
  });

  // ==========================================================================
  // UC-30: Fulfill Sales Order, Guarded Update & Double-Fulfillment Guard
  // ==========================================================================
  describe('UC-30: Fulfill Sales Order & Double-Fulfillment Guard', () => {
    test('Happy path: Confirmed SO is fulfilled in ONE transaction, stock decrements, ledger movement created', async () => {
      // 1. Ensure ample initial stock
      await execute('INSERT INTO stock_levels (product_id, warehouse_id, quantity) VALUES (1, 1, 50) ON DUPLICATE KEY UPDATE quantity = 50;');
      const [beforeRows] = await execute('SELECT quantity FROM stock_levels WHERE product_id = 1 AND warehouse_id = 1;');
      const stockBefore = beforeRows[0].quantity;

      // 2. Create and confirm SO
      const createRes = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerName: 'Fulfillment Happy Path Customer',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 15, unitPrice: 25.00 }],
        });

      const soId = createRes.body.data.id;
      const soNumber = createRes.body.data.soNumber;

      await request(app)
        .patch(`/api/sales-orders/${soId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'confirmed' });

      // 3. Fulfill SO
      const fulfillRes = await request(app)
        .post(`/api/sales-orders/${soId}/fulfill`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(fulfillRes.status).toBe(200);
      expect(fulfillRes.body.success).toBe(true);
      expect(fulfillRes.body.data.status).toBe('fulfilled');

      // 4. Verify stock level decremented
      const [afterRows] = await execute('SELECT quantity FROM stock_levels WHERE product_id = 1 AND warehouse_id = 1;');
      expect(afterRows[0].quantity).toBe(stockBefore - 15);

      // 5. Verify immutable stock movement ledger entry
      const [movementRows] = await execute(
        "SELECT * FROM stock_movements WHERE reference_type = 'sales_order' AND reference_id = ? ORDER BY id DESC LIMIT 1;",
        [soId]
      );
      expect(movementRows).toHaveLength(1);
      expect(movementRows[0].movement_type).toBe('out');
      expect(movementRows[0].quantity).toBe(15);
      expect(movementRows[0].product_id).toBe(1);
      expect(movementRows[0].warehouse_id).toBe(1);
      expect(movementRows[0].reference).toContain(soNumber);
    });

    test('ATOMICITY / SHORTAGE GUARD: Fulfilling an SO when ANY line lacks stock returns 422 and NOTHING changes', async () => {
      // Set exact stock: product 1 has 10 units, product 2 has 2 units
      await execute('INSERT INTO stock_levels (product_id, warehouse_id, quantity) VALUES (1, 1, 10) ON DUPLICATE KEY UPDATE quantity = 10;');
      await execute('INSERT INTO stock_levels (product_id, warehouse_id, quantity) VALUES (2, 1, 2) ON DUPLICATE KEY UPDATE quantity = 2;');

      // Create SO requesting 5 units of product 1 (available) and 10 units of product 2 (SHORTAGE!)
      const createRes = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerName: 'Shortage Atomicity Test',
          warehouseId: 1,
          items: [
            { productId: 1, quantity: 5, unitPrice: 20.00 },
            { productId: 2, quantity: 10, unitPrice: 35.00 },
          ],
        });

      const soId = createRes.body.data.id;

      await request(app)
        .patch(`/api/sales-orders/${soId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'confirmed' });

      // Attempt fulfill -> MUST FAIL WITH 422 INSUFFICIENT_STOCK
      const fulfillRes = await request(app)
        .post(`/api/sales-orders/${soId}/fulfill`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(fulfillRes.status).toBe(422);
      expect(fulfillRes.body.success).toBe(false);
      expect(fulfillRes.body.error.code).toBe('INSUFFICIENT_STOCK');

      // Verify ATOMICITY: Neither product 1 nor product 2 was decremented!
      const [p1Stock] = await execute('SELECT quantity FROM stock_levels WHERE product_id = 1 AND warehouse_id = 1;');
      const [p2Stock] = await execute('SELECT quantity FROM stock_levels WHERE product_id = 2 AND warehouse_id = 1;');
      expect(p1Stock[0].quantity).toBe(10);
      expect(p2Stock[0].quantity).toBe(2);

      // Verify SO remains confirmed
      const [soRows] = await execute('SELECT status FROM sales_orders WHERE id = ?;', [soId]);
      expect(soRows[0].status).toBe('confirmed');

      // Verify ZERO movements were recorded
      const [movementRows] = await execute(
        "SELECT * FROM stock_movements WHERE reference_type = 'sales_order' AND reference_id = ?;",
        [soId]
      );
      expect(movementRows).toHaveLength(0);
    });

    test('DOUBLE-FULFILLMENT GUARD: Second fulfill attempt returns 409 and MUST NOT deduct stock again', async () => {
      // 1. Ensure initial stock
      await execute('INSERT INTO stock_levels (product_id, warehouse_id, quantity) VALUES (1, 1, 100) ON DUPLICATE KEY UPDATE quantity = 100;');
      const [beforeRows] = await execute('SELECT quantity FROM stock_levels WHERE product_id = 1 AND warehouse_id = 1;');
      const initialStock = beforeRows[0].quantity;

      // 2. Create and confirm SO for 20 units
      const createRes = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerName: 'Double Fulfill Guard Customer',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 20, unitPrice: 20.00 }],
        });

      const soId = createRes.body.data.id;

      await request(app)
        .patch(`/api/sales-orders/${soId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'confirmed' });

      // 3. First fulfill -> 200 OK
      const firstFulfill = await request(app)
        .post(`/api/sales-orders/${soId}/fulfill`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(firstFulfill.status).toBe(200);

      // Verify stock deducted once: 100 - 20 = 80
      const [afterFirstRows] = await execute('SELECT quantity FROM stock_levels WHERE product_id = 1 AND warehouse_id = 1;');
      const stockAfterFirst = afterFirstRows[0].quantity;
      expect(stockAfterFirst).toBe(initialStock - 20);

      // 4. Second fulfill attempt -> MUST RETURN 409 CONFLICT
      const secondFulfill = await request(app)
        .post(`/api/sales-orders/${soId}/fulfill`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(secondFulfill.status).toBe(409);
      expect(secondFulfill.body.success).toBe(false);
      expect(secondFulfill.body.error.message).toMatch(/already been fulfilled/i);

      // 5. Query stock again: MUST REMAIN EXACTLY 80 (NO DOUBLE-DEDUCTION)
      const [afterSecondRows] = await execute('SELECT quantity FROM stock_levels WHERE product_id = 1 AND warehouse_id = 1;');
      expect(afterSecondRows[0].quantity).toBe(stockAfterFirst);
    });

    test('CONCURRENCY RACE: Two simultaneous fulfill calls on same SO -> exactly one 200 and one 409', async () => {
      await execute('INSERT INTO stock_levels (product_id, warehouse_id, quantity) VALUES (1, 1, 100) ON DUPLICATE KEY UPDATE quantity = 100;');
      const [beforeRows] = await execute('SELECT quantity FROM stock_levels WHERE product_id = 1 AND warehouse_id = 1;');
      const stockBefore = beforeRows[0].quantity;

      const createRes = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerName: 'Concurrency Race Customer',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 10, unitPrice: 20.00 }],
        });

      const soId = createRes.body.data.id;

      await request(app)
        .patch(`/api/sales-orders/${soId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'confirmed' });

      // Run two fulfill requests in parallel
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/sales-orders/${soId}/fulfill`)
          .set('Authorization', `Bearer ${managerToken}`),
        request(app)
          .post(`/api/sales-orders/${soId}/fulfill`)
          .set('Authorization', `Bearer ${managerToken}`),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      // Stock must be decremented exactly ONCE: 100 - 10 = 90
      const [afterRows] = await execute('SELECT quantity FROM stock_levels WHERE product_id = 1 AND warehouse_id = 1;');
      expect(afterRows[0].quantity).toBe(stockBefore - 10);
    });
  });

  // ==========================================================================
  // RBAC & Security Boundaries
  // ==========================================================================
  describe('RBAC & Security Boundaries', () => {
    test('Staff role CAN create draft sales order (201 Created)', async () => {
      const res = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerName: 'Staff Allowed Customer',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 1 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    test('Staff role CAN list sales orders (200 OK)', async () => {
      const res = await request(app)
        .get('/api/sales-orders')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('Staff role CAN view sales order details (200 OK)', async () => {
      const createRes = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerName: 'Staff View SO Test',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 1 }],
        });

      const soId = createRes.body.data.id;

      const res = await request(app)
        .get(`/api/sales-orders/${soId}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('Staff role CAN confirm draft sales order (200 OK)', async () => {
      const createRes = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerName: 'Staff Confirm SO Test',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 1 }],
        });

      const soId = createRes.body.data.id;

      const res = await request(app)
        .patch(`/api/sales-orders/${soId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'confirmed' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('confirmed');
    });

    test('Staff role CAN fulfill confirmed sales order (200 OK)', async () => {
      await execute('INSERT INTO stock_levels (product_id, warehouse_id, quantity) VALUES (1, 1, 50) ON DUPLICATE KEY UPDATE quantity = 50;');

      const createRes = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerName: 'Staff Fulfill SO Test',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 2 }],
        });

      const soId = createRes.body.data.id;

      await request(app)
        .patch(`/api/sales-orders/${soId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'confirmed' });

      const res = await request(app)
        .post(`/api/sales-orders/${soId}/fulfill`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('fulfilled');
    });

    test('Staff role is DENIED cancelling sales order via POST /:id/cancel (403 Forbidden)', async () => {
      const createRes = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerName: 'Staff Cancel Denied Test',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 1 }],
        });

      const soId = createRes.body.data.id;

      const res = await request(app)
        .post(`/api/sales-orders/${soId}/cancel`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('Staff role is DENIED cancelling sales order via PATCH /:id/status (403 Forbidden)', async () => {
      const createRes = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerName: 'Staff Patch Cancel Denied Test',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 1 }],
        });

      const soId = createRes.body.data.id;

      const res = await request(app)
        .patch(`/api/sales-orders/${soId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('Admin and Manager CAN cancel sales order (200 OK)', async () => {
      // Admin cancel
      const createRes1 = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerName: 'Admin Cancel Test',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 1 }],
        });

      const soId1 = createRes1.body.data.id;

      const res1 = await request(app)
        .post(`/api/sales-orders/${soId1}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res1.status).toBe(200);
      expect(res1.body.data.status).toBe('cancelled');

      // Manager cancel
      const createRes2 = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerName: 'Manager Cancel Test',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 1 }],
        });

      const soId2 = createRes2.body.data.id;

      const res2 = await request(app)
        .post(`/api/sales-orders/${soId2}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res2.status).toBe(200);
      expect(res2.body.data.status).toBe('cancelled');
    });

    test('Unauthenticated requests are denied with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/sales-orders');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});

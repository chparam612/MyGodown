/**
 * ============================================================================
 * File: backend/tests/dashboard.test.js
 * Purpose: Integration tests for Module 8: Dashboard Summary (UC-32).
 * Why it exists: Proves metric aggregation accuracy, role-based data masking
 * (stockValue strictly omitted for staff per BR-05), open orders filtering,
 * recent movement tracking, warehouse stock breakdown, and RBAC authentication.
 * ============================================================================
 */

import request from 'supertest';
import app from '../src/app.js';
import { pool, execute } from '../src/config/db.js';
import { setupTestDatabase } from './setupTestDb.js';

describe('Module 8: Dashboard Summary (UC-32)', () => {
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
  // UC-32: View Dashboard Summary
  // ==========================================================================
  describe('UC-32: View Dashboard Summary', () => {
    test('Happy path: Admin receives complete dashboard summary including stockValue', async () => {
      const res = await request(app)
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(typeof data.totalActiveProducts).toBe('number');
      expect(typeof data.totalStockUnits).toBe('number');
      expect(typeof data.stockValue).toBe('number');
      expect('stockValue' in data).toBe(true);
      expect(typeof data.lowStockCount).toBe('number');
      expect(typeof data.openPurchaseOrders).toBe('number');
      expect(typeof data.openSalesOrders).toBe('number');
      expect(Array.isArray(data.stockByWarehouse)).toBe(true);
      expect(Array.isArray(data.recentMovements)).toBe(true);
      expect(data.recentMovements.length).toBeLessThanOrEqual(10);

      // Verify stockByWarehouse format
      if (data.stockByWarehouse.length > 0) {
        const wh = data.stockByWarehouse[0];
        expect(wh).toHaveProperty('warehouseId');
        expect(wh).toHaveProperty('warehouseName');
        expect(wh).toHaveProperty('warehouseCode');
        expect(typeof wh.totalUnits).toBe('number');
      }
    });

    test('Happy path: Manager receives complete dashboard summary including stockValue', async () => {
      const res = await request(app)
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect('stockValue' in data).toBe(true);
      expect(typeof data.stockValue).toBe('number');
    });

    test('BR-05: Staff receives dashboard summary with stockValue STRICTLY OMITTED', async () => {
      const res = await request(app)
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      // Key must not exist in payload
      expect('stockValue' in data).toBe(false);
      expect(data.stockValue).toBeUndefined();

      // Operational metrics must still be present for staff
      expect(typeof data.totalActiveProducts).toBe('number');
      expect(typeof data.totalStockUnits).toBe('number');
      expect(typeof data.lowStockCount).toBe('number');
      expect(typeof data.openPurchaseOrders).toBe('number');
      expect(typeof data.openSalesOrders).toBe('number');
      expect(Array.isArray(data.stockByWarehouse)).toBe(true);
      expect(Array.isArray(data.recentMovements)).toBe(true);
    });

    test('Accuracy: lowStockCount correctly identifies inventory at or below reorder level', async () => {
      // Query database directly to verify lowStockCount calculation
      const [rows] = await execute(
        `SELECT COUNT(*) AS expectedCount
         FROM stock_levels sl
         JOIN products p ON sl.product_id = p.id
         JOIN warehouses w ON sl.warehouse_id = w.id
         WHERE p.is_active = 1 AND w.is_active = 1 AND sl.quantity <= p.reorder_level;`
      );
      const expectedLowStock = parseInt(rows[0].expectedCount, 10);

      const res = await request(app)
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.lowStockCount).toBe(expectedLowStock);
    });

    test('Accuracy: openPurchaseOrders counts only draft and ordered POs (excludes received/cancelled)', async () => {
      // Check current open POs
      const [initialPoRows] = await execute(
        `SELECT COUNT(*) AS count FROM purchase_orders WHERE status IN ('draft', 'ordered');`
      );
      const initialOpenPOs = parseInt(initialPoRows[0].count, 10);

      // Create a draft PO via API
      const poRes = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supplierId: 1,
          warehouseId: 1,
          expectedDeliveryDate: '2026-10-15',
          items: [{ productId: 1, quantity: 10, unitCost: 20.00 }],
        });
      expect(poRes.status).toBe(201);
      const poId = poRes.body.data.id;

      // Dashboard should reflect increment
      const afterCreateRes = await request(app)
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(afterCreateRes.body.data.openPurchaseOrders).toBe(initialOpenPOs + 1);

      // Transition to ordered (still open)
      await request(app)
        .patch(`/api/purchase-orders/${poId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ordered' });

      const afterOrderedRes = await request(app)
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(afterOrderedRes.body.data.openPurchaseOrders).toBe(initialOpenPOs + 1);

      // Receive PO (now closed -> should decrement open count)
      await request(app)
        .post(`/api/purchase-orders/${poId}/receive`)
        .set('Authorization', `Bearer ${adminToken}`);

      const afterReceiveRes = await request(app)
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(afterReceiveRes.body.data.openPurchaseOrders).toBe(initialOpenPOs);
    });

    test('Accuracy: openSalesOrders counts only draft and confirmed SOs (excludes fulfilled/cancelled)', async () => {
      // Check current open SOs
      const [initialSoRows] = await execute(
        `SELECT COUNT(*) AS count FROM sales_orders WHERE status IN ('draft', 'confirmed');`
      );
      const initialOpenSOs = parseInt(initialSoRows[0].count, 10);

      // Create a draft SO via API
      const soRes = await request(app)
        .post('/api/sales-orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerName: 'Dashboard Test Client',
          warehouseId: 1,
          items: [{ productId: 1, quantity: 2, unitPrice: 35.00 }],
        });
      expect(soRes.status).toBe(201);
      const soId = soRes.body.data.id;

      // Dashboard should reflect increment
      const afterCreateRes = await request(app)
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(afterCreateRes.body.data.openSalesOrders).toBe(initialOpenSOs + 1);

      // Confirm SO (still open)
      await request(app)
        .post(`/api/sales-orders/${soId}/confirm`)
        .set('Authorization', `Bearer ${staffToken}`);

      const afterConfirmRes = await request(app)
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(afterConfirmRes.body.data.openSalesOrders).toBe(initialOpenSOs + 1);

      // Fulfil SO (now closed -> should decrement open count)
      await request(app)
        .post(`/api/sales-orders/${soId}/fulfill`)
        .set('Authorization', `Bearer ${staffToken}`);

      const afterFulfillRes = await request(app)
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(afterFulfillRes.body.data.openSalesOrders).toBe(initialOpenSOs);
    });

    test('Recent movements: returns latest 10 movements ordered newest first with resolved names', async () => {
      const res = await request(app)
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const movements = res.body.data.recentMovements;
      expect(Array.isArray(movements)).toBe(true);
      expect(movements.length).toBeLessThanOrEqual(10);

      if (movements.length > 0) {
        const first = movements[0];
        expect(first).toHaveProperty('id');
        expect(first).toHaveProperty('productId');
        expect(first).toHaveProperty('productName');
        expect(first).toHaveProperty('productSku');
        expect(first).toHaveProperty('warehouseId');
        expect(first).toHaveProperty('warehouseName');
        expect(first).toHaveProperty('movementType');
        expect(first).toHaveProperty('quantity');
        expect(first).toHaveProperty('reference');
        expect(first).toHaveProperty('createdBy');
        expect(first).toHaveProperty('createdAt');

        // Check descending sort order
        for (let i = 1; i < movements.length; i++) {
          const prev = new Date(movements[i - 1].createdAt).getTime();
          const curr = new Date(movements[i].createdAt).getTime();
          expect(prev >= curr || movements[i - 1].id >= movements[i].id).toBe(true);
        }
      }
    });

    test('Authentication: Unauthenticated request returns 401 Unauthorized', async () => {
      const res = await request(app).get('/api/dashboard/summary');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });
});

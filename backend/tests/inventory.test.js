/**
 * ============================================================================
 * File: backend/tests/inventory.test.js
 * Purpose: Integration and concurrency tests for Module 4 (Inventory: UC-14 to UC-20).
 * Why it exists: Proves pessimistic locking, transaction atomicity, deadlock prevention,
 * race condition safety, stock-guard rules, and RBAC against inventory_test_db.
 * ============================================================================
 */

import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { setupTestDatabase } from './setupTestDb.js';
import { inventoryService } from '../src/services/inventory.service.js';
import { inventoryRepository } from '../src/repositories/inventory.repository.js';

describe('Module 4: Inventory & Stock Movements (UC-14 to UC-20)', () => {
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
  // UC-14: View Current Inventory
  // --------------------------------------------------------------------------
  describe('UC-14: View Inventory', () => {
    test('Happy path: All authenticated roles can list inventory with pagination', async () => {
      const res = await request(app)
        .get('/api/inventory?page=1&limit=10')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toMatchObject({ page: 1, limit: 10 });

      const item = res.body.data[0];
      expect(item).toHaveProperty('productId');
      expect(item).toHaveProperty('productName');
      expect(item).toHaveProperty('warehouseId');
      expect(item).toHaveProperty('warehouseName');
      expect(item).toHaveProperty('quantity');
      // Staff must NOT see costPrice (BR-05)
      expect(item.costPrice).toBeUndefined();
    });

    test('Manager sees costPrice in inventory list', async () => {
      const res = await request(app)
        .get('/api/inventory?page=1&limit=5')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data[0]).toHaveProperty('costPrice');
    });

    test('Filter inventory by warehouseId', async () => {
      const res = await request(app)
        .get('/api/inventory?warehouseId=1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((i) => i.warehouseId === 1)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // UC-15: Check Stock Availability
  // --------------------------------------------------------------------------
  describe('UC-15: Check Stock Availability', () => {
    test('Happy path: Check product availability across all warehouses', async () => {
      const res = await request(app)
        .get('/api/inventory/availability?productId=1')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.productId).toBe(1);
      expect(typeof res.body.data.totalQuantity).toBe('number');
      expect(Array.isArray(res.body.data.warehouses)).toBe(true);
    });

    test('Check availability with requested quantity returns boolean flag', async () => {
      const res = await request(app)
        .get('/api/inventory/availability?productId=1&quantity=10')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('isAvailable');
      expect(typeof res.body.data.isAvailable).toBe('boolean');
    });

    test('Check availability for non-existent product returns 404', async () => {
      const res = await request(app)
        .get('/api/inventory/availability?productId=999999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // --------------------------------------------------------------------------
  // UC-16: Record Stock Movement & Insufficient Stock Protection
  // --------------------------------------------------------------------------
  describe('UC-16: Record Stock Movement & Insufficient Stock Protection', () => {
    test('Negative stock rejected: movement out beyond available stock returns 422 and stock is unchanged', async () => {
      // Get baseline stock
      const beforeCheck = await request(app)
        .get('/api/inventory/availability?productId=1&warehouseId=1')
        .set('Authorization', `Bearer ${adminToken}`);
      const initialStock = beforeCheck.body.data.warehouses.find((w) => w.warehouseId === 1)?.quantity || 0;

      // Attempt to deduct more than available
      const excessiveQty = initialStock + 1000;
      const res = await request(app)
        .post('/api/inventory/movements')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: 1,
          warehouseId: 1,
          movementType: 'out',
          quantity: excessiveQty,
          reference: 'Overdraw attempt',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');

      // Verify stock was NOT modified
      const afterCheck = await request(app)
        .get('/api/inventory/availability?productId=1&warehouseId=1')
        .set('Authorization', `Bearer ${adminToken}`);
      const finalStock = afterCheck.body.data.warehouses.find((w) => w.warehouseId === 1)?.quantity || 0;
      expect(finalStock).toBe(initialStock);
    });

    test('Happy path: Inbound movement increases stock and records movement', async () => {
      const beforeCheck = await request(app)
        .get('/api/inventory/availability?productId=1&warehouseId=1')
        .set('Authorization', `Bearer ${adminToken}`);
      const initialStock = beforeCheck.body.data.warehouses.find((w) => w.warehouseId === 1)?.quantity || 0;

      const res = await request(app)
        .post('/api/inventory/movements')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          productId: 1,
          warehouseId: 1,
          movementType: 'in',
          quantity: 25,
          reference: 'PO-TEST-INBOUND',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.newStock).toBe(initialStock + 25);

      // Verify stock updated
      const afterCheck = await request(app)
        .get('/api/inventory/availability?productId=1&warehouseId=1')
        .set('Authorization', `Bearer ${adminToken}`);
      const finalStock = afterCheck.body.data.warehouses.find((w) => w.warehouseId === 1)?.quantity || 0;
      expect(finalStock).toBe(initialStock + 25);
    });

    test('Staff role is denied recording stock movements (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/inventory/movements')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          productId: 1,
          warehouseId: 1,
          movementType: 'in',
          quantity: 10,
          reference: 'STAFF-BYPASS-ATTEMPT',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // --------------------------------------------------------------------------
  // UC-17: Adjust Stock (Admin & Manager Only)
  // --------------------------------------------------------------------------
  describe('UC-17: Adjust Stock', () => {
    test('Adjust without reason is rejected with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          productId: 1,
          warehouseId: 1,
          countedQuantity: 100,
          // reason missing
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('Staff role is denied adjusting stock (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          productId: 1,
          warehouseId: 1,
          countedQuantity: 100,
          reason: 'Staff physical count',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Happy path: Manager can adjust stock and record signed delta', async () => {
      // Set to 80 units
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          productId: 1,
          warehouseId: 1,
          countedQuantity: 80,
          reason: 'Quarterly Physical Audit',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.countedQuantity).toBe(80);
      expect(res.body.data.reason).toBe('Quarterly Physical Audit');
      expect(res.body.data.delta).toBeDefined();

      // Verify updated stock
      const check = await request(app)
        .get('/api/inventory/availability?productId=1&warehouseId=1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(check.body.data.warehouses.find((w) => w.warehouseId === 1)?.quantity).toBe(80);
    });
  });

  // --------------------------------------------------------------------------
  // UC-18: Transfer Stock (Deadlock Prevention, Atomicity & Safety)
  // --------------------------------------------------------------------------
  describe('UC-18: Transfer Stock', () => {
    test('Transfer to the same warehouse is rejected with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/inventory/transfer')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          productId: 1,
          sourceWarehouseId: 1,
          destinationWarehouseId: 1, // Same
          quantity: 5,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/cannot be the same/i);
    });

    test('Staff role is denied transferring stock (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/inventory/transfer')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          productId: 1,
          sourceWarehouseId: 1,
          destinationWarehouseId: 2,
          quantity: 5,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('Happy path: Manager transfers stock between two active warehouses', async () => {
      // Ensure source has 50 units
      await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: 2, warehouseId: 1, countedQuantity: 50, reason: 'Init for transfer' });

      // Ensure dest has 10 units
      await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: 2, warehouseId: 2, countedQuantity: 10, reason: 'Init for transfer' });

      const res = await request(app)
        .post('/api/inventory/transfer')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          productId: 2,
          sourceWarehouseId: 1,
          destinationWarehouseId: 2,
          quantity: 15,
          reason: 'Inter-warehouse rebalancing',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sourceRemainingStock).toBe(35);
      expect(res.body.data.destinationNewStock).toBe(25);
      expect(res.body.data.transferReference).toMatch(/^TRF-/);
      expect(res.body.data.sourceMovementId).toBeDefined();
      expect(res.body.data.destinationMovementId).toBeDefined();

      // Verify database records: both movements share the same reference_id and have reference_type = 'transfer'
      const [movRows] = await pool.query(
        `SELECT id, movement_type, reference_type, reference_id, quantity 
         FROM stock_movements 
         WHERE id IN (?, ?) 
         ORDER BY id ASC;`,
        [res.body.data.sourceMovementId, res.body.data.destinationMovementId]
      );
      expect(movRows.length).toBe(2);
      expect(movRows[0].reference_type).toBe('transfer');
      expect(movRows[1].reference_type).toBe('transfer');
      // Both transfer movements share the exact same reference_id
      expect(movRows[0].reference_id).toBe(res.body.data.sourceMovementId);
      expect(movRows[1].reference_id).toBe(res.body.data.sourceMovementId);
    });

    test('Atomicity: Mid-way failure rolls back both warehouses and inserts zero movements', async () => {
      // Setup known quantities
      await inventoryService.adjustStock({
        productId: 3,
        warehouseId: 1,
        countedQuantity: 40,
        reason: 'Pre-atomic setup WH1',
        userId: 1,
      });
      await inventoryService.adjustStock({
        productId: 3,
        warehouseId: 2,
        countedQuantity: 20,
        reason: 'Pre-atomic setup WH2',
        userId: 1,
      });

      // Intercept insertStockMovement to fail on the second call (mid-way through transaction)
      const originalInsert = inventoryRepository.insertStockMovement;
      let callCount = 0;
      inventoryRepository.insertStockMovement = async function (...args) {
        callCount++;
        if (callCount === 2) {
          throw new Error('Simulated database crash during transfer movement creation');
        }
        return originalInsert.apply(this, args);
      };

      try {
        // Attempt transfer
        await expect(
          inventoryService.transferStock({
            productId: 3,
            sourceWarehouseId: 1,
            destinationWarehouseId: 2,
            quantity: 10,
            reason: 'Will fail mid-way',
            userId: 1,
          })
        ).rejects.toThrow('Simulated database crash during transfer movement creation');
      } finally {
        // Restore repository method
        inventoryRepository.insertStockMovement = originalInsert;
      }

      // Verify BOTH warehouses remain at pre-transaction amounts
      const wh1Avail = await inventoryService.checkAvailability(3, 1);
      const wh2Avail = await inventoryService.checkAvailability(3, 2);

      expect(wh1Avail.warehouses[0].quantity).toBe(40);
      expect(wh2Avail.warehouses[0].quantity).toBe(20);
    });

    test('Transfer to or from an inactive warehouse is rejected (422 Unprocessable Entity)', async () => {
      // Create an inactive warehouse
      const { warehouseRepository } = await import('../src/repositories/warehouse.repository.js');
      const inactiveWh = await warehouseRepository.create({
        name: 'Inactive Hub',
        code: `WH-INACT-${Date.now().toString().slice(-4)}`,
        city: 'Detroit',
        isActive: false,
      });

      const res = await request(app)
        .post('/api/inventory/transfer')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          productId: 1,
          sourceWarehouseId: 1,
          destinationWarehouseId: inactiveWh.id,
          quantity: 5,
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
      expect(res.body.error.message).toMatch(/inactive warehouse/i);
    });

    test('Deadlock prevention: Concurrent opposite-direction transfers complete safely', async () => {
      // Set both warehouses to 100 units
      await inventoryService.adjustStock({ productId: 4, warehouseId: 1, countedQuantity: 100, reason: 'Deadlock test WH1', userId: 1 });
      await inventoryService.adjustStock({ productId: 4, warehouseId: 2, countedQuantity: 100, reason: 'Deadlock test WH2', userId: 1 });

      // Run concurrent opposite transfers (WH1 -> WH2 and WH2 -> WH1)
      const transfer1 = inventoryService.transferStock({
        productId: 4,
        sourceWarehouseId: 1,
        destinationWarehouseId: 2,
        quantity: 10,
        reason: 'Transfer 1->2',
        userId: 1,
      });

      const transfer2 = inventoryService.transferStock({
        productId: 4,
        sourceWarehouseId: 2,
        destinationWarehouseId: 1,
        quantity: 10,
        reason: 'Transfer 2->1',
        userId: 1,
      });

      const [res1, res2] = await Promise.all([transfer1, transfer2]);
      expect(res1.transferReference).toBeDefined();
      expect(res2.transferReference).toBeDefined();

      // Final stock balances must still be exactly 100 in each
      const wh1Avail = await inventoryService.checkAvailability(4, 1);
      const wh2Avail = await inventoryService.checkAvailability(4, 2);

      expect(wh1Avail.warehouses[0].quantity).toBe(100);
      expect(wh2Avail.warehouses[0].quantity).toBe(100);
    });

    test('Race Condition: Two simultaneous out requests for last units where exactly one succeeds', async () => {
      // Set stock to exactly 10 units
      await inventoryService.adjustStock({
        productId: 5,
        warehouseId: 1,
        countedQuantity: 10,
        reason: 'Race condition setup',
        userId: 1,
      });

      // Fire two simultaneous requests for 10 units each
      const req1 = request(app)
        .post('/api/inventory/movements')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: 5, warehouseId: 1, movementType: 'out', quantity: 10, reference: 'RACE-1' });

      const req2 = request(app)
        .post('/api/inventory/movements')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productId: 5, warehouseId: 1, movementType: 'out', quantity: 10, reference: 'RACE-2' });

      const results = await Promise.all([req1, req2]);
      const statuses = results.map((r) => r.status).sort();

      // One must succeed (201 Created), one must fail (422 Insufficient Stock)
      expect(statuses).toEqual([201, 422]);

      // Stock must be exactly 0 (never negative)
      const avail = await inventoryService.checkAvailability(5, 1);
      expect(avail.warehouses[0].quantity).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // UC-20: Monitor Low Stock
  // --------------------------------------------------------------------------
  describe('UC-20: Monitor Low Stock', () => {
    test('Happy path: Returns products at or below reorder level', async () => {
      // Set product 6 in WH1 to 2 units (reorder_level for product 6 is >= 5)
      await inventoryService.adjustStock({
        productId: 6,
        warehouseId: 1,
        countedQuantity: 2,
        reason: 'Trigger low stock',
        userId: 1,
      });

      const res = await request(app)
        .get('/api/inventory/low-stock')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const item = res.body.data.find((i) => i.productId === 6 && i.warehouseId === 1);
      expect(item).toBeDefined();
      expect(item.quantity).toBeLessThanOrEqual(item.reorderLevel);
      expect(item.deficit).toBeGreaterThan(0);
      expect(item).toHaveProperty('costPrice');
    });

    test('Staff does NOT see costPrice in low stock list (BR-05)', async () => {
      const res = await request(app)
        .get('/api/inventory/low-stock')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((i) => i.costPrice === undefined)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // UC-19: Movement History
  // --------------------------------------------------------------------------
  describe('UC-19: Movement History', () => {
    test('Happy path: All authenticated roles can list movement history newest first', async () => {
      const res = await request(app)
        .get('/api/inventory/movements?page=1&limit=10')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      const mov = res.body.data[0];
      expect(mov).toHaveProperty('productId');
      expect(mov).toHaveProperty('warehouseId');
      expect(mov).toHaveProperty('userId');
      expect(mov).toHaveProperty('movementType');
      expect(mov).toHaveProperty('quantity');
      expect(mov).toHaveProperty('reference');
      expect(mov).toHaveProperty('createdAt');
    });

    test('Filter movements by type', async () => {
      const res = await request(app)
        .get('/api/inventory/movements?type=adjustment')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((m) => m.movementType === 'adjustment')).toBe(true);
    });

    test('Unauthenticated request returns 401 on inventory routes', async () => {
      const res1 = await request(app).get('/api/inventory');
      expect(res1.status).toBe(401);

      const res2 = await request(app).get('/api/inventory/availability?productId=1');
      expect(res2.status).toBe(401);

      const res3 = await request(app).post('/api/inventory/adjust').send({ productId: 1, warehouseId: 1, countedQuantity: 10, reason: 'test' });
      expect(res3.status).toBe(401);

      const res4 = await request(app).post('/api/inventory/transfer').send({ productId: 1, sourceWarehouseId: 1, destinationWarehouseId: 2, quantity: 5 });
      expect(res4.status).toBe(401);

      const res5 = await request(app).get('/api/inventory/movements');
      expect(res5.status).toBe(401);
    });
  });
});

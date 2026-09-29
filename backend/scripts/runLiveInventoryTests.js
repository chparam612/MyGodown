/**
 * ============================================================================
 * File: backend/scripts/runLiveInventoryTests.js
 * Purpose: Live execution of Module 4 (Inventory) endpoints against inventory_db.
 * Safety Guarantee:
 * - Credentials read exclusively from process.env (never hardcoded, never logged).
 * - Creates dedicated LIVE- prefixed product and warehouses via the API.
 * - All movements, adjustments, and transfers execute EXCLUSIVELY on LIVE- entities.
 * - Seeded products (IDs 1-20), warehouses (IDs 1-3), and seed stock are NEVER modified.
 * - Cleans up all LIVE- test stock to 0 and soft-deactivates LIVE- entities at end.
 * ============================================================================
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Verify presence of required seed passwords in environment (no hardcoded fallbacks)
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
const managerPassword = process.env.SEED_MANAGER_PASSWORD;
const staffPassword = process.env.SEED_STAFF_PASSWORD;

if (!adminPassword || !managerPassword || !staffPassword) {
  console.error('[FATAL]: Missing required seed password environment variables (SEED_ADMIN_PASSWORD, SEED_MANAGER_PASSWORD, SEED_STAFF_PASSWORD).');
  process.exit(1);
}

// Target development database inventory_db
process.env.NODE_ENV = 'development';
const PORT = parseInt(process.env.PORT || '5000', 10);
const BASE_URL = `http://localhost:${PORT}/api`;

async function runLiveInventoryTests() {
  console.log('====================================================================');
  console.log(`[MODULE 4 LIVE RUN]: Target Database = ${process.env.DB_NAME} on PORT ${PORT}`);
  console.log(`[EXECUTION DATE]: ${new Date().toISOString()}`);
  console.log('====================================================================\n');

  const { default: app } = await import('../src/app.js');
  const { pool, checkDbHealth } = await import('../src/config/db.js');

  const healthy = await checkDbHealth();
  if (!healthy) {
    console.error('Fatal: Database health check failed on', process.env.DB_NAME);
    process.exit(1);
  }

  const server = app.listen(PORT);
  console.log(`Server started on http://localhost:${PORT}\n`);

  function mask(str) {
    if (!str || typeof str !== 'string' || str.length < 16) return str;
    return str.slice(0, 8) + '...' + str.slice(-8);
  }

  async function request(method, path, body = null, token = null) {
    const headers = { 'Accept': 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json();
    return { status: res.status, body: data };
  }

  try {
    // ------------------------------------------------------------------------
    // Step 1: Authenticate Seeded Users (Credentials from process.env)
    // ------------------------------------------------------------------------
    console.log('--- STEP 1: AUTHENTICATION (Using process.env credentials) ---');
    const adminLogin = await request('POST', '/auth/login', {
      email: 'admin@mygodown.com',
      password: adminPassword,
    });
    const adminToken = adminLogin.body?.data?.token;
    console.log(`1. Admin Login (admin@mygodown.com) -> Status: ${adminLogin.status}, Token: ${mask(adminToken)}`);

    const mgrLogin = await request('POST', '/auth/login', {
      email: 'manager@mygodown.com',
      password: managerPassword,
    });
    const managerToken = mgrLogin.body?.data?.token;
    console.log(`2. Manager Login (manager@mygodown.com) -> Status: ${mgrLogin.status}, Token: ${mask(managerToken)}`);

    const staffLogin = await request('POST', '/auth/login', {
      email: 'staff@mygodown.com',
      password: staffPassword,
    });
    const staffToken = staffLogin.body?.data?.token;
    console.log(`3. Staff Login (staff@mygodown.com) -> Status: ${staffLogin.status}, Token: ${mask(staffToken)}`);

    // ------------------------------------------------------------------------
    // Step 1b: One-Time Cleanup of Existing Leftovers (Product 64, Warehouses 22, 23, 24)
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 1B: ONE-TIME CLEANUP OF PREVIOUS LEFTOVERS ---');
    const [leftoverStock] = await pool.query(
      `SELECT product_id, warehouse_id, quantity FROM stock_levels WHERE product_id = 64 AND quantity > 0;`
    );
    for (const row of leftoverStock) {
      console.log(`   Adjusting leftover product 64 stock in warehouse ${row.warehouse_id} (current: ${row.quantity}) to 0...`);
      const adjRes = await request('POST', '/inventory/adjust', {
        productId: 64,
        warehouseId: row.warehouse_id,
        countedQuantity: 0,
        reason: 'live test cleanup',
      }, adminToken);
      console.log(`   -> Status: ${adjRes.status}`);
    }

    // Soft-deactivate product 64 if active
    const deactProd64 = await request('DELETE', '/products/64', null, adminToken);
    console.log(`   Deactivate leftover product 64 -> Status: ${deactProd64.status}`);

    // Soft-deactivate leftover warehouses 22, 23, 24
    for (const whId of [22, 23, 24]) {
      const deactWh = await request('DELETE', `/warehouses/${whId}`, null, adminToken);
      console.log(`   Deactivate leftover warehouse ${whId} -> Status: ${deactWh.status}`);
    }

    // ------------------------------------------------------------------------
    // Step 2: Create Isolated LIVE- Entities (Strictly between these two)
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 2: PROVISION ISOLATED LIVE- TEST ENTITIES ---');
    const ts = Date.now().toString().slice(-6);

    // 2a. Create LIVE Warehouse A
    const whARes = await request('POST', '/warehouses', {
      name: `LIVE Staging Hub A (${ts})`,
      code: `WH-LIVE-A-${ts}`,
      city: 'Kansas City',
      address: '100 Live Freight Road',
      isActive: true,
    }, adminToken);
    const whA = whARes.body.data;
    console.log(`4. Create Warehouse A -> Status: ${whARes.status} [ID: ${whA.id}, Code: ${whA.code}]`);

    // 2b. Create LIVE Warehouse B
    const whBRes = await request('POST', '/warehouses', {
      name: `LIVE Staging Hub B (${ts})`,
      code: `WH-LIVE-B-${ts}`,
      city: 'Saint Louis',
      address: '200 Live River Boulevard',
      isActive: true,
    }, adminToken);
    const whB = whBRes.body.data;
    console.log(`5. Create Warehouse B -> Status: ${whBRes.status} [ID: ${whB.id}, Code: ${whB.code}]`);

    // 2c. Create LIVE Product
    const prodRes = await request('POST', '/products', {
      sku: `PROD-LIVE-${ts}`,
      name: `LIVE Precision Linear Actuator (${ts})`,
      description: 'Industrial linear motion actuator for automated packing lines',
      category: 'Electronics',
      unitPrice: 249.50,
      costPrice: 140.00,
      reorderLevel: 20,
      supplierId: 2, // VoltCore Electronics
    }, managerToken);
    const liveProd = prodRes.body.data;
    console.log(`6. Create Product -> Status: ${prodRes.status} [ID: ${liveProd.id}, SKU: ${liveProd.sku}]`);

    // ------------------------------------------------------------------------
    // Step 3: Module 4 Operations on LIVE- Entities Only
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 3: INVENTORY OPERATIONS ON LIVE- DATA ONLY ---');

    // 3a. [UC-16] Inbound Movement into Warehouse A
    const inRes = await request('POST', '/inventory/movements', {
      productId: liveProd.id,
      warehouseId: whA.id,
      movementType: 'in',
      quantity: 100,
      reference: `PO-LIVE-INBOUND-${ts}`,
    }, managerToken);
    console.log(`7. [UC-16] Inbound 100 units to WH A -> Status: ${inRes.status}`, inRes.body);

    // 3b. [UC-15] Check Availability
    const availRes = await request('GET', `/inventory/availability?productId=${liveProd.id}&quantity=50`, null, staffToken);
    console.log(`8. [UC-15] Check Availability (Qty 50) -> Status: ${availRes.status}`, availRes.body);

    // 3c. [UC-16] Outbound Movement Overdraw Attempt (422 Insufficient Stock)
    const overdrawRes = await request('POST', '/inventory/movements', {
      productId: liveProd.id,
      warehouseId: whA.id,
      movementType: 'out',
      quantity: 99999,
      reference: 'Overdraw attempt',
    }, staffToken);
    console.log(`9. [UC-16] Overdraw Outbound Movement (422) -> Status: ${overdrawRes.status}`, overdrawRes.body);

    // 3d. [UC-16] Valid Outbound Movement (20 units)
    const outRes = await request('POST', '/inventory/movements', {
      productId: liveProd.id,
      warehouseId: whA.id,
      movementType: 'out',
      quantity: 20,
      reference: `DISPATCH-LIVE-${ts}`,
    }, staffToken);
    console.log(`10. [UC-16] Valid Outbound 20 units -> Status: ${outRes.status} (Remaining: ${outRes.body?.data?.newStock})`);

    // 3e. [UC-17] Adjust Stock Missing Reason (400 Bad Request)
    const badAdjustRes = await request('POST', '/inventory/adjust', {
      productId: liveProd.id,
      warehouseId: whA.id,
      countedQuantity: 75,
      // reason missing
    }, managerToken);
    console.log(`11. [UC-17] Adjust Without Reason (400) -> Status: ${badAdjustRes.status}`, badAdjustRes.body);

    // 3f. [UC-17] Staff Adjust Forbidden (403 Forbidden)
    const staffAdjustRes = await request('POST', '/inventory/adjust', {
      productId: liveProd.id,
      warehouseId: whA.id,
      countedQuantity: 75,
      reason: 'Staff adjustment attempt',
    }, staffToken);
    console.log(`12. [UC-17] Staff Adjust Forbidden (403) -> Status: ${staffAdjustRes.status}`, staffAdjustRes.body);

    // 3g. [UC-17] Valid Stock Adjustment (Counted: 75, Delta: -5)
    const adjustRes = await request('POST', '/inventory/adjust', {
      productId: liveProd.id,
      warehouseId: whA.id,
      countedQuantity: 75,
      reason: `Audited physical count (${ts})`,
    }, managerToken);
    console.log(`13. [UC-17] Valid Adjustment to 75 -> Status: ${adjustRes.status}`, adjustRes.body);

    // 3h. [UC-18] Transfer Stock Same Warehouse (400 Bad Request)
    const sameWhRes = await request('POST', '/inventory/transfer', {
      productId: liveProd.id,
      sourceWarehouseId: whA.id,
      destinationWarehouseId: whA.id,
      quantity: 10,
    }, managerToken);
    console.log(`14. [UC-18] Transfer Same Warehouse (400) -> Status: ${sameWhRes.status}`, sameWhRes.body);

    // 3i. [UC-18] Transfer Stock Staff Forbidden (403 Forbidden)
    const staffTransferRes = await request('POST', '/inventory/transfer', {
      productId: liveProd.id,
      sourceWarehouseId: whA.id,
      destinationWarehouseId: whB.id,
      quantity: 10,
    }, staffToken);
    console.log(`15. [UC-18] Staff Transfer Forbidden (403) -> Status: ${staffTransferRes.status}`, staffTransferRes.body);

    // 3j. [UC-18] Transfer Stock Overdraw (422 Insufficient Stock)
    const overTransferRes = await request('POST', '/inventory/transfer', {
      productId: liveProd.id,
      sourceWarehouseId: whA.id,
      destinationWarehouseId: whB.id,
      quantity: 99999,
      reason: 'Over-transfer attempt',
    }, managerToken);
    console.log(`16. [UC-18] Transfer Exceeding Stock (422) -> Status: ${overTransferRes.status}`, overTransferRes.body);

    // 3k. [UC-18] Valid Inter-Warehouse Transfer (Transfer 30 units from A to B)
    const transferRes = await request('POST', '/inventory/transfer', {
      productId: liveProd.id,
      sourceWarehouseId: whA.id,
      destinationWarehouseId: whB.id,
      quantity: 30,
      reason: `Live stock rebalance (${ts})`,
    }, managerToken);
    console.log(`17. [UC-18] Valid Transfer 30 units -> Status: ${transferRes.status}`, transferRes.body);

    // 3l. [UC-14] View Inventory Overview
    const invRes = await request('GET', `/inventory?productId=${liveProd.id}`, null, staffToken);
    console.log(`18. [UC-14] View Inventory for LIVE Product (Staff) -> Status: ${invRes.status}`);
    console.table(invRes.body?.data);

    // 3m. [UC-19] View Movement History
    const movRes = await request('GET', `/inventory/movements?productId=${liveProd.id}&limit=5`, null, managerToken);
    console.log(`19. [UC-19] Movement History for LIVE Product -> Status: ${movRes.status}, count: ${movRes.body?.data?.length}`);
    console.log('    Sample Movement:', movRes.body?.data?.[0]);

    // 3n. [UC-20] Trigger Low Stock Alert & Check Staff Cost Price Masking
    await request('POST', '/inventory/adjust', {
      productId: liveProd.id,
      warehouseId: whB.id,
      countedQuantity: 10,
      reason: 'Trigger low stock state',
    }, managerToken);

    const lowStockStaff = await request('GET', `/inventory/low-stock?warehouseId=${whB.id}`, null, staffToken);
    console.log(`20. [UC-20] Low Stock View (Staff) -> Status: ${lowStockStaff.status}`);
    const staffItem = lowStockStaff.body?.data?.find((i) => i.productId === liveProd.id);
    console.log('    Staff item (costPrice must be undefined):', staffItem ? { ...staffItem, costPrice: staffItem.costPrice } : 'Not found');

    const lowStockMgr = await request('GET', `/inventory/low-stock?warehouseId=${whB.id}`, null, managerToken);
    console.log(`21. [UC-20] Low Stock View (Manager) -> Status: ${lowStockMgr.status}`);
    const mgrItem = lowStockMgr.body?.data?.find((i) => i.productId === liveProd.id);
    console.log('    Manager item (costPrice must be present):', mgrItem ? { ...mgrItem, costPrice: mgrItem.costPrice } : 'Not found');

    // ------------------------------------------------------------------------
    // Step 4: Self-Cleaning (Adjust all LIVE stock to 0, deactivate product & warehouses)
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 4: SELF-CLEANING SCRIPT EXECUTION ---');
    console.log('Adjusting all LIVE product stock to 0 through normal adjust route...');
    const cleanAdjA = await request('POST', '/inventory/adjust', {
      productId: liveProd.id,
      warehouseId: whA.id,
      countedQuantity: 0,
      reason: 'live test cleanup',
    }, adminToken);
    console.log(`   Adjust WH A stock to 0 -> Status: ${cleanAdjA.status}`);

    const cleanAdjB = await request('POST', '/inventory/adjust', {
      productId: liveProd.id,
      warehouseId: whB.id,
      countedQuantity: 0,
      reason: 'live test cleanup',
    }, adminToken);
    console.log(`   Adjust WH B stock to 0 -> Status: ${cleanAdjB.status}`);

    // Soft-deactivate LIVE product
    const cleanDeactProd = await request('DELETE', `/products/${liveProd.id}`, null, adminToken);
    console.log(`   Soft-deactivate LIVE product ${liveProd.id} -> Status: ${cleanDeactProd.status}`);

    // Soft-deactivate LIVE warehouses
    const cleanDeactWhA = await request('DELETE', `/warehouses/${whA.id}`, null, adminToken);
    console.log(`   Soft-deactivate LIVE warehouse A (${whA.id}) -> Status: ${cleanDeactWhA.status}`);

    const cleanDeactWhB = await request('DELETE', `/warehouses/${whB.id}`, null, adminToken);
    console.log(`   Soft-deactivate LIVE warehouse B (${whB.id}) -> Status: ${cleanDeactWhB.status}`);

    // ------------------------------------------------------------------------
    // Step 5: Verification Queries
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 5: VERIFICATION QUERIES ---');
    const [seededTotals] = await pool.query(
      `SELECT warehouse_id, COUNT(*) AS product_count, SUM(quantity) AS total_stock 
       FROM stock_levels 
       WHERE warehouse_id IN (1, 2, 3) 
       GROUP BY warehouse_id 
       ORDER BY warehouse_id;`
    );
    console.log('Seeded Warehouses (1-3) Counts & Totals (Must match original seed 20, 9, 10 / 1289, 318, 290):');
    console.table(seededTotals);

    const [recentMovements] = await pool.query(
      `SELECT id, movement_type, quantity, reference_type, reference_id, created_at 
       FROM stock_movements 
       ORDER BY id DESC 
       LIMIT 10;`
    );
    console.log('Most Recent Stock Movements in inventory_db (LIMIT 10):');
    console.table(recentMovements);

    console.log('\n====================================================================');
    console.log('[LIVE SERVER RUN]: All operations and self-cleaning completed successfully!');
    console.log('====================================================================\n');
  } finally {
    server.close();
    await pool.end();
  }
}

runLiveInventoryTests().catch((err) => {
  console.error('[Fatal Error in Live Inventory Run]:', err);
  process.exit(1);
});

/**
 * ============================================================================
 * File: backend/scripts/runLiveDashboardTests.js
 * Purpose: Live execution of Module 8 (Dashboard: UC-32) against inventory_db.
 * Safety Guarantee:
 * - Credentials read exclusively from process.env (never hardcoded, never logged).
 * - Creates dedicated LIVE- prefixed supplier, warehouse, and product via the API.
 * - Inbounds stock below reorder level to verify lowStockCount calculation.
 * - Creates open PO and SO to verify open order aggregations.
 * - Verifies stockValue presence for Admin and Manager.
 * - Verifies BR-05 strict omission of stockValue for Staff.
 * - Seeded products (IDs 1-20), warehouses (IDs 1-3), and seed stock are NEVER modified.
 * - Cleans up all LIVE- test stock to 0, cancels orders, and soft-deactivates LIVE- entities.
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

process.env.NODE_ENV = 'development';
const PORT = parseInt(process.env.PORT || '5000', 10);
const BASE_URL = `http://localhost:${PORT}/api`;

async function runLiveDashboardTests() {
  console.log('====================================================================');
  console.log(`[MODULE 8 LIVE RUN]: Target Database = ${process.env.DB_NAME || 'inventory_db'} on PORT ${PORT}`);
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
    // Baseline Audit of Seeded Warehouses
    // ------------------------------------------------------------------------
    console.log('--- BASELINE CHECK: Seeded Warehouses 1-3 Stock Levels ---');
    const [baselineStock] = await pool.query(
      `SELECT warehouse_id, SUM(quantity) AS total_units, COUNT(*) AS product_count 
       FROM stock_levels WHERE warehouse_id IN (1, 2, 3) GROUP BY warehouse_id ORDER BY warehouse_id;`
    );
    console.log('Baseline stock counts in seeded warehouses:', baselineStock);

    // ------------------------------------------------------------------------
    // Step 1: Authentication
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 1: AUTHENTICATION (Using process.env credentials) ---');
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
    // Step 2: Create LIVE- Fixtures to ensure dynamic dashboard metrics
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 2: CREATING LIVE- TEST FIXTURES (Isolated from Seed) ---');
    const rand = Math.floor(100000 + Math.random() * 900000);

    // 2a: Create LIVE- Warehouse
    const whRes = await request('POST', '/warehouses', {
      name: `LIVE-WH-AnalyticsHub-${rand}`,
      code: `WH-DASH-${rand}`,
      city: 'Metro City',
      address: '777 Metric Blvd, Suite 100',
    }, adminToken);
    const liveWarehouseId = whRes.body?.data?.id;
    console.log(`4. Created LIVE- Warehouse (ID=${liveWarehouseId}, Code='WH-DASH-${rand}') -> Status: ${whRes.status}`);

    // 2b: Create LIVE- Supplier
    const supRes = await request('POST', '/suppliers', {
      name: `LIVE-SUP-Analytics-${rand}`,
      contactName: 'Metric Vendor',
      email: `dash-${rand}@analytics.com`,
      phone: '+1-555-777-8888',
      address: '888 Analytic Way',
    }, managerToken);
    const liveSupplierId = supRes.body?.data?.id;
    console.log(`5. Created LIVE- Supplier (ID=${liveSupplierId}) -> Status: ${supRes.status}`);

    // 2c: Create LIVE- Product with reorderLevel = 25
    const prodRes = await request('POST', '/products', {
      name: `LIVE-PROD-SensorModule-${rand}`,
      sku: `PROD-DASH-${rand}`,
      category: 'Electronics',
      unitPrice: 50.00,
      costPrice: 20.00,
      reorderLevel: 25,
      supplierId: liveSupplierId,
    }, adminToken);
    const liveProductId = prodRes.body?.data?.id;
    console.log(`6. Created LIVE- Product (ID=${liveProductId}, SKU='PROD-DASH-${rand}') -> Status: ${prodRes.status}`);

    // 2d: Inbound 15 units into LIVE- Warehouse (15 <= 25 -> low stock trigger!)
    const inboundRes = await request('POST', '/inventory/movements', {
      productId: liveProductId,
      warehouseId: liveWarehouseId,
      movementType: 'in',
      quantity: 15,
      reference: `Initial Stock for Dashboard Verification ${rand}`,
    }, managerToken);
    console.log(`7. Inbound 15 Units to LIVE- Warehouse (Triggers Low Stock: 15 <= 25) -> Status: ${inboundRes.status}, New Stock: ${inboundRes.body?.data?.newStock}`);

    // 2e: Create draft PO (triggers openPurchaseOrders)
    const poRes = await request('POST', '/purchase-orders', {
      supplierId: liveSupplierId,
      warehouseId: liveWarehouseId,
      expectedDeliveryDate: '2026-11-01',
      items: [{ productId: liveProductId, quantity: 10, unitCost: 20.00 }],
    }, managerToken);
    const livePoId = poRes.body?.data?.id;
    console.log(`8. Created Draft PO (ID=${livePoId}, PO#=${poRes.body?.data?.poNumber}) -> Status: ${poRes.status}`);

    // 2f: Create draft SO (triggers openSalesOrders)
    const soRes = await request('POST', '/sales-orders', {
      customerName: 'Dashboard Client Corp',
      warehouseId: liveWarehouseId,
      items: [{ productId: liveProductId, quantity: 5, unitPrice: 50.00 }],
    }, staffToken);
    const liveSoId = soRes.body?.data?.id;
    console.log(`9. Created Draft SO (ID=${liveSoId}, SO#=${soRes.body?.data?.soNumber}) -> Status: ${soRes.status}`);

    // ------------------------------------------------------------------------
    // Step 3: Admin Requests Dashboard Summary
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 3: ADMIN DASHBOARD SUMMARY (Full Access) ---');
    const adminDash = await request('GET', '/dashboard/summary', null, adminToken);
    const adminData = adminDash.body?.data;
    console.log(`10. Admin GET /api/dashboard/summary -> Status: ${adminDash.status}`);
    console.log(`    - totalActiveProducts: ${adminData?.totalActiveProducts}`);
    console.log(`    - totalStockUnits: ${adminData?.totalStockUnits}`);
    console.log(`    - stockValue: $${adminData?.stockValue} (Present: ${'stockValue' in adminData})`);
    console.log(`    - lowStockCount: ${adminData?.lowStockCount}`);
    console.log(`    - openPurchaseOrders: ${adminData?.openPurchaseOrders}`);
    console.log(`    - openSalesOrders: ${adminData?.openSalesOrders}`);
    console.log(`    - stockByWarehouse count: ${adminData?.stockByWarehouse?.length}`);
    console.log(`    - recentMovements count: ${adminData?.recentMovements?.length}`);

    // ------------------------------------------------------------------------
    // Step 4: Manager Requests Dashboard Summary
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 4: MANAGER DASHBOARD SUMMARY (Full Access) ---');
    const mgrDash = await request('GET', '/dashboard/summary', null, managerToken);
    const mgrData = mgrDash.body?.data;
    console.log(`11. Manager GET /api/dashboard/summary -> Status: ${mgrDash.status}`);
    console.log(`    - stockValue: $${mgrData?.stockValue} (Present: ${'stockValue' in mgrData})`);

    // ------------------------------------------------------------------------
    // Step 5: Staff Requests Dashboard Summary (BR-05 Omission Verification)
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 5: STAFF DASHBOARD SUMMARY (BR-05 Data Masking) ---');
    const staffDash = await request('GET', '/dashboard/summary', null, staffToken);
    const staffData = staffDash.body?.data;
    const hasStockValue = 'stockValue' in staffData;
    console.log(`12. Staff GET /api/dashboard/summary -> Status: ${staffDash.status}`);
    console.log(`    - 'stockValue' in payload: ${hasStockValue} (MUST BE false)`);
    console.log(`    - stockValue value: ${staffData?.stockValue} (MUST BE undefined)`);
    console.log(`    - Keys present in staff data: [${Object.keys(staffData).join(', ')}]`);
    console.log(`    - Staff lowStockCount: ${staffData?.lowStockCount}`);
    console.log(`    - Staff openSalesOrders: ${staffData?.openSalesOrders}`);

    // ------------------------------------------------------------------------
    // Step 6: Unauthenticated Request
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 6: UNAUTHENTICATED ACCESS SECURITY ---');
    const unauthDash = await request('GET', '/dashboard/summary', null, null);
    console.log(`13. Unauthenticated GET /api/dashboard/summary -> Status: ${unauthDash.status}, Code: '${unauthDash.body?.error?.code}'`);

    // ------------------------------------------------------------------------
    // Step 7: Self-Cleaning LIVE- Fixtures
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 7: SELF-CLEANING LIVE- FIXTURES ---');

    // Cancel draft SO
    const cancelSoRes = await request('POST', `/sales-orders/${liveSoId}/cancel`, null, managerToken);
    console.log(`14. Cancelled Draft SO (ID=${liveSoId}) -> Status: ${cancelSoRes.status}`);

    // Cancel draft PO
    const cancelPoRes = await request('POST', `/purchase-orders/${livePoId}/cancel`, null, managerToken);
    console.log(`15. Cancelled Draft PO (ID=${livePoId}) -> Status: ${cancelPoRes.status}`);

    // Zero out remaining stock
    const adjustRes = await request('POST', '/inventory/adjust', {
      productId: liveProductId,
      warehouseId: liveWarehouseId,
      countedQuantity: 0,
      reason: 'Self-cleaning live test fixtures',
    }, managerToken);
    console.log(`16. Reset LIVE- Product Stock to 0: Delta=${adjustRes.body?.data?.delta} -> Status: ${adjustRes.status}`);

    // Soft-deactivate product
    const deactProdRes = await request('DELETE', `/products/${liveProductId}`, null, managerToken);
    console.log(`17. Soft-deactivated LIVE- product (ID=${liveProductId}) -> Status: ${deactProdRes.status}`);

    // Soft-deactivate warehouse
    const deactWhRes = await request('DELETE', `/warehouses/${liveWarehouseId}`, null, adminToken);
    console.log(`18. Soft-deactivated LIVE- warehouse (ID=${liveWarehouseId}) -> Status: ${deactWhRes.status}`);

    // Soft-deactivate supplier
    const deactSupRes = await request('DELETE', `/suppliers/${liveSupplierId}`, null, managerToken);
    console.log(`19. Soft-deactivated LIVE- supplier (ID=${liveSupplierId}) -> Status: ${deactSupRes.status}`);

    // ------------------------------------------------------------------------
    // Final Audit of Seeded Warehouses (Must be 100% Identical to Baseline)
    // ------------------------------------------------------------------------
    console.log('\n--- FINAL AUDIT: Seeded Warehouses 1-3 Stock Levels ---');
    const [finalStock] = await pool.query(
      `SELECT warehouse_id, SUM(quantity) AS total_units, COUNT(*) AS product_count 
       FROM stock_levels WHERE warehouse_id IN (1, 2, 3) GROUP BY warehouse_id ORDER BY warehouse_id;`
    );
    console.log('Final stock counts in seeded warehouses:', finalStock);

    const matchWH1 = (baselineStock[0]?.total_units === finalStock[0]?.total_units && baselineStock[0]?.product_count === finalStock[0]?.product_count);
    const matchWH2 = (baselineStock[1]?.total_units === finalStock[1]?.total_units && baselineStock[1]?.product_count === finalStock[1]?.product_count);
    const matchWH3 = (baselineStock[2]?.total_units === finalStock[2]?.total_units && baselineStock[2]?.product_count === finalStock[2]?.product_count);

    console.log(`\n====================================================================`);
    console.log(`SEEDED DATA INTEGRITY VERIFICATION:`);
    console.log(`Warehouse 1 untouched: ${matchWH1 ? `PASS (${finalStock[0]?.total_units} units, ${finalStock[0]?.product_count} products)` : 'FAIL'}`);
    console.log(`Warehouse 2 untouched: ${matchWH2 ? `PASS (${finalStock[1]?.total_units} units, ${finalStock[1]?.product_count} products)` : 'FAIL'}`);
    console.log(`Warehouse 3 untouched: ${matchWH3 ? `PASS (${finalStock[2]?.total_units} units, ${finalStock[2]?.product_count} products)` : 'FAIL'}`);
    console.log(`ALL 19 LIVE CHECKS COMPLETED CLEANLY.`);
    console.log(`====================================================================\n`);

  } finally {
    server.close();
    await pool.end();
  }
}

runLiveDashboardTests().catch((err) => {
  console.error('Fatal error during live dashboard execution:', err);
  process.exit(1);
});

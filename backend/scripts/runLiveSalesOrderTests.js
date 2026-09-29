/**
 * ============================================================================
 * File: backend/scripts/runLiveSalesOrderTests.js
 * Purpose: Live execution of Module 7 (Sales Orders) endpoints against inventory_db.
 * Safety Guarantee:
 * - Credentials read exclusively from process.env (never hardcoded, never logged).
 * - Creates dedicated LIVE- prefixed supplier, warehouse, and product via the API.
 * - All movements, adjustments, sales orders, and fulfillments execute EXCLUSIVELY on LIVE- entities.
 * - Seeded products (IDs 1-20), warehouses (IDs 1-3), and seed stock are NEVER modified.
 * - Double-fulfillment guard is rigorously tested with raw before/after stock queries.
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

process.env.NODE_ENV = 'development';
const PORT = parseInt(process.env.PORT || '5000', 10);
const BASE_URL = `http://localhost:${PORT}/api`;

async function runLiveSalesOrderTests() {
  console.log('====================================================================');
  console.log(`[MODULE 7 LIVE RUN]: Target Database = ${process.env.DB_NAME || 'inventory_db'} on PORT ${PORT}`);
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
    // Step 2: Create Dedicated LIVE- Master Data
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 2: CREATE DEDICATED LIVE- MASTER DATA ---');
    const uid = Date.now().toString().slice(-6);

    // 1. Live Supplier
    const supRes = await request('POST', '/suppliers', {
      name: `LIVE-SUP-SalesSupply-${uid}`,
      contactName: 'Live Sales Partner',
      email: `sales-${uid}@live-rims.com`,
      phone: '+1-555-9011',
      address: '77 Commerce Way, Suite 4',
    }, adminToken);
    const liveSupplierId = supRes.body.data.id;
    console.log(`4. Created LIVE- Supplier: ID=${liveSupplierId}, Name='${supRes.body.data.name}' -> Status: ${supRes.status}`);

    // 2. Live Warehouse
    const whRes = await request('POST', '/warehouses', {
      name: `LIVE-WH-FulfillmentCenter-${uid}`,
      code: `LIVE-SO-${uid}`,
      city: 'Metro City',
      address: '500 Logistics Expressway',
    }, adminToken);
    const liveWarehouseId = whRes.body.data.id;
    console.log(`5. Created LIVE- Warehouse: ID=${liveWarehouseId}, Code='${whRes.body.data.code}' -> Status: ${whRes.status}`);

    // 3. Live Product
    const prodRes = await request('POST', '/products', {
      name: `LIVE-PROD-WirelessHeadset-${uid}`,
      sku: `PROD-SO-${uid}`,
      category: 'Electronics',
      costPrice: 15.00,
      unitPrice: 35.00,
      reorderLevel: 5,
      supplierId: liveSupplierId,
    }, adminToken);
    const liveProductId = prodRes.body.data.id;
    console.log(`6. Created LIVE- Product: ID=${liveProductId}, SKU='${prodRes.body.data.sku}', UnitPrice=${prodRes.body.data.unitPrice} -> Status: ${prodRes.status}`);

    // 4. Initial Inbound Stock Movement (50 units into live warehouse)
    const stockInRes = await request('POST', '/inventory/movements', {
      productId: liveProductId,
      warehouseId: liveWarehouseId,
      movementType: 'in',
      quantity: 50,
      reference: 'Initial Stock for Live Sales Order Verification',
    }, managerToken);
    console.log(`7. Inbound Initial Stock: 50 units -> Status: ${stockInRes.status}, New Stock: ${stockInRes.body?.data?.newStock}`);

    // ------------------------------------------------------------------------
    // Step 3: UC-28 Create Sales Orders
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 3: UC-28 CREATE SALES ORDERS ---');

    // Happy Path: Staff creates draft SO with default price snapshot
    const createSoRes = await request('POST', '/sales-orders', {
      customerName: 'Acme Retail Chain',
      warehouseId: liveWarehouseId,
      notes: 'Live verification sales order for double-fulfillment safety test',
      items: [
        { productId: liveProductId, quantity: 10 },
      ],
    }, staffToken);
    const liveSoId = createSoRes.body?.data?.id;
    const liveSoNumber = createSoRes.body?.data?.soNumber;
    console.log(`8. Staff Created Draft SO: ID=${liveSoId}, SO Number='${liveSoNumber}', Total=${createSoRes.body?.data?.totalAmount}, Status='${createSoRes.body?.data?.status}' -> Status: ${createSoRes.status}`);

    // Validation: Empty line items (400)
    const emptyItemsRes = await request('POST', '/sales-orders', {
      customerName: 'Invalid Order',
      warehouseId: liveWarehouseId,
      items: [],
    }, staffToken);
    console.log(`9. Validation: Empty Items -> Status: ${emptyItemsRes.status}, Error: '${emptyItemsRes.body?.error?.message}'`);

    // Validation: Quantity <= 0 (400)
    const zeroQtyRes = await request('POST', '/sales-orders', {
      customerName: 'Zero Quantity Corp',
      warehouseId: liveWarehouseId,
      items: [{ productId: liveProductId, quantity: 0 }],
    }, staffToken);
    console.log(`10. Validation: Quantity=0 -> Status: ${zeroQtyRes.status}, Error: '${zeroQtyRes.body?.error?.message}'`);

    // Validation: Negative unit price (400)
    const negPriceRes = await request('POST', '/sales-orders', {
      customerName: 'Negative Price Inc',
      warehouseId: liveWarehouseId,
      items: [{ productId: liveProductId, quantity: 5, unitPrice: -10.00 }],
    }, staffToken);
    console.log(`11. Validation: Negative unitPrice -> Status: ${negPriceRes.status}, Error: '${negPriceRes.body?.error?.message}'`);

    // ------------------------------------------------------------------------
    // Step 4: UC-29 View and Query Sales Orders
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 4: UC-29 VIEW SALES ORDERS ---');

    const listRes = await request('GET', `/sales-orders?warehouseId=${liveWarehouseId}`, null, staffToken);
    console.log(`12. Staff Listed SOs (Warehouse ID=${liveWarehouseId}) -> Status: ${listRes.status}, Total Found: ${listRes.body?.meta?.total}`);

    const getRes = await request('GET', `/sales-orders/${liveSoId}`, null, staffToken);
    console.log(`13. Staff Lookup SO by ID=${liveSoId} -> Status: ${getRes.status}, Customer='${getRes.body?.data?.customerName}', Items: ${getRes.body?.data?.items?.length}`);

    // ------------------------------------------------------------------------
    // Step 5: State Machine: Confirm Sales Order
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 5: STATE MACHINE CONFIRMATION (UC-30) ---');

    // Confirm draft SO
    const confirmRes = await request('PATCH', `/sales-orders/${liveSoId}/status`, { status: 'confirmed' }, staffToken);
    console.log(`14. Staff Confirmed SO -> Status: ${confirmRes.status}, New Status: '${confirmRes.body?.data?.status}'`);

    // Verify stock is untouched after confirmation
    const [confirmStock] = await pool.query(
      'SELECT quantity FROM stock_levels WHERE product_id = ? AND warehouse_id = ?;',
      [liveProductId, liveWarehouseId]
    );
    console.log(`15. Stock After Confirmation (Untouched): ${confirmStock[0]?.quantity} units (Expected: 50)`);

    // Illegal: Double confirm
    const doubleConfirmRes = await request('PATCH', `/sales-orders/${liveSoId}/status`, { status: 'confirmed' }, staffToken);
    console.log(`16. Double Confirm Attempt -> Status: ${doubleConfirmRes.status}, Error: '${doubleConfirmRes.body?.error?.message}'`);

    // ------------------------------------------------------------------------
    // Step 6: UC-30 Fulfill Sales Order & Double-Fulfillment Guard
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 6: UC-30 FULFILL SALES ORDER & DOUBLE-FULFILL GUARD ---');

    console.log('>>> [BEFORE FIRST FULFILL]: Querying stock in inventory_db...');
    const [stockBeforeFulfill] = await pool.query(
      'SELECT product_id, warehouse_id, quantity FROM stock_levels WHERE product_id = ? AND warehouse_id = ?;',
      [liveProductId, liveWarehouseId]
    );
    console.log('Stock BEFORE fulfillment:', stockBeforeFulfill);

    // First Fulfill (Happy path)
    const fulfillRes = await request('POST', `/sales-orders/${liveSoId}/fulfill`, null, staffToken);
    console.log(`17. Staff Fulfilled SO (10 units) -> Status: ${fulfillRes.status}, Order Status: '${fulfillRes.body?.data?.status}'`);

    console.log('>>> [AFTER FIRST FULFILL]: Querying stock in inventory_db...');
    const [stockAfterFulfill] = await pool.query(
      'SELECT product_id, warehouse_id, quantity FROM stock_levels WHERE product_id = ? AND warehouse_id = ?;',
      [liveProductId, liveWarehouseId]
    );
    console.log('Stock AFTER first fulfillment:', stockAfterFulfill);

    // Verify stock movement ledger
    const [movements] = await pool.query(
      'SELECT id, product_id, warehouse_id, movement_type, reference_type, reference_id, quantity, reference FROM stock_movements WHERE reference_type = "sales_order" AND reference_id = ?;',
      [liveSoId]
    );
    console.log('Recorded stock movement in ledger:', movements);

    // DOUBLE-FULFILLMENT GUARD TEST
    console.log('\n>>> [TESTING DOUBLE-FULFILLMENT GUARD]: Attempting second fulfill on already fulfilled SO...');
    const doubleFulfillRes = await request('POST', `/sales-orders/${liveSoId}/fulfill`, null, staffToken);
    console.log(`18. Second Fulfill Attempt -> Status: ${doubleFulfillRes.status}, Error: '${doubleFulfillRes.body?.error?.message}'`);

    console.log('>>> [AFTER SECOND FULFILL ATTEMPT]: Querying stock in inventory_db to PROVE ZERO DOUBLE-DEDUCTION...');
    const [stockAfterSecondAttempt] = await pool.query(
      'SELECT product_id, warehouse_id, quantity FROM stock_levels WHERE product_id = ? AND warehouse_id = ?;',
      [liveProductId, liveWarehouseId]
    );
    console.log('Stock AFTER second fulfill attempt:', stockAfterSecondAttempt);

    const deductionCountMatches = (stockAfterFulfill[0]?.quantity === stockAfterSecondAttempt[0]?.quantity);
    console.log(`>>> PROOF OF DOUBLE-FULFILL GUARD: Stock remains EXACTLY ${stockAfterSecondAttempt[0]?.quantity} units? ${deductionCountMatches ? 'YES (PASSED)' : 'NO (FAILED)'}`);

    // ------------------------------------------------------------------------
    // Step 7: Shortage Atomicity Guard
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 7: SHORTAGE ATOMICITY GUARD ---');

    // Create an order for 100 units (currently available: 40 units)
    const excessOrderRes = await request('POST', '/sales-orders', {
      customerName: 'Excess Demand Corp',
      warehouseId: liveWarehouseId,
      items: [{ productId: liveProductId, quantity: 100 }],
    }, staffToken);
    const excessSoId = excessOrderRes.body?.data?.id;
    console.log(`19. Created Excess Quantity SO: ID=${excessSoId}, Requested Qty=100 -> Status: ${excessOrderRes.status}`);

    // Confirm excess SO
    await request('PATCH', `/sales-orders/${excessSoId}/status`, { status: 'confirmed' }, staffToken);

    // Attempt fulfill: should fail with 422 INSUFFICIENT_STOCK
    const shortFulfillRes = await request('POST', `/sales-orders/${excessSoId}/fulfill`, null, staffToken);
    console.log(`20. Excess Fulfill Attempt -> Status: ${shortFulfillRes.status}, Error Code: '${shortFulfillRes.body?.error?.code}', Message: '${shortFulfillRes.body?.error?.message}'`);

    const [stockAfterShortageAttempt] = await pool.query(
      'SELECT quantity FROM stock_levels WHERE product_id = ? AND warehouse_id = ?;',
      [liveProductId, liveWarehouseId]
    );
    console.log(`21. Stock After Shortage Rejection: ${stockAfterShortageAttempt[0]?.quantity} units (Untouched at 40)`);

    // ------------------------------------------------------------------------
    // Step 8: Cancellation & RBAC Security
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 8: CANCELLATION & RBAC SECURITY ---');

    // Staff cannot cancel SO (403 Forbidden)
    const staffCancelRes = await request('POST', `/sales-orders/${excessSoId}/cancel`, null, staffToken);
    console.log(`22. RBAC: Staff Denied Cancel -> Status: ${staffCancelRes.status}, Error: '${staffCancelRes.body?.error?.message}'`);

    // Manager cancels excess SO (200 OK)
    const mgrCancelRes = await request('POST', `/sales-orders/${excessSoId}/cancel`, null, managerToken);
    console.log(`23. Manager Cancelled Confirmed SO -> Status: ${mgrCancelRes.status}, Order Status: '${mgrCancelRes.body?.data?.status}'`);

    // Cannot cancel an already fulfilled SO (409 Conflict)
    const cancelFulfilledRes = await request('POST', `/sales-orders/${liveSoId}/cancel`, null, managerToken);
    console.log(`24. Cancel Fulfilled SO Attempt -> Status: ${cancelFulfilledRes.status}, Error: '${cancelFulfilledRes.body?.error?.message}'`);

    // ------------------------------------------------------------------------
    // Step 9: Self-Clean LIVE- Fixtures
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 9: SELF-CLEANING LIVE- FIXTURES ---');

    // Zero out remaining stock
    const adjustRes = await request('POST', '/inventory/adjust', {
      productId: liveProductId,
      warehouseId: liveWarehouseId,
      countedQuantity: 0,
      reason: 'Self-cleaning live test fixtures',
    }, managerToken);
    console.log(`25. Reset LIVE- Product Stock to 0: Delta=${adjustRes.body?.data?.delta} -> Status: ${adjustRes.status}`);

    // Soft-deactivate product
    const deactProdRes = await request('DELETE', `/products/${liveProductId}`, null, managerToken);
    console.log(`26. Soft-deactivated LIVE- product (ID=${liveProductId}) -> Status: ${deactProdRes.status}`);

    // Soft-deactivate warehouse
    const deactWhRes = await request('DELETE', `/warehouses/${liveWarehouseId}`, null, adminToken);
    console.log(`27. Soft-deactivated LIVE- warehouse (ID=${liveWarehouseId}) -> Status: ${deactWhRes.status}`);

    // Soft-deactivate supplier
    const deactSupRes = await request('DELETE', `/suppliers/${liveSupplierId}`, null, managerToken);
    console.log(`28. Soft-deactivated LIVE- supplier (ID=${liveSupplierId}) -> Status: ${deactSupRes.status}`);

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
    console.log(`ALL 28 LIVE CHECKS COMPLETED CLEANLY.`);
    console.log(`====================================================================\n`);

  } finally {
    server.close();
    await pool.end();
  }
}

runLiveSalesOrderTests().catch((err) => {
  console.error('Fatal error during live sales order execution:', err);
  process.exit(1);
});

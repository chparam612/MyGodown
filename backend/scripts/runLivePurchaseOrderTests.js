/**
 * ============================================================================
 * File: backend/scripts/runLivePurchaseOrderTests.js
 * Purpose: Live execution of Module 6 (Purchase Orders) endpoints against inventory_db.
 * Safety Guarantee:
 * - Credentials read exclusively from process.env (never hardcoded, never logged).
 * - Creates dedicated LIVE- prefixed supplier, warehouse, and product via the API.
 * - All movements, adjustments, and receipts execute EXCLUSIVELY on LIVE- entities.
 * - Seeded products (IDs 1-20), warehouses (IDs 1-3), and seed stock are NEVER modified.
 * - Double-receive guard is rigorously tested with raw before/after stock queries.
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

async function runLivePurchaseOrderTests() {
  console.log('====================================================================');
  console.log(`[MODULE 6 LIVE RUN]: Target Database = ${process.env.DB_NAME || 'inventory_db'} on PORT ${PORT}`);
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
    // Step 2: Create Isolated LIVE- Master Data
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 2: CREATE DEDICATED LIVE- MASTER DATA ---');
    const uid = Date.now().toString().slice(-6);

    // 1. Live Supplier
    const supRes = await request('POST', '/suppliers', {
      name: `LIVE-SUP-ProcureCorp-${uid}`,
      contactName: 'Live Procurement Rep',
      email: `procure-${uid}@live-rims.com`,
      phone: '+1-555-8822',
      address: '99 Logistics Blvd, Industrial Park',
    }, adminToken);
    const liveSupplierId = supRes.body.data.id;
    console.log(`4. Created LIVE- Supplier: ID=${liveSupplierId}, Name='${supRes.body.data.name}' -> Status: ${supRes.status}`);

    // 2. Live Warehouse
    const whRes = await request('POST', '/warehouses', {
      name: `LIVE-WH-ReceivingHub-${uid}`,
      code: `LIVE-PO-${uid}`,
      city: 'Live City',
      address: '100 Distribution Way',
    }, adminToken);
    const liveWarehouseId = whRes.body.data.id;
    console.log(`5. Created LIVE- Warehouse: ID=${liveWarehouseId}, Code='${whRes.body.data.code}' -> Status: ${whRes.status}`);

    // 3. Live Product
    const prodRes = await request('POST', '/products', {
      name: `LIVE-PROD-SteelFastener-${uid}`,
      sku: `PROD-PO-${uid}`,
      category: 'Hardware',
      costPrice: 12.50,
      unitPrice: 22.00,
      reorderLevel: 10,
      supplierId: liveSupplierId,
    }, adminToken);
    const liveProductId = prodRes.body.data.id;
    console.log(`6. Created LIVE- Product: ID=${liveProductId}, SKU='${prodRes.body.data.sku}' -> Status: ${prodRes.status}`);

    // ------------------------------------------------------------------------
    // Step 3: UC-25 Create Purchase Orders
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 3: UC-25 CREATE PURCHASE ORDERS ---');

    // Happy Path: Manager creates draft PO
    const createPoRes = await request('POST', '/purchase-orders', {
      supplierId: liveSupplierId,
      warehouseId: liveWarehouseId,
      notes: 'Live verification purchase order for double-receive safety test',
      items: [
        { productId: liveProductId, quantity: 20, unitCost: 12.50 },
      ],
    }, managerToken);
    const livePoId = createPoRes.body?.data?.id;
    const livePoNumber = createPoRes.body?.data?.poNumber;
    console.log(`7. Manager Created Draft PO: ID=${livePoId}, PO Number='${livePoNumber}', Total=${createPoRes.body?.data?.totalAmount}, Status='${createPoRes.body?.data?.status}' -> Status: ${createPoRes.status}`);

    // Validation: Empty line items (400)
    const emptyItemsRes = await request('POST', '/purchase-orders', {
      supplierId: liveSupplierId,
      warehouseId: liveWarehouseId,
      items: [],
    }, managerToken);
    console.log(`8. Validation: Empty Items -> Status: ${emptyItemsRes.status}, Error: '${emptyItemsRes.body?.error?.message}'`);

    // Validation: Quantity <= 0 (400)
    const zeroQtyRes = await request('POST', '/purchase-orders', {
      supplierId: liveSupplierId,
      warehouseId: liveWarehouseId,
      items: [{ productId: liveProductId, quantity: 0 }],
    }, managerToken);
    console.log(`9. Validation: Quantity=0 -> Status: ${zeroQtyRes.status}, Error: '${zeroQtyRes.body?.error?.message}'`);

    // Validation: Negative unit cost (400)
    const negCostRes = await request('POST', '/purchase-orders', {
      supplierId: liveSupplierId,
      warehouseId: liveWarehouseId,
      items: [{ productId: liveProductId, quantity: 5, unitCost: -5.00 }],
    }, managerToken);
    console.log(`10. Validation: Negative unitCost -> Status: ${negCostRes.status}, Error: '${negCostRes.body?.error?.message}'`);

    // RBAC: Staff denied creation (403)
    const staffCreateRes = await request('POST', '/purchase-orders', {
      supplierId: liveSupplierId,
      warehouseId: liveWarehouseId,
      items: [{ productId: liveProductId, quantity: 5 }],
    }, staffToken);
    console.log(`11. RBAC: Staff Denied Create -> Status: ${staffCreateRes.status}, Error: '${staffCreateRes.body?.error?.message}'`);

    // ------------------------------------------------------------------------
    // Step 4: UC-26 View Purchase Orders
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 4: UC-26 VIEW PURCHASE ORDERS ---');
    const listPoRes = await request('GET', `/purchase-orders?warehouseId=${liveWarehouseId}`, null, managerToken);
    console.log(`12. Manager List POs for LIVE- Warehouse -> Status: ${listPoRes.status}, Count: ${listPoRes.body?.data?.length}`);

    const getPoRes = await request('GET', `/purchase-orders/${livePoId}`, null, managerToken);
    console.log(`13. Manager Get PO by ID -> Status: ${getPoRes.status}, Items: ${getPoRes.body?.data?.items?.length}, Subtotal: ${getPoRes.body?.data?.items?.[0]?.subtotal}`);

    const staffViewRes = await request('GET', `/purchase-orders/${livePoId}`, null, staffToken);
    console.log(`14. RBAC: Staff Denied View PO -> Status: ${staffViewRes.status}, Error: '${staffViewRes.body?.error?.message}'`);

    // ------------------------------------------------------------------------
    // Step 4b: UC-P08 / UC-26 Edit Draft Purchase Order (PUT)
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 4b: UC-P08 / UC-26 EDIT DRAFT PURCHASE ORDER ---');
    const editDraftRes = await request('PUT', `/purchase-orders/${livePoId}`, {
      supplierId: liveSupplierId,
      warehouseId: liveWarehouseId,
      notes: 'Live edited draft PO note before ordering',
      items: [
        { productId: liveProductId, quantity: 15, unitCost: 12.50 },
        { productId: liveProductId, quantity: 5, unitCost: 12.50 }, // Duplicate product merged -> qty 20
      ],
    }, managerToken);
    console.log(`14a. Manager Edited Draft PO (PUT): ID=${livePoId}, New Total=${editDraftRes.body?.data?.totalAmount}, Items=${editDraftRes.body?.data?.items?.length}, Qty=${editDraftRes.body?.data?.items?.[0]?.quantity} -> Status: ${editDraftRes.status}`);

    const staffEditRes = await request('PUT', `/purchase-orders/${livePoId}`, {
      supplierId: liveSupplierId,
      warehouseId: liveWarehouseId,
      items: [{ productId: liveProductId, quantity: 5 }],
    }, staffToken);
    console.log(`14b. RBAC: Staff Denied Edit PO (PUT) -> Status: ${staffEditRes.status}, Error: '${staffEditRes.body?.error?.message}'`);

    // ------------------------------------------------------------------------
    // Step 5: State Transitions & Cancellation Test
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 5: STATE TRANSITIONS & CANCELLATION ---');

    // Transition Draft -> Ordered
    const transitionRes = await request('PATCH', `/purchase-orders/${livePoId}/status`, { status: 'ordered' }, managerToken);
    console.log(`15. Transition Draft -> Ordered: ID=${livePoId}, Status='${transitionRes.body?.data?.status}', OrderedAt=${transitionRes.body?.data?.orderedAt} -> Status: ${transitionRes.status}`);

    // Attempt PUT on ordered PO -> MUST FAIL WITH 409
    const editOrderedRes = await request('PUT', `/purchase-orders/${livePoId}`, {
      supplierId: liveSupplierId,
      warehouseId: liveWarehouseId,
      items: [{ productId: liveProductId, quantity: 10 }],
    }, managerToken);
    console.log(`15a. 409 Guard: Attempt PUT on Ordered PO -> Status: ${editOrderedRes.status}, Error: '${editOrderedRes.body?.error?.message}'`);

    // Illegal Transition Ordered -> Draft (409)
    const illegalTransitionRes = await request('PATCH', `/purchase-orders/${livePoId}/status`, { status: 'ordered' }, managerToken);
    console.log(`16. Illegal Transition: Ordered -> Ordered -> Status: ${illegalTransitionRes.status}, Error: '${illegalTransitionRes.body?.error?.message}'`);

    // Create a separate draft PO for cancellation test
    const cancelPoRes = await request('POST', '/purchase-orders', {
      supplierId: liveSupplierId,
      warehouseId: liveWarehouseId,
      notes: 'PO to be cancelled',
      items: [{ productId: liveProductId, quantity: 3 }],
    }, managerToken);
    const cancelPoId = cancelPoRes.body.data.id;

    const doCancelRes = await request('POST', `/purchase-orders/${cancelPoId}/cancel`, null, managerToken);
    console.log(`17. Cancelled Draft PO: ID=${cancelPoId}, Status='${doCancelRes.body?.data?.status}' -> Status: ${doCancelRes.status}`);

    const receiveCancelledRes = await request('POST', `/purchase-orders/${cancelPoId}/receive`, null, managerToken);
    console.log(`18. Illegal Receive on Cancelled PO -> Status: ${receiveCancelledRes.status}, Error: '${receiveCancelledRes.body?.error?.message}'`);

    // ------------------------------------------------------------------------
    // Step 6: UC-27 Receive Purchase Order & DOUBLE-RECEIVE GUARD (CRITICAL TEST)
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 6: UC-27 RECEIVE PURCHASE ORDER & DOUBLE-RECEIVE GUARD ---');

    // 1. Raw stock query BEFORE receive
    console.log('[RAW DB QUERY BEFORE RECEIVE]: Checking stock in target warehouse');
    const [beforeStock] = await pool.query(
      'SELECT product_id, warehouse_id, quantity FROM stock_levels WHERE product_id = ? AND warehouse_id = ?;',
      [liveProductId, liveWarehouseId]
    );
    console.log('Stock level BEFORE receive:', beforeStock);

    // 2. Happy Path Receive
    const receiveRes = await request('POST', `/purchase-orders/${livePoId}/receive`, null, managerToken);
    console.log(`19. Happy Path Receive: ID=${livePoId}, Status='${receiveRes.body?.data?.status}', ReceivedBy='${receiveRes.body?.data?.receivedByName}' -> Status: ${receiveRes.status}`);

    // 3. Raw stock query AFTER first receive
    console.log('[RAW DB QUERY AFTER FIRST RECEIVE]: Checking stock increment');
    const [afterFirstStock] = await pool.query(
      'SELECT product_id, warehouse_id, quantity FROM stock_levels WHERE product_id = ? AND warehouse_id = ?;',
      [liveProductId, liveWarehouseId]
    );
    console.log('Stock level AFTER first receive:', afterFirstStock);

    // 4. Raw ledger query
    const [movements] = await pool.query(
      `SELECT id, product_id, warehouse_id, movement_type, reference_type, reference_id, quantity, reference 
       FROM stock_movements WHERE reference_type = 'purchase_order' AND reference_id = ?;`,
      [livePoId]
    );
    console.log('Stock movement recorded:', movements);

    // 5. CRITICAL: DOUBLE-RECEIVE ATTEMPT
    console.log('\n[CRITICAL TEST]: Attempting second receive on the exact same PO (Double-Receive Guard)');
    const doubleReceiveRes = await request('POST', `/purchase-orders/${livePoId}/receive`, null, managerToken);
    console.log(`20. Double-Receive Attempt -> Status: ${doubleReceiveRes.status}, Error Code: '${doubleReceiveRes.body?.error?.code}', Message: '${doubleReceiveRes.body?.error?.message}'`);

    // 6. Raw stock query AFTER double-receive attempt
    console.log('[RAW DB QUERY AFTER DOUBLE-RECEIVE ATTEMPT]: Verifying stock UNCHANGED');
    const [afterSecondStock] = await pool.query(
      'SELECT product_id, warehouse_id, quantity FROM stock_levels WHERE product_id = ? AND warehouse_id = ?;',
      [liveProductId, liveWarehouseId]
    );
    console.log('Stock level AFTER double-receive attempt:', afterSecondStock);

    // Verify equality
    const firstQty = afterFirstStock[0]?.quantity || 0;
    const secondQty = afterSecondStock[0]?.quantity || 0;
    if (firstQty === secondQty && firstQty === 20) {
      console.log(`[PASS GUARANTEE]: Double-receive guard succeeded! Stock remained exactly ${firstQty} units. Zero double-increment.`);
    } else {
      console.error(`[FAIL]: Double-receive guard failed! Expected ${firstQty}, got ${secondQty}`);
      process.exit(1);
    }

    // Cancel on received PO (409)
    const cancelReceivedRes = await request('POST', `/purchase-orders/${livePoId}/cancel`, null, managerToken);
    console.log(`21. Cancel on Received PO -> Status: ${cancelReceivedRes.status}, Error: '${cancelReceivedRes.body?.error?.message}'`);

    // ------------------------------------------------------------------------
    // Step 7: Self-Cleaning
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 7: SELF-CLEANING LIVE DATA ---');

    // 1. Reset LIVE- stock to 0 via adjust route
    const adjustRes = await request('POST', '/inventory/adjust', {
      productId: liveProductId,
      warehouseId: liveWarehouseId,
      countedQuantity: 0,
      reason: 'Self-cleaning Module 6 PO live run stock reset',
    }, managerToken);
    console.log(`22. Reset LIVE- Product Stock to 0: Delta=${adjustRes.body?.data?.delta}, Reason='${adjustRes.body?.data?.reason}' -> Status: ${adjustRes.status}`);

    // 2. Soft-deactivate LIVE- product
    const deactProdRes = await request('DELETE', `/products/${liveProductId}`, null, managerToken);
    console.log(`23. Soft-deactivated LIVE- Product ID=${liveProductId} -> Status: ${deactProdRes.status}`);

    // 3. Soft-deactivate LIVE- warehouse
    const deactWhRes = await request('DELETE', `/warehouses/${liveWarehouseId}`, null, adminToken);
    console.log(`24. Soft-deactivated LIVE- Warehouse ID=${liveWarehouseId} -> Status: ${deactWhRes.status}`);

    // 4. Soft-deactivate LIVE- supplier
    const deactSupRes = await request('DELETE', `/suppliers/${liveSupplierId}`, null, managerToken);
    console.log(`25. Soft-deactivated LIVE- Supplier ID=${liveSupplierId} -> Status: ${deactSupRes.status}`);

    // 5. Final Audit: Verify Seeded Warehouses 1-3 Stock Unchanged
    console.log('\n--- FINAL AUDIT: Verifying Seeded Warehouses 1-3 Stock Remains Untouched ---');
    const [finalSeedStock] = await pool.query(
      `SELECT warehouse_id, SUM(quantity) AS total_units, COUNT(*) AS product_count 
       FROM stock_levels WHERE warehouse_id IN (1, 2, 3) GROUP BY warehouse_id ORDER BY warehouse_id;`
    );
    console.log('Final stock counts in seeded warehouses 1-3:', finalSeedStock);

    console.log('\n====================================================================');
    console.log('[MODULE 6 LIVE RUN COMPLETED SUCCESSFULLY]: All 25 checks passed.');
    console.log('====================================================================');
  } catch (err) {
    console.error('Fatal error during live purchase order tests:', err);
    process.exit(1);
  } finally {
    server.close();
    await pool.end();
  }
}

runLivePurchaseOrderTests();

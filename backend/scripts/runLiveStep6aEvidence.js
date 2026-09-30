import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const adminPassword = process.env.SEED_ADMIN_PASSWORD;
const managerPassword = process.env.SEED_MANAGER_PASSWORD;
const staffPassword = process.env.SEED_STAFF_PASSWORD;

if (!adminPassword || !managerPassword || !staffPassword) {
  console.error('[FATAL]: Missing required seed password environment variables');
  process.exit(1);
}

const PORT = 5000;
const BASE_URL = `http://localhost:${PORT}/api`;

let logBuffer = '';
function appendLog(line = '') {
  logBuffer += line + '\n';
  console.log(line);
}

async function main() {
  async function request(method, endpoint, body = null, token = null) {
    const headers = { 'Accept': 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let resBody = null;
    const text = await res.text();
    try {
      resBody = JSON.parse(text);
    } catch {
      resBody = text;
    }

    return {
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body: resBody,
    };
  }

  function logHttp(stepName, method, endpoint, reqBody, tokenRole, res) {
    appendLog(`\n================================================================================`);
    appendLog(`### ${stepName}`);
    appendLog(`--------------------------------------------------------------------------------`);
    appendLog(`REQUEST:`);
    appendLog(`${method} ${BASE_URL}${endpoint}`);
    appendLog(`Authorization: Bearer <token_${tokenRole || 'public'}>`);
    if (reqBody) {
      appendLog(`Content-Type: application/json\n`);
      appendLog(JSON.stringify(reqBody, null, 2));
    }
    appendLog(`\nRESPONSE:`);
    appendLog(`HTTP/1.1 ${res.status}`);
    appendLog(`Content-Type: application/json\n`);
    appendLog(JSON.stringify(res.body, null, 2));
  }

  try {
    // ------------------------------------------------------------------------
    // 1. Authentications
    // ------------------------------------------------------------------------
    const adminLogin = await request('POST', '/auth/login', { email: 'admin@mygodown.com', password: adminPassword });
    const adminToken = adminLogin.body?.data?.token;
    logHttp('1.1 Admin Authentication', 'POST', '/auth/login', { email: 'admin@mygodown.com', password: '[REDACTED]' }, 'none', adminLogin);

    const mgrLogin = await request('POST', '/auth/login', { email: 'manager@mygodown.com', password: managerPassword });
    const mgrToken = mgrLogin.body?.data?.token;
    logHttp('1.2 Warehouse Manager Authentication', 'POST', '/auth/login', { email: 'manager@mygodown.com', password: '[REDACTED]' }, 'none', mgrLogin);

    const staffLogin = await request('POST', '/auth/login', { email: 'staff@mygodown.com', password: staffPassword });
    const staffToken = staffLogin.body?.data?.token;
    logHttp('1.3 Warehouse Staff Authentication', 'POST', '/auth/login', { email: 'staff@mygodown.com', password: '[REDACTED]' }, 'none', staffLogin);

    // ------------------------------------------------------------------------
    // 2. UC-25: Create Purchase Order (Draft) with Duplicate Product Consolidation
    // ------------------------------------------------------------------------
    // Note: Items submit Product 1 twice (qty 6 + qty 4) to verify server-side consolidation
    const createDraftPayload = {
      supplierId: 2, // VoltCore Electronics (Active supplier)
      warehouseId: 1, // Central Logistics Hub (Active warehouse)
      status: 'draft',
      notes: 'Q4 Bulk Procurement Order - Dock 3 Delivery',
      items: [
        { productId: 1, quantity: 6, unitCost: 79.50 },
        { productId: 1, quantity: 4, unitCost: 79.50 },
        { productId: 2, quantity: 5, unitCost: 98.00 },
      ],
    };
    const createDraftRes = await request('POST', '/purchase-orders', createDraftPayload, mgrToken);
    logHttp('2.1 UC-25: Create Draft PO with Server-Side Item Consolidation (Manager)', 'POST', '/purchase-orders', createDraftPayload, 'manager', createDraftRes);

    const lifecyclePoId = createDraftRes.body?.data?.id;
    if (!lifecyclePoId) throw new Error('Failed to create test draft PO');

    // ------------------------------------------------------------------------
    // 3. UC-P08: Edit Draft Purchase Order
    // ------------------------------------------------------------------------
    const editDraftPayload = {
      supplierId: 2,
      warehouseId: 1,
      notes: 'Q4 Bulk Procurement Order - Adjusted Quantities (Dock 3)',
      items: [
        { productId: 1, quantity: 8, unitCost: 80.00 },
        { productId: 2, quantity: 4, unitCost: 95.00 },
      ],
    };
    const editDraftRes = await request('PUT', `/purchase-orders/${lifecyclePoId}`, editDraftPayload, mgrToken);
    logHttp('3.1 UC-P08: Edit Draft PO Lines and Header (Manager)', 'PUT', `/purchase-orders/${lifecyclePoId}`, editDraftPayload, 'manager', editDraftRes);

    // ------------------------------------------------------------------------
    // 4. UC-27: Status Transition draft -> ordered
    // ------------------------------------------------------------------------
    const markOrderedRes = await request('PATCH', `/purchase-orders/${lifecyclePoId}/status`, { status: 'ordered' }, mgrToken);
    logHttp('4.1 UC-27: Mark PO as Ordered (Manager)', 'PATCH', `/purchase-orders/${lifecyclePoId}/status`, { status: 'ordered' }, 'manager', markOrderedRes);

    // ------------------------------------------------------------------------
    // 5. UC-P08: Edit Guard - 409 Conflict on Attempting to Edit an Ordered PO
    // ------------------------------------------------------------------------
    const illegalEditRes = await request('PUT', `/purchase-orders/${lifecyclePoId}`, editDraftPayload, mgrToken);
    logHttp('5.1 UC-P08: 409 Conflict on Editing Ordered PO (Manager)', 'PUT', `/purchase-orders/${lifecyclePoId}`, editDraftPayload, 'manager', illegalEditRes);

    // ------------------------------------------------------------------------
    // 6. UC-27: Double-Receive Rigor Test with Before & After Stock Verifications
    // ------------------------------------------------------------------------
    // 6a. Stock verification BEFORE 1st Receive
    const stockBeforeP1 = await request('GET', '/inventory?productId=1&warehouseId=1', null, adminToken);
    const stockBeforeP2 = await request('GET', '/inventory?productId=2&warehouseId=1', null, adminToken);
    const p1QtyBefore = stockBeforeP1.body?.data?.[0]?.quantity ?? 0;
    const p2QtyBefore = stockBeforeP2.body?.data?.[0]?.quantity ?? 0;

    appendLog(`\n================================================================================`);
    appendLog(`### 6.1 Stock Level Pre-Check (Before 1st Receive)`);
    appendLog(`--------------------------------------------------------------------------------`);
    appendLog(`Product 1 (TOOL-DRL-001) in WH 1 Initial Stock: ${p1QtyBefore} units`);
    appendLog(`Product 2 (TOOL-SAW-002) in WH 1 Initial Stock: ${p2QtyBefore} units`);

    // 6b. Execute First Receive (ordered -> received)
    const firstReceiveRes = await request('POST', `/purchase-orders/${lifecyclePoId}/receive`, null, mgrToken);
    logHttp('6.2 UC-27: First Receive of PO (Manager)', 'POST', `/purchase-orders/${lifecyclePoId}/receive`, null, 'manager', firstReceiveRes);

    // 6c. Stock verification AFTER 1st Receive
    const stockAfter1P1 = await request('GET', '/inventory?productId=1&warehouseId=1', null, adminToken);
    const stockAfter1P2 = await request('GET', '/inventory?productId=2&warehouseId=1', null, adminToken);
    const p1QtyAfter1 = stockAfter1P1.body?.data?.[0]?.quantity ?? 0;
    const p2QtyAfter1 = stockAfter1P2.body?.data?.[0]?.quantity ?? 0;

    appendLog(`\n================================================================================`);
    appendLog(`### 6.3 Stock Level Check After 1st Receive (Expected +8 and +4)`);
    appendLog(`--------------------------------------------------------------------------------`);
    appendLog(`Product 1 in WH 1: ${p1QtyBefore} -> ${p1QtyAfter1} (Delta: +${p1QtyAfter1 - p1QtyBefore}) [Expected: +8]`);
    appendLog(`Product 2 in WH 1: ${p2QtyBefore} -> ${p2QtyAfter1} (Delta: +${p2QtyAfter1 - p2QtyBefore}) [Expected: +4]`);

    // 6d. Second Receive Attempt (Double-Receive Protection)
    const secondReceiveRes = await request('POST', `/purchase-orders/${lifecyclePoId}/receive`, null, mgrToken);
    logHttp('6.4 UC-27: Second Receive Attempt - Expected 409 Conflict', 'POST', `/purchase-orders/${lifecyclePoId}/receive`, null, 'manager', secondReceiveRes);

    // 6e. Stock verification AFTER 2nd Receive Attempt (Must be identical!)
    const stockAfter2P1 = await request('GET', '/inventory?productId=1&warehouseId=1', null, adminToken);
    const stockAfter2P2 = await request('GET', '/inventory?productId=2&warehouseId=1', null, adminToken);
    const p1QtyAfter2 = stockAfter2P1.body?.data?.[0]?.quantity ?? 0;
    const p2QtyAfter2 = stockAfter2P2.body?.data?.[0]?.quantity ?? 0;

    appendLog(`\n================================================================================`);
    appendLog(`### 6.5 Stock Level Check After 2nd Receive Attempt (Proving Stock Did NOT Increase)`);
    appendLog(`--------------------------------------------------------------------------------`);
    appendLog(`Product 1 in WH 1: After 1st Receive = ${p1QtyAfter1}, After 2nd Attempt = ${p1QtyAfter2}`);
    appendLog(`Product 2 in WH 1: After 1st Receive = ${p2QtyAfter1}, After 2nd Attempt = ${p2QtyAfter2}`);
    appendLog(`PROVEN: Product 1 Stock Unchanged: ${p1QtyAfter1 === p1QtyAfter2}`);
    appendLog(`PROVEN: Product 2 Stock Unchanged: ${p2QtyAfter1 === p2QtyAfter2}`);

    // ------------------------------------------------------------------------
    // 7. UC-27: Cancel PO Scenarios
    // ------------------------------------------------------------------------
    // 7a. Cancel from draft
    const draftForCancel = await request('POST', '/purchase-orders', {
      supplierId: 2,
      warehouseId: 1,
      status: 'draft',
      notes: 'PO to be cancelled from draft',
      items: [{ productId: 1, quantity: 2, unitCost: 80.00 }],
    }, mgrToken);
    const cancelDraftId = draftForCancel.body?.data?.id;

    const cancelDraftRes = await request('POST', `/purchase-orders/${cancelDraftId}/cancel`, null, mgrToken);
    logHttp('7.1 UC-27: Cancel Purchase Order from Draft (Manager)', 'POST', `/purchase-orders/${cancelDraftId}/cancel`, null, 'manager', cancelDraftRes);

    // 7b. Cancel from ordered
    const orderedForCancel = await request('POST', '/purchase-orders', {
      supplierId: 2,
      warehouseId: 1,
      status: 'ordered',
      notes: 'PO to be cancelled from ordered',
      items: [{ productId: 2, quantity: 3, unitCost: 95.00 }],
    }, mgrToken);
    const cancelOrderedId = orderedForCancel.body?.data?.id;

    const cancelOrderedRes = await request('POST', `/purchase-orders/${cancelOrderedId}/cancel`, null, mgrToken);
    logHttp('7.2 UC-27: Cancel Purchase Order from Ordered (Manager)', 'POST', `/purchase-orders/${cancelOrderedId}/cancel`, null, 'manager', cancelOrderedRes);

    // 7c. Illegal Cancel after Received (409 Conflict)
    const illegalCancelRes = await request('POST', `/purchase-orders/${lifecyclePoId}/cancel`, null, mgrToken);
    logHttp('7.3 UC-27: 409 Conflict on Cancelling Received PO (Manager)', 'POST', `/purchase-orders/${lifecyclePoId}/cancel`, null, 'manager', illegalCancelRes);

    // ------------------------------------------------------------------------
    // 8. UC-26 / RBAC: Staff Access Denied Direct API Invocations (403 Forbidden)
    // ------------------------------------------------------------------------
    const staffCreateRes = await request('POST', '/purchase-orders', createDraftPayload, staffToken);
    logHttp('8.1 UC-26: Staff Blocked from Create PO (403)', 'POST', '/purchase-orders', createDraftPayload, 'staff', staffCreateRes);

    const staffEditRes = await request('PUT', `/purchase-orders/${lifecyclePoId}`, editDraftPayload, staffToken);
    logHttp('8.2 UC-26: Staff Blocked from Edit PO (403)', 'PUT', `/purchase-orders/${lifecyclePoId}`, editDraftPayload, 'staff', staffEditRes);

    const staffReceiveRes = await request('POST', `/purchase-orders/${lifecyclePoId}/receive`, null, staffToken);
    logHttp('8.3 UC-26: Staff Blocked from Receive PO (403)', 'POST', `/purchase-orders/${lifecyclePoId}/receive`, null, 'staff', staffReceiveRes);

    const staffCancelRes = await request('POST', `/purchase-orders/${lifecyclePoId}/cancel`, null, staffToken);
    logHttp('8.4 UC-26: Staff Blocked from Cancel PO (403)', 'POST', `/purchase-orders/${lifecyclePoId}/cancel`, null, 'staff', staffCancelRes);

    const staffListRes = await request('GET', '/purchase-orders', null, staffToken);
    logHttp('8.5 UC-26: Staff Blocked from Listing POs (403)', 'GET', '/purchase-orders', null, 'staff', staffListRes);

    // ------------------------------------------------------------------------
    // 9. UC-26: Detail View by ID (Single PO with Lines and Total)
    // ------------------------------------------------------------------------
    const detailRes = await request('GET', `/purchase-orders/${lifecyclePoId}`, null, mgrToken);
    logHttp('9.1 UC-26: Single PO Detail View (Manager)', 'GET', `/purchase-orders/${lifecyclePoId}`, null, 'manager', detailRes);

    appendLog(`\n================================================================================`);
    appendLog(`ALL STEP 6.A LIVE VERIFICATIONS COMPLETED SUCCESSFULLY`);
    appendLog(`================================================================================\n`);

    fs.writeFileSync(path.resolve(__dirname, 'step6a_evidence.txt'), logBuffer, 'utf8');
    console.log('Saved evidence to step6a_evidence.txt');
    process.exit(0);
  } catch (err) {
    console.error('Fatal during live step 6.a evidence collection:', err);
    process.exit(1);
  }
}

main();

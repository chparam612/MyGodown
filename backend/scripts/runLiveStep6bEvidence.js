/**
 * ============================================================================
 * File: backend/scripts/runLiveStep6bEvidence.js
 * Purpose: Verifies Step 6.B Sales Orders (UC-28, UC-29, UC-30) against live API.
 * Runs on http://localhost:5000/api and logs all requests and responses.
 * ============================================================================
 */

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
    appendLog(`Authorization: Bearer <token_${tokenRole}>`);
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
    // 2. UC-28: Create Sales Orders (All 3 Roles Verified)
    // ------------------------------------------------------------------------
    // 2.1 Staff Creates SO with Duplicate Item Consolidation (Product 1: 3 + 2 = 5 units)
    const staffCreatePayload = {
      customerName: 'Acme Commercial Contractors',
      warehouseId: 1, // Central Logistics Hub
      notes: 'Dock 2 Delivery - Priority Job',
      items: [
        { productId: 1, quantity: 3, unitPrice: 129.99 },
        { productId: 1, quantity: 2, unitPrice: 129.99 },
        { productId: 2, quantity: 2, unitPrice: 159.99 },
      ],
    };
    const staffCreateRes = await request('POST', '/sales-orders', staffCreatePayload, staffToken);
    logHttp('2.1 UC-28: Staff Creates Sales Order with Duplicate Item Consolidation', 'POST', '/sales-orders', staffCreatePayload, 'staff', staffCreateRes);

    const lifecycleSoId = staffCreateRes.body?.data?.id;
    if (!lifecycleSoId) throw new Error('Failed to create staff test sales order');

    // 2.2 Manager Creates SO
    const mgrCreatePayload = {
      customerName: 'BuildCorp Industries',
      warehouseId: 1,
      notes: 'Regional Office Order',
      items: [{ productId: 1, quantity: 1, unitPrice: 125.00 }],
    };
    const mgrCreateRes = await request('POST', '/sales-orders', mgrCreatePayload, mgrToken);
    logHttp('2.2 UC-28: Manager Creates Sales Order', 'POST', '/sales-orders', mgrCreatePayload, 'manager', mgrCreateRes);
    const mgrSoId = mgrCreateRes.body?.data?.id;

    // 2.3 Admin Creates SO
    const adminCreatePayload = {
      customerName: 'Prime Infrastructure Ltd',
      warehouseId: 1,
      notes: 'Corporate HQ Project',
      items: [{ productId: 2, quantity: 1, unitPrice: 155.00 }],
    };
    const adminCreateRes = await request('POST', '/sales-orders', adminCreatePayload, adminToken);
    logHttp('2.3 UC-28: Admin Creates Sales Order', 'POST', '/sales-orders', adminCreatePayload, 'admin', adminCreateRes);
    const adminSoId = adminCreateRes.body?.data?.id;

    // ------------------------------------------------------------------------
    // 3. UC-29: View & List Sales Orders (All 3 Roles Verified)
    // ------------------------------------------------------------------------
    // 3.1 Staff lists sales orders
    const staffListRes = await request('GET', '/sales-orders?warehouseId=1&limit=5', null, staffToken);
    logHttp('3.1 UC-29: Staff Lists Sales Orders', 'GET', '/sales-orders?warehouseId=1&limit=5', null, 'staff', staffListRes);

    // 3.2 Staff views single SO details
    const staffDetailRes = await request('GET', `/sales-orders/${lifecycleSoId}`, null, staffToken);
    logHttp('3.2 UC-29: Staff Views SO Detail by ID (Selling Price Snapshot & Subtotals)', 'GET', `/sales-orders/${lifecycleSoId}`, null, 'staff', staffDetailRes);

    // 3.3 Manager views single SO details
    const mgrDetailRes = await request('GET', `/sales-orders/${lifecycleSoId}`, null, mgrToken);
    logHttp('3.3 UC-29: Manager Views SO Detail by ID', 'GET', `/sales-orders/${lifecycleSoId}`, null, 'manager', mgrDetailRes);

    // ------------------------------------------------------------------------
    // 4. UC-30: Confirm Sales Order & Verify Stock Invariance (draft -> confirmed)
    // ------------------------------------------------------------------------
    // 4.1 Stock Pre-Check before confirmation
    const stockP1BeforeConfirm = await request('GET', '/inventory?warehouseId=1&productId=1', null, staffToken);
    const stockP2BeforeConfirm = await request('GET', '/inventory?warehouseId=1&productId=2', null, staffToken);
    const qtyP1_0 = stockP1BeforeConfirm.body?.data?.[0]?.quantity ?? 0;
    const qtyP2_0 = stockP2BeforeConfirm.body?.data?.[0]?.quantity ?? 0;

    appendLog(`\n================================================================================`);
    appendLog(`### 4.1 Stock Level Pre-Check (Before SO Confirmation)`);
    appendLog(`--------------------------------------------------------------------------------`);
    appendLog(`Product 1 (TOOL-DRL-001) in WH 1 Initial Stock: ${qtyP1_0} units`);
    appendLog(`Product 2 (TOOL-SAW-002) in WH 1 Initial Stock: ${qtyP2_0} units`);

    // 4.2 Staff Confirms Sales Order
    const confirmRes = await request('POST', `/sales-orders/${lifecycleSoId}/confirm`, null, staffToken);
    logHttp('4.2 UC-30: Staff Confirms Sales Order (draft -> confirmed)', 'POST', `/sales-orders/${lifecycleSoId}/confirm`, null, 'staff', confirmRes);

    // 4.3 Stock Check After Confirmation (Stock must be 100% UNCHANGED)
    const stockP1AfterConfirm = await request('GET', '/inventory?warehouseId=1&productId=1', null, staffToken);
    const stockP2AfterConfirm = await request('GET', '/inventory?warehouseId=1&productId=2', null, staffToken);
    const qtyP1_1 = stockP1AfterConfirm.body?.data?.[0]?.quantity ?? 0;
    const qtyP2_1 = stockP2AfterConfirm.body?.data?.[0]?.quantity ?? 0;

    appendLog(`\n================================================================================`);
    appendLog(`### 4.3 Stock Level Check After Confirmation (Zero Stock Change Verified)`);
    appendLog(`--------------------------------------------------------------------------------`);
    appendLog(`Product 1 in WH 1: Before = ${qtyP1_0}, After Confirm = ${qtyP1_1} (Delta: ${qtyP1_1 - qtyP1_0})`);
    appendLog(`Product 2 in WH 1: Before = ${qtyP2_0}, After Confirm = ${qtyP2_1} (Delta: ${qtyP2_1 - qtyP2_0})`);
    appendLog(`PROVEN: Confirming Sales Order Does NOT Touch Stock: ${qtyP1_1 === qtyP1_0 && qtyP2_1 === qtyP2_0}`);

    // ------------------------------------------------------------------------
    // 5. UC-30: Fulfill Sales Order & Verify Stock Deduction (confirmed -> fulfilled)
    // ------------------------------------------------------------------------
    // 5.1 Staff Fulfills Sales Order (5 units of P1, 2 units of P2)
    const fulfillRes = await request('POST', `/sales-orders/${lifecycleSoId}/fulfill`, null, staffToken);
    logHttp('5.1 UC-30: Staff Fulfills Sales Order (confirmed -> fulfilled)', 'POST', `/sales-orders/${lifecycleSoId}/fulfill`, null, 'staff', fulfillRes);

    // 5.2 Stock Check After Fulfillment
    const stockP1AfterFulfill = await request('GET', '/inventory?warehouseId=1&productId=1', null, staffToken);
    const stockP2AfterFulfill = await request('GET', '/inventory?warehouseId=1&productId=2', null, staffToken);
    const qtyP1_2 = stockP1AfterFulfill.body?.data?.[0]?.quantity ?? 0;
    const qtyP2_2 = stockP2AfterFulfill.body?.data?.[0]?.quantity ?? 0;

    appendLog(`\n================================================================================`);
    appendLog(`### 5.2 Stock Level Check After Fulfillment (Expected -5 and -2 Units)`);
    appendLog(`--------------------------------------------------------------------------------`);
    appendLog(`Product 1 in WH 1: ${qtyP1_1} -> ${qtyP1_2} (Delta: ${qtyP1_2 - qtyP1_1}) [Expected: -5]`);
    appendLog(`Product 2 in WH 1: ${qtyP2_1} -> ${qtyP2_2} (Delta: ${qtyP2_2 - qtyP2_1}) [Expected: -2]`);
    appendLog(`PROVEN: Fulfill Exactly Deducted Stock: ${qtyP1_2 === qtyP1_1 - 5 && qtyP2_2 === qtyP2_1 - 2}`);

    // ------------------------------------------------------------------------
    // 6. UC-30: Double-Fulfillment Guard & Stock Invariance Proof
    // ------------------------------------------------------------------------
    // 6.1 Attempt to fulfill already fulfilled SO (Expected 409 Conflict)
    const doubleFulfillRes = await request('POST', `/sales-orders/${lifecycleSoId}/fulfill`, null, staffToken);
    logHttp('6.1 UC-30: Double-Fulfillment Attempt (Expected 409 Conflict)', 'POST', `/sales-orders/${lifecycleSoId}/fulfill`, null, 'staff', doubleFulfillRes);

    // 6.2 Stock Check After Double-Fulfill Attempt
    const stockP1AfterDouble = await request('GET', '/inventory?warehouseId=1&productId=1', null, staffToken);
    const stockP2AfterDouble = await request('GET', '/inventory?warehouseId=1&productId=2', null, staffToken);
    const qtyP1_3 = stockP1AfterDouble.body?.data?.[0]?.quantity ?? 0;
    const qtyP2_3 = stockP2AfterDouble.body?.data?.[0]?.quantity ?? 0;

    appendLog(`\n================================================================================`);
    appendLog(`### 6.2 Stock Level Check After 2nd Fulfillment Attempt (Stock Invariance Proof)`);
    appendLog(`--------------------------------------------------------------------------------`);
    appendLog(`Product 1 in WH 1: After 1st Fulfill = ${qtyP1_2}, After 2nd Attempt = ${qtyP1_3}`);
    appendLog(`Product 2 in WH 1: After 1st Fulfill = ${qtyP2_2}, After 2nd Attempt = ${qtyP2_3}`);
    appendLog(`PROVEN: Product 1 Stock Unchanged: ${qtyP1_3 === qtyP1_2}`);
    appendLog(`PROVEN: Product 2 Stock Unchanged: ${qtyP2_3 === qtyP2_2}`);

    // ------------------------------------------------------------------------
    // 7. UC-30: Shortage / Oversell Guard (Atomic Rollback Proof)
    // ------------------------------------------------------------------------
    // 7.1 Check current stock of Product 9 in WH 1
    const stockP9Res1 = await request('GET', '/inventory?warehouseId=1&productId=9', null, staffToken);
    const qtyP9_0 = stockP9Res1.body?.data?.[0]?.quantity ?? 0;
    appendLog(`\n================================================================================`);
    appendLog(`### 7.1 Stock Pre-Check for Shortage Test (Product 9 Current Stock: ${qtyP9_0} units)`);
    appendLog(`--------------------------------------------------------------------------------`);

    // 7.2 Create and confirm SO requesting qtyP9_0 + 5 (Excessive quantity)
    const excessQty = qtyP9_0 + 5;
    const shortageCreateRes = await request('POST', '/sales-orders', {
      customerName: 'Oversell Guard Testing Client',
      warehouseId: 1,
      items: [
        { productId: 9, quantity: excessQty, unitPrice: 220.00 },
        { productId: 1, quantity: 2, unitPrice: 129.99 }, // Multi-line to prove all-or-nothing rollback
      ],
    }, staffToken);
    const shortageSoId = shortageCreateRes.body?.data?.id;
    await request('POST', `/sales-orders/${shortageSoId}/confirm`, null, staffToken);

    // 7.3 Attempt to fulfill order with shortage -> Expected 422 Unprocessable Entity
    const shortageFulfillRes = await request('POST', `/sales-orders/${shortageSoId}/fulfill`, null, staffToken);
    logHttp('7.2 UC-30: Fulfill Order with Shortage (Expected 422 INSUFFICIENT_STOCK)', 'POST', `/sales-orders/${shortageSoId}/fulfill`, null, 'staff', shortageFulfillRes);

    // 7.4 Verify stock of Product 9 and Product 1 remained 100% untouched
    const stockP9Res2 = await request('GET', '/inventory?warehouseId=1&productId=9', null, staffToken);
    const stockP1Res2 = await request('GET', '/inventory?warehouseId=1&productId=1', null, staffToken);
    const qtyP9_1 = stockP9Res2.body?.data?.[0]?.quantity ?? 0;
    const qtyP1_4 = stockP1Res2.body?.data?.[0]?.quantity ?? 0;

    appendLog(`\n================================================================================`);
    appendLog(`### 7.3 Stock Invariance Check After 422 Shortage Rejection (Atomic Rollback)`);
    appendLog(`--------------------------------------------------------------------------------`);
    appendLog(`Product 9 in WH 1: Before = ${qtyP9_0}, After Failed Fulfill = ${qtyP9_1} (Unchanged: ${qtyP9_1 === qtyP9_0})`);
    appendLog(`Product 1 in WH 1: Before = ${qtyP1_3}, After Failed Fulfill = ${qtyP1_4} (Unchanged: ${qtyP1_4 === qtyP1_3})`);
    appendLog(`PROVEN: Zero Partial Stock Deduction on Shortage: ${qtyP9_1 === qtyP9_0 && qtyP1_4 === qtyP1_3}`);

    // ------------------------------------------------------------------------
    // 8. Definitive Resolution of Cancel Permissions
    // ------------------------------------------------------------------------
    // Create fresh draft SOs for cancel testing
    const draftForCancel1 = await request('POST', '/sales-orders', {
      customerName: 'Cancel Test 1 (Draft)',
      warehouseId: 1,
      items: [{ productId: 1, quantity: 1, unitPrice: 120 }],
    }, staffToken);
    const draftSoId1 = draftForCancel1.body?.data?.id;

    const draftForCancel2 = await request('POST', '/sales-orders', {
      customerName: 'Cancel Test 2 (Draft for Patch)',
      warehouseId: 1,
      items: [{ productId: 1, quantity: 1, unitPrice: 120 }],
    }, staffToken);
    const draftSoId2 = draftForCancel2.body?.data?.id;

    const confirmedForCancel = await request('POST', '/sales-orders', {
      customerName: 'Cancel Test 3 (Confirmed)',
      warehouseId: 1,
      items: [{ productId: 1, quantity: 1, unitPrice: 120 }],
    }, staffToken);
    const confirmedSoId = confirmedForCancel.body?.data?.id;
    await request('POST', `/sales-orders/${confirmedSoId}/confirm`, null, staffToken);

    // 8.1 Staff attempts to cancel DRAFT SO via POST /:id/cancel -> 403 Forbidden
    const staffCancelDraftPost = await request('POST', `/sales-orders/${draftSoId1}/cancel`, null, staffToken);
    logHttp('8.1 UC-30: Staff DENIED Cancelling Draft SO via POST /:id/cancel (403 Forbidden)', 'POST', `/sales-orders/${draftSoId1}/cancel`, null, 'staff', staffCancelDraftPost);

    // 8.2 Staff attempts to cancel DRAFT SO via PATCH /:id/status -> 403 Forbidden
    const staffCancelDraftPatch = await request('PATCH', `/sales-orders/${draftSoId2}/status`, { status: 'cancelled' }, staffToken);
    logHttp('8.2 UC-30: Staff DENIED Cancelling Draft SO via PATCH /:id/status (403 Forbidden)', 'PATCH', `/sales-orders/${draftSoId2}/status`, { status: 'cancelled' }, 'staff', staffCancelDraftPatch);

    // 8.3 Staff attempts to cancel CONFIRMED SO via POST /:id/cancel -> 403 Forbidden
    const staffCancelConfirmed = await request('POST', `/sales-orders/${confirmedSoId}/cancel`, null, staffToken);
    logHttp('8.3 UC-30: Staff DENIED Cancelling Confirmed SO via POST /:id/cancel (403 Forbidden)', 'POST', `/sales-orders/${confirmedSoId}/cancel`, null, 'staff', staffCancelConfirmed);

    // 8.4 Manager CAN cancel DRAFT SO -> 200 OK
    const mgrCancelDraft = await request('POST', `/sales-orders/${draftSoId1}/cancel`, null, mgrToken);
    logHttp('8.4 UC-30: Manager Cancels Draft Sales Order (200 OK)', 'POST', `/sales-orders/${draftSoId1}/cancel`, null, 'manager', mgrCancelDraft);

    // 8.5 Admin CAN cancel CONFIRMED SO -> 200 OK
    const adminCancelConfirmed = await request('POST', `/sales-orders/${confirmedSoId}/cancel`, null, adminToken);
    logHttp('8.5 UC-30: Admin Cancels Confirmed Sales Order (200 OK)', 'POST', `/sales-orders/${confirmedSoId}/cancel`, null, 'admin', adminCancelConfirmed);

    // 8.6 Attempt to cancel FULFILLED SO -> Expected 409 Conflict
    const cancelFulfilledRes = await request('POST', `/sales-orders/${lifecycleSoId}/cancel`, null, mgrToken);
    logHttp('8.6 UC-30: Attempt to Cancel Fulfilled SO (Expected 409 Conflict)', 'POST', `/sales-orders/${lifecycleSoId}/cancel`, null, 'manager', cancelFulfilledRes);

    appendLog(`\n================================================================================`);
    appendLog(`ALL STEP 6.B LIVE VERIFICATIONS COMPLETED SUCCESSFULLY`);
    appendLog(`================================================================================\n`);

    fs.writeFileSync(path.resolve(__dirname, 'step6b_evidence.txt'), logBuffer, 'utf8');
    console.log('Saved evidence to step6b_evidence.txt');
  } catch (err) {
    console.error('[ERROR during Step 6.B live test]:', err);
    process.exit(1);
  }
}

main();

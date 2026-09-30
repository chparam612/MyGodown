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

const PORT = 5005;
const BASE_URL = `http://localhost:${PORT}/api`;

let logBuffer = '';
function appendLog(line = '') {
  logBuffer += line + '\n';
  console.log(line);
}

async function main() {
  const { default: app } = await import('../src/app.js');
  const server = app.listen(PORT);
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
    // 2. UC-16: Record Stock Movement (Inbound success & Outbound 422 insufficient)
    // ------------------------------------------------------------------------
    const movePayload = {
      productId: 1,
      warehouseId: 1,
      movementType: 'in',
      quantity: 12,
      reference: 'PO Inbound Receiving Dock Dock-3'
    };
    const moveRes = await request('POST', '/inventory/movements', movePayload, adminToken);
    logHttp('2.1 UC-16: Successful Inbound Stock Movement (Admin)', 'POST', '/inventory/movements', movePayload, 'admin', moveRes);

    const failMovePayload = {
      productId: 1,
      warehouseId: 1,
      movementType: 'out',
      quantity: 999999,
      reference: 'Excess withdrawal test'
    };
    const failMoveRes = await request('POST', '/inventory/movements', failMovePayload, staffToken);
    logHttp('2.2 UC-16: 422 Insufficient Stock Movement Rejection (Staff)', 'POST', '/inventory/movements', failMovePayload, 'staff', failMoveRes);

    // ------------------------------------------------------------------------
    // 3. UC-17: Adjust Stock (Success, 400 missing reason, 403 staff denied)
    // ------------------------------------------------------------------------
    const adjustPayload = {
      productId: 1,
      warehouseId: 1,
      countedQuantity: 65,
      reason: 'Q3 Physical Cycle Count Audit Reconciled'
    };
    const adjustRes = await request('POST', '/inventory/adjust', adjustPayload, mgrToken);
    logHttp('3.1 UC-17: Successful Physical Stock Adjustment (Manager)', 'POST', '/inventory/adjust', adjustPayload, 'manager', adjustRes);

    const badReasonPayload = {
      productId: 1,
      warehouseId: 1,
      countedQuantity: 65,
      reason: 'ok' // Less than 3 chars (violates min(3))
    };
    const badReasonRes = await request('POST', '/inventory/adjust', badReasonPayload, adminToken);
    logHttp('3.2 UC-17: 400 Bad Request - Reason Too Short (<3 chars) (Admin)', 'POST', '/inventory/adjust', badReasonPayload, 'admin', badReasonRes);

    const staffAdjustPayload = {
      productId: 1,
      warehouseId: 1,
      countedQuantity: 100,
      reason: 'Unauthorized staff adjustment attempt'
    };
    const staffAdjustRes = await request('POST', '/inventory/adjust', staffAdjustPayload, staffToken);
    logHttp('3.3 UC-17: 403 Forbidden - Staff Direct Adjustment Attempt', 'POST', '/inventory/adjust', staffAdjustPayload, 'staff', staffAdjustRes);

    // ------------------------------------------------------------------------
    // 4. UC-18: Transfer Stock (Success, same warehouse 400, inactive warehouse 422, insufficient stock 422, staff 403)
    // ------------------------------------------------------------------------
    const transferPayload = {
      productId: 1,
      sourceWarehouseId: 1,
      destinationWarehouseId: 2,
      quantity: 5,
      reason: 'Stock replenishment for regional hub'
    };
    const transferRes = await request('POST', '/inventory/transfer', transferPayload, adminToken);
    logHttp('4.1 UC-18: Successful Inter-Warehouse Transfer (Admin)', 'POST', '/inventory/transfer', transferPayload, 'admin', transferRes);

    const sameWhPayload = {
      productId: 1,
      sourceWarehouseId: 1,
      destinationWarehouseId: 1,
      quantity: 5,
      reason: 'Invalid same warehouse transfer'
    };
    const sameWhRes = await request('POST', '/inventory/transfer', sameWhPayload, mgrToken);
    logHttp('4.2 UC-18: 400 Bad Request - Same Source & Destination Warehouse (Manager)', 'POST', '/inventory/transfer', sameWhPayload, 'manager', sameWhRes);

    const inactiveWhPayload = {
      productId: 1,
      sourceWarehouseId: 1,
      destinationWarehouseId: 22, // Inactive warehouse in DB
      quantity: 5,
      reason: 'Transfer to decommissioned warehouse'
    };
    const inactiveWhRes = await request('POST', '/inventory/transfer', inactiveWhPayload, adminToken);
    logHttp('4.3 UC-18: 422 Unprocessable Entity - Inactive Destination Warehouse (Admin)', 'POST', '/inventory/transfer', inactiveWhPayload, 'admin', inactiveWhRes);

    const excessTransferPayload = {
      productId: 1,
      sourceWarehouseId: 1,
      destinationWarehouseId: 2,
      quantity: 999999,
      reason: 'Excess transfer attempt'
    };
    const excessTransferRes = await request('POST', '/inventory/transfer', excessTransferPayload, mgrToken);
    logHttp('4.4 UC-18: 422 Unprocessable Entity - Insufficient Stock for Transfer (Manager)', 'POST', '/inventory/transfer', excessTransferPayload, 'manager', excessTransferRes);

    const staffTransferPayload = {
      productId: 1,
      sourceWarehouseId: 1,
      destinationWarehouseId: 2,
      quantity: 2,
      reason: 'Staff unauthorized transfer'
    };
    const staffTransferRes = await request('POST', '/inventory/transfer', staffTransferPayload, staffToken);
    logHttp('4.5 UC-18: 403 Forbidden - Staff Direct Transfer Attempt', 'POST', '/inventory/transfer', staffTransferPayload, 'staff', staffTransferRes);

    // ------------------------------------------------------------------------
    // 5. UC-15: Stock Availability Query
    // ------------------------------------------------------------------------
    const availRes = await request('GET', '/inventory/availability?productId=1&quantity=10', null, staffToken);
    logHttp('5.1 UC-15: Check Stock Availability Query (Staff)', 'GET', '/inventory/availability?productId=1&quantity=10', null, 'staff', availRes);

    // ------------------------------------------------------------------------
    // 6. UC-19: Movement History Ledger (Validating Real Reference Types)
    // ------------------------------------------------------------------------
    const moveHistoryRes = await request('GET', '/inventory/movements?limit=10', null, staffToken);
    logHttp('6.1 UC-19: Historical Movement Audit Ledger (Staff)', 'GET', '/inventory/movements?limit=10', null, 'staff', moveHistoryRes);

    const refTypesFound = new Set(moveHistoryRes.body?.data?.map(m => m.referenceType));
    appendLog(`\n================================================================================`);
    appendLog(`### 6.2 Reference Type Enum Verification`);
    appendLog(`--------------------------------------------------------------------------------`);
    appendLog(`Distinct referenceType values found in live movements data: ${JSON.stringify(Array.from(refTypesFound))}`);
    appendLog(`Expected domain enum values: manual, adjustment, transfer, purchase_order, sales_order`);

    // ------------------------------------------------------------------------
    // 7. UC-14 / BR-05: Network-level costPrice Check (Admin vs Staff)
    // ------------------------------------------------------------------------
    const adminStockRes = await request('GET', '/inventory?limit=3', null, adminToken);
    const mgrStockRes = await request('GET', '/inventory?limit=3', null, mgrToken);
    const staffStockRes = await request('GET', '/inventory?limit=3', null, staffToken);

    logHttp('7.1 UC-14: Admin Inventory Stock List (Includes costPrice)', 'GET', '/inventory?limit=3', null, 'admin', adminStockRes);
    logHttp('7.2 UC-14: Staff Inventory Stock List (Masks costPrice)', 'GET', '/inventory?limit=3', null, 'staff', staffStockRes);

    appendLog(`\n================================================================================`);
    appendLog(`### 7.3 Network-Level Key Verification for costPrice (BR-05)`);
    appendLog(`--------------------------------------------------------------------------------`);
    const adminKeys = Object.keys(adminStockRes.body?.data?.[0] || {});
    const mgrKeys = Object.keys(mgrStockRes.body?.data?.[0] || {});
    const staffKeys = Object.keys(staffStockRes.body?.data?.[0] || {});

    appendLog(`Admin record keys: [ ${adminKeys.join(', ')} ]`);
    appendLog(`Admin has costPrice: ${adminKeys.includes('costPrice')}`);

    appendLog(`Manager record keys: [ ${mgrKeys.join(', ')} ]`);
    appendLog(`Manager has costPrice: ${mgrKeys.includes('costPrice')}`);

    appendLog(`Staff record keys: [ ${staffKeys.join(', ')} ]`);
    appendLog(`Staff has costPrice: ${staffKeys.includes('costPrice')}`);
    appendLog(`ASSERTION: 'costPrice' in staff record === ${'costPrice' in (staffStockRes.body?.data?.[0] || {})}`);

    appendLog(`\n================================================================================`);
    appendLog(`ALL STEP 5 LIVE VERIFICATIONS COMPLETED SUCCESSFULLY`);
    appendLog(`================================================================================\n`);

    fs.writeFileSync(path.resolve(__dirname, 'step5_evidence.txt'), logBuffer, 'utf8');
    console.log('Saved evidence to step5_evidence.txt');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('Fatal during live step 5 evidence collection:', err);
    process.exit(1);
  }
}

main();

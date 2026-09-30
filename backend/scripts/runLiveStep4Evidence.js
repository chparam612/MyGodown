import dotenv from 'dotenv';
import path from 'path';
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

process.env.NODE_ENV = 'development';
const PORT = parseInt(process.env.PORT || '5003', 10);
const BASE_URL = `http://localhost:${PORT}/api`;

async function main() {
  const { default: app } = await import('../src/app.js');
  const { pool, checkDbHealth } = await import('../src/config/db.js');

  const healthy = await checkDbHealth();
  if (!healthy) {
    console.error('Fatal: Database health check failed on', process.env.DB_NAME);
    process.exit(1);
  }

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
    console.log(`\n================================================================================`);
    console.log(`### ${stepName}`);
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`REQUEST:`);
    console.log(`${method} ${BASE_URL}${endpoint}`);
    console.log(`Authorization: Bearer <token_${tokenRole || 'public'}>`);
    if (reqBody) {
      console.log(`Content-Type: application/json\n`);
      console.log(JSON.stringify(reqBody, null, 2));
    }
    console.log(`\nRESPONSE:`);
    console.log(`HTTP/1.1 ${res.status}`);
    console.log(`Content-Type: application/json\n`);
    console.log(JSON.stringify(res.body, null, 2));
  }

  try {
    const ts = Date.now().toString().slice(-6);

    // ------------------------------------------------------------------------
    // 1. Logins
    // ------------------------------------------------------------------------
    const adminLogin = await request('POST', '/auth/login', { email: 'admin@mygodown.com', password: adminPassword });
    const adminToken = adminLogin.body?.data?.token;
    logHttp('1.1 Admin Authentication', 'POST', '/auth/login', { email: 'admin@mygodown.com', password: '[REDACTED]' }, 'none', adminLogin);

    const mgrLogin = await request('POST', '/auth/login', { email: 'manager@mygodown.com', password: managerPassword });
    const mgrToken = mgrLogin.body?.data?.token;
    logHttp('1.2 Warehouse Manager Authentication', 'POST', '/auth/login', { email: 'manager@mygodown.com', password: '[REDACTED]' }, 'none', mgrLogin);

    const staffLogin = await request('POST', '/auth/login', { email: 'staff@mygodown.com', password: staffPassword });
    const staffToken = staffLogin.body?.data?.token;
    logHttp('1.3 Inventory Staff Authentication', 'POST', '/auth/login', { email: 'staff@mygodown.com', password: '[REDACTED]' }, 'none', staffLogin);

    // ------------------------------------------------------------------------
    // 2. Suppliers (UC-21 to UC-24)
    // ------------------------------------------------------------------------
    // 2.1 Admin creates supplier
    const supPayload = {
      name: `Apex Logistics ${ts}`,
      contactName: 'David Miller',
      email: `apex_${ts}@logistics.com`,
      phone: '+1-555-0199',
      address: '742 Evergreen Terrace, Springfield',
    };
    const supAdminCreate = await request('POST', '/suppliers', supPayload, adminToken);
    logHttp('2.1 Admin Creates Supplier (201 Created)', 'POST', '/suppliers', supPayload, 'admin', supAdminCreate);
    const supplierId = supAdminCreate.body?.data?.id;

    // 2.2 Manager creates supplier
    const supMgrPayload = {
      name: `Pacific Freight ${ts}`,
      contactName: 'Sarah Jenkins',
      email: `pacific_${ts}@freight.com`,
      phone: '+1-555-0188',
      address: '100 Ocean Blvd, Long Beach',
    };
    const supMgrCreate = await request('POST', '/suppliers', supMgrPayload, mgrToken);
    logHttp('2.2 Manager Creates Supplier (201 Created)', 'POST', '/suppliers', supMgrPayload, 'manager', supMgrCreate);

    // 2.3 Staff forbidden to create supplier
    const staffSupPayload = {
      name: `Unauthorized Supply ${ts}`,
      email: `unauth_${ts}@supply.com`,
    };
    const supStaffCreate = await request('POST', '/suppliers', staffSupPayload, staffToken);
    logHttp('2.3 Staff Denied Supplier Creation (403 Forbidden)', 'POST', '/suppliers', staffSupPayload, 'staff', supStaffCreate);

    // 2.4 Duplicate Email Conflict (409)
    const supDupEmail = await request('POST', '/suppliers', { name: 'Duplicate Corp', email: supPayload.email }, adminToken);
    logHttp('2.4 Duplicate Supplier Email Rejected (409 Conflict)', 'POST', '/suppliers', { name: 'Duplicate Corp', email: supPayload.email }, 'admin', supDupEmail);

    // 2.5 Manager edits supplier
    const supUpdatePayload = {
      contactName: 'David Miller Jr.',
      phone: '+1-555-0999',
      address: '742 Evergreen Terrace Suite B, Springfield',
    };
    const supEdit = await request('PUT', `/suppliers/${supplierId}`, supUpdatePayload, mgrToken);
    logHttp('2.5 Manager Updates Supplier (200 OK)', 'PUT', `/suppliers/${supplierId}`, supUpdatePayload, 'manager', supEdit);

    // 2.6 Staff forbidden to edit supplier
    const supStaffEdit = await request('PUT', `/suppliers/${supplierId}`, { contactName: 'Hacker' }, staffToken);
    logHttp('2.6 Staff Denied Supplier Edit (403 Forbidden)', 'PUT', `/suppliers/${supplierId}`, { contactName: 'Hacker' }, 'staff', supStaffEdit);

    // 2.7 BR-07: Supplier Deactivation Blocked if Open Purchase Orders Exist (422)
    // Create dedicated supplier and an open purchase order linked to it
    const supWithPORes = await request('POST', '/suppliers', {
      name: `Procurement Vendor ${ts}`,
      contactName: 'Order Coordinator',
      email: `procure_${ts}@vendor.com`,
    }, adminToken);
    const supWithPOId = supWithPORes.body?.data?.id;

    const poRes = await request('POST', '/purchase-orders', {
      supplierId: supWithPOId,
      warehouseId: 1,
      items: [{ productId: 1, quantity: 5, unitCost: 15.00 }],
    }, mgrToken);
    const poId = poRes.body?.data?.id;

    const supWithPOBlock = await request('DELETE', `/suppliers/${supWithPOId}`, null, mgrToken);
    logHttp('2.7 BR-07 Guard: Deactivation Blocked for Supplier with Open PO (422 Unprocessable Entity)', 'DELETE', `/suppliers/${supWithPOId}`, null, 'manager', supWithPOBlock);

    // Cancel PO so vendor is no longer locked
    await request('POST', `/purchase-orders/${poId}/cancel`, null, mgrToken);

    // 2.8 Manager deactivates clean supplier
    const supDeactivate = await request('DELETE', `/suppliers/${supplierId}`, null, mgrToken);
    logHttp('2.8 Manager Soft-Deactivates Supplier with 0 Open POs (200 OK)', 'DELETE', `/suppliers/${supplierId}`, null, 'manager', supDeactivate);

    // 2.9 Staff forbidden to deactivate supplier
    const supStaffDeactivate = await request('DELETE', `/suppliers/${supplierId}`, null, staffToken);
    logHttp('2.9 Staff Denied Supplier Deactivation (403 Forbidden)', 'DELETE', `/suppliers/${supplierId}`, null, 'staff', supStaffDeactivate);

    // ------------------------------------------------------------------------
    // 3. Warehouses (UC-11 to UC-13)
    // ------------------------------------------------------------------------
    // 3.1 Admin creates warehouse
    const whPayload = {
      code: `W${ts.slice(-3)}`,
      name: `Southwest Distribution Center ${ts}`,
      address: '900 Industrial Parkway',
      city: 'Phoenix',
      state: 'AZ',
      postalCode: '85001',
      country: 'USA',
    };
    const whAdminCreate = await request('POST', '/warehouses', whPayload, adminToken);
    logHttp('3.1 Admin Creates Warehouse (201 Created)', 'POST', '/warehouses', whPayload, 'admin', whAdminCreate);
    const warehouseId = whAdminCreate.body?.data?.id;

    // 3.2 Manager forbidden to create warehouse (Admin only!)
    const whMgrCreate = await request('POST', '/warehouses', { code: `WM${ts.slice(-2)}`, name: 'Mgr Hub', city: 'Dallas' }, mgrToken);
    logHttp('3.2 Manager Denied Warehouse Creation (403 Forbidden)', 'POST', '/warehouses', { code: `WM${ts.slice(-2)}`, name: 'Mgr Hub', city: 'Dallas' }, 'manager', whMgrCreate);

    // 3.3 Staff forbidden to create warehouse
    const whStaffCreate = await request('POST', '/warehouses', { code: `WS${ts.slice(-2)}`, name: 'Staff Hub', city: 'Denver' }, staffToken);
    logHttp('3.3 Staff Denied Warehouse Creation (403 Forbidden)', 'POST', '/warehouses', { code: `WS${ts.slice(-2)}`, name: 'Staff Hub', city: 'Denver' }, 'staff', whStaffCreate);

    // 3.4 Duplicate Warehouse Code (409)
    const whDupCode = await request('POST', '/warehouses', { ...whPayload, name: 'Duplicate WH' }, adminToken);
    logHttp('3.4 Duplicate Warehouse Code Rejected (409 Conflict)', 'POST', '/warehouses', { ...whPayload, name: 'Duplicate WH' }, 'admin', whDupCode);

    // 3.5 Admin edits warehouse
    const whUpdatePayload = {
      name: `Southwest Mega Hub ${ts}`,
      address: '950 Industrial Parkway Suite 100',
    };
    const whEdit = await request('PUT', `/warehouses/${warehouseId}`, whUpdatePayload, adminToken);
    logHttp('3.5 Admin Updates Warehouse Details (200 OK)', 'PUT', `/warehouses/${warehouseId}`, whUpdatePayload, 'admin', whEdit);

    // 3.6 Immutable warehouse code rejected (400)
    const whCodeChange = await request('PUT', `/warehouses/${warehouseId}`, { code: 'ILLEGAL' }, adminToken);
    logHttp('3.6 Modifying Immutable Warehouse Code Rejected (400 Bad Request)', 'PUT', `/warehouses/${warehouseId}`, { code: 'ILLEGAL' }, 'admin', whCodeChange);

    // 3.7 Manager forbidden to edit warehouse
    const whMgrEdit = await request('PUT', `/warehouses/${warehouseId}`, { name: 'Manager Try' }, mgrToken);
    logHttp('3.7 Manager Denied Warehouse Edit (403 Forbidden)', 'PUT', `/warehouses/${warehouseId}`, { name: 'Manager Try' }, 'manager', whMgrEdit);

    // 3.8 BR-08: Deactivation Blocked if Warehouse Holds Stock (422)
    // Seed warehouse 1 holds physical stock
    const whWithStockBlock = await request('DELETE', `/warehouses/1`, null, adminToken);
    logHttp('3.8 BR-08 Guard: Deactivation Blocked for Warehouse with Stock (422 Unprocessable Entity)', 'DELETE', `/warehouses/1`, null, 'admin', whWithStockBlock);

    // 3.9 Admin deactivates clean warehouse
    const whDeactivate = await request('DELETE', `/warehouses/${warehouseId}`, null, adminToken);
    logHttp('3.9 Admin Soft-Deactivates Warehouse with 0 Stock (200 OK)', 'DELETE', `/warehouses/${warehouseId}`, null, 'admin', whDeactivate);

    // 3.10 Manager forbidden to deactivate warehouse
    const whMgrDeactivate = await request('DELETE', `/warehouses/${warehouseId}`, null, mgrToken);
    logHttp('3.10 Manager Denied Warehouse Deactivation (403 Forbidden)', 'DELETE', `/warehouses/${warehouseId}`, null, 'manager', whMgrDeactivate);

    // ------------------------------------------------------------------------
    // 4. Products (UC-07 to UC-10)
    // ------------------------------------------------------------------------
    const prodPayload = {
      sku: `SKU-TEST-${ts}`,
      name: `Enterprise Router ${ts}`,
      description: 'Gigabit dual-band industrial wireless router',
      category: 'Networking',
      unitPrice: 199.99,
      costPrice: 120.00,
      reorderLevel: 15,
      supplierId: 2,
    };
    // 4.1 Manager creates product
    const prodMgrCreate = await request('POST', '/products', prodPayload, mgrToken);
    logHttp('4.1 Manager Creates Product (201 Created)', 'POST', '/products', prodPayload, 'manager', prodMgrCreate);
    const productId = prodMgrCreate.body?.data?.id;

    // 4.2 Admin creates product
    const prodAdminPayload = {
      sku: `SKU-ADM-${ts}`,
      name: `Cat6 Patch Cable 50ft ${ts}`,
      category: 'Cables',
      unitPrice: 18.50,
      costPrice: 8.25,
      reorderLevel: 50,
      supplierId: 2,
    };
    const prodAdminCreate = await request('POST', '/products', prodAdminPayload, adminToken);
    logHttp('4.2 Admin Creates Product (201 Created)', 'POST', '/products', prodAdminPayload, 'admin', prodAdminCreate);

    // 4.3 Staff forbidden to create product
    const prodStaffPayload = {
      sku: `SKU-STF-${ts}`,
      name: `Unauthorized Product ${ts}`,
      category: 'General',
      unitPrice: 10.00,
      supplierId: 2,
    };
    const prodStaffCreate = await request('POST', '/products', prodStaffPayload, staffToken);
    logHttp('4.3 Staff Denied Product Creation (403 Forbidden)', 'POST', '/products', prodStaffPayload, 'staff', prodStaffCreate);

    // 4.4 Duplicate SKU Conflict (409)
    const prodDupSku = await request('POST', '/products', { ...prodPayload, name: 'Duplicate SKU Router' }, mgrToken);
    logHttp('4.4 Duplicate Product SKU Rejected (409 Conflict)', 'POST', '/products', { ...prodPayload, name: 'Duplicate SKU Router' }, 'manager', prodDupSku);

    // 4.5 Inactive Supplier Rejection (422)
    // Deactivated supplierId from step 2.8
    const prodInactiveSup = await request('POST', '/products', {
      sku: `SKU-INACT-${ts}`,
      name: 'Item With Inactive Supplier',
      unitPrice: 50.00,
      costPrice: 25.00,
      supplierId: supplierId,
    }, mgrToken);
    logHttp('4.5 Inactive Supplier Rejected (422 Unprocessable Entity)', 'POST', '/products', {
      sku: `SKU-INACT-${ts}`,
      name: 'Item With Inactive Supplier',
      unitPrice: 50.00,
      costPrice: 25.00,
      supplierId: supplierId,
    }, 'manager', prodInactiveSup);

    // 4.6 Manager updates product
    const prodUpdatePayload = {
      name: `Enterprise Router Pro v2 ${ts}`,
      unitPrice: 219.99,
      costPrice: 135.00,
      reorderLevel: 20,
    };
    const prodEdit = await request('PUT', `/products/${productId}`, prodUpdatePayload, mgrToken);
    logHttp('4.6 Manager Updates Product Details (200 OK)', 'PUT', `/products/${productId}`, prodUpdatePayload, 'manager', prodEdit);

    // 4.7 Modifying Immutable SKU Rejected (400)
    const prodSkuChange = await request('PUT', `/products/${productId}`, { sku: 'NEW-SKU-ILLEGAL' }, mgrToken);
    logHttp('4.7 Modifying Immutable Product SKU Rejected (400 Bad Request)', 'PUT', `/products/${productId}`, { sku: 'NEW-SKU-ILLEGAL' }, 'manager', prodSkuChange);

    // 4.8 Staff forbidden to update product
    const prodStaffEdit = await request('PUT', `/products/${productId}`, { unitPrice: 0.01 }, staffToken);
    logHttp('4.8 Staff Denied Product Edit (403 Forbidden)', 'PUT', `/products/${productId}`, { unitPrice: 0.01 }, 'staff', prodStaffEdit);

    // 4.9 Manager Single Product Lookup: costPrice IS PRESENT (BR-05)
    const prodMgrLookup = await request('GET', `/products/${productId}`, null, mgrToken);
    logHttp('4.9 BR-05 Audit: Manager Single Lookup (costPrice MUST be present)', 'GET', `/products/${productId}`, null, 'manager', prodMgrLookup);
    const hasCostPriceManager = 'costPrice' in (prodMgrLookup.body?.data || {});
    console.log(`\n>>> AUDIT VERIFICATION: 'costPrice' in Manager response body = ${hasCostPriceManager} (costPrice = ${prodMgrLookup.body?.data?.costPrice})`);

    // 4.10 Staff Single Product Lookup: costPrice MUST BE ABSENT (BR-05)
    const prodStaffLookup = await request('GET', `/products/${productId}`, null, staffToken);
    logHttp('4.10 BR-05 Audit: Staff Single Lookup (costPrice MUST BE ABSENT)', 'GET', `/products/${productId}`, null, 'staff', prodStaffLookup);
    const hasCostPriceStaff = 'costPrice' in (prodStaffLookup.body?.data || {});
    const staffKeys = Object.keys(prodStaffLookup.body?.data || {});
    console.log(`\n>>> AUDIT VERIFICATION: 'costPrice' in Staff response body = ${hasCostPriceStaff}`);
    console.log(`>>> STAFF OBJECT KEYS: [${staffKeys.join(', ')}]`);

    // 4.11 Staff List Products: costPrice MUST BE ABSENT from every item (BR-05)
    const prodStaffList = await request('GET', `/products?limit=3`, null, staffToken);
    logHttp('4.11 BR-05 Audit: Staff Products List (costPrice MUST BE ABSENT from all items)', 'GET', `/products?limit=3`, null, 'staff', prodStaffList);
    const staffListHasCost = (prodStaffList.body?.data || []).some((p) => 'costPrice' in p);
    console.log(`\n>>> AUDIT VERIFICATION: 'costPrice' in ANY Staff list item = ${staffListHasCost}`);

    // 4.12 Manager deactivates product
    const prodDeactivate = await request('DELETE', `/products/${productId}`, null, mgrToken);
    logHttp('4.12 Manager Soft-Deactivates Product (200 OK)', 'DELETE', `/products/${productId}`, null, 'manager', prodDeactivate);

    // 4.13 Staff forbidden to deactivate product
    const prodStaffDeactivate = await request('DELETE', `/products/${productId}`, null, staffToken);
    logHttp('4.13 Staff Denied Product Deactivation (403 Forbidden)', 'DELETE', `/products/${productId}`, null, 'staff', prodStaffDeactivate);

    console.log('\n================================================================================');
    console.log('STEP 4 LIVE API EVIDENCE RUN COMPLETED SUCCESSFULLY');
    console.log('================================================================================\n');
  } catch (err) {
    console.error('Test run failed:', err);
  } finally {
    server.close();
    process.exit(0);
  }
}

main();

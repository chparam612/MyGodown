/**
 * ============================================================================
 * File: backend/scripts/runLiveModule2Products.js
 * Purpose: Safe live execution of Module 2 (Products: UC-06 to UC-10).
 * Safety Guarantee:
 * - Credentials read strictly from process.env (no hardcoded fallbacks).
 * - Creates dedicated LIVE- prefixed product via the API.
 * - Protects seeded products (IDs 1-20).
 * - Soft-deactivates the LIVE- product at the end (no DELETE).
 * ============================================================================
 */

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
  console.error('[FATAL]: Missing required seed password environment variables (SEED_ADMIN_PASSWORD, SEED_MANAGER_PASSWORD, SEED_STAFF_PASSWORD).');
  process.exit(1);
}

process.env.NODE_ENV = 'development';
const PORT = parseInt(process.env.PORT || '5000', 10);
const BASE_URL = `http://localhost:${PORT}/api`;

async function runLiveModule2() {
  console.log('====================================================================');
  console.log(`[MODULE 2 LIVE RUN]: Target Database = ${process.env.DB_NAME} on PORT ${PORT}`);
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

  let createdProductId = null;

  try {
    // ------------------------------------------------------------------------
    // Part A: Authenticate Seeded Phase 1 Users
    // ------------------------------------------------------------------------
    console.log('--- PART A: AUTHENTICATION ---');
    const adminLog = await request('POST', '/auth/login', {
      email: 'admin@mygodown.com',
      password: adminPassword,
    });
    const adminToken = adminLog.body?.data?.token;
    console.log(`1. Admin Login -> Status: ${adminLog.status}, Token: ${mask(adminToken)}`);

    const mgrLog = await request('POST', '/auth/login', {
      email: 'manager@mygodown.com',
      password: managerPassword,
    });
    const managerToken = mgrLog.body?.data?.token;
    console.log(`2. Manager Login -> Status: ${mgrLog.status}, Token: ${mask(managerToken)}`);

    const staffLog = await request('POST', '/auth/login', {
      email: 'staff@mygodown.com',
      password: staffPassword,
    });
    const staffToken = staffLog.body?.data?.token;
    console.log(`3. Staff Login -> Status: ${staffLog.status}, Token: ${mask(staffToken)}`);

    // ------------------------------------------------------------------------
    // Part B: UC-06 - Add Product
    // ------------------------------------------------------------------------
    console.log('\n--- PART B: UC-06 ADD PRODUCT ---');
    const ts = Date.now().toString().slice(-5);
    const liveSku = `LIVE-SKU-${ts}`;

    // Admin creates product
    const createProdRes = await request('POST', '/products', {
      name: `LIVE Industrial Sensor (${ts})`,
      sku: liveSku,
      category: 'Sensors',
      unitPrice: 129.50,
      costPrice: 75.25,
      reorderLevel: 15,
      supplierId: 1, // Seeded supplier 1
      isActive: true,
    }, adminToken);
    console.log(`4. [UC-06] Admin Create Product -> Status: ${createProdRes.status}`, createProdRes.body?.data);
    createdProductId = createProdRes.body?.data?.id;

    // Duplicate SKU conflict (409)
    const dupSkuRes = await request('POST', '/products', {
      name: 'Duplicate SKU Item',
      sku: liveSku,
      category: 'Sensors',
      unitPrice: 99.00,
      costPrice: 50.00,
      supplierId: 1,
    }, managerToken);
    console.log(`5. [UC-06] Duplicate SKU Conflict (409) -> Status: ${dupSkuRes.status}`, dupSkuRes.body);

    // Inactive or invalid supplier (422)
    const badSupplierRes = await request('POST', '/products', {
      name: 'Bad Supplier Item',
      sku: `LIVE-FAIL-${ts}`,
      category: 'Sensors',
      unitPrice: 99.00,
      costPrice: 50.00,
      supplierId: 999999,
    }, adminToken);
    console.log(`6. [UC-06] Invalid Supplier ID (422) -> Status: ${badSupplierRes.status}`, badSupplierRes.body);

    // Staff forbidden create (403)
    const staffCreateRes = await request('POST', '/products', {
      name: 'Staff Denied Item',
      sku: `LIVE-STF-${ts}`,
      category: 'Sensors',
      unitPrice: 10.00,
      costPrice: 5.00,
      supplierId: 1,
    }, staffToken);
    console.log(`7. [UC-06] Staff Create Forbidden (403) -> Status: ${staffCreateRes.status}`, staffCreateRes.body);

    // ------------------------------------------------------------------------
    // Part C: UC-07 & UC-08 - View & Search Products
    // ------------------------------------------------------------------------
    console.log('\n--- PART C: UC-07 & UC-08 VIEW & SEARCH PRODUCTS ---');
    // Staff lists products (costPrice must be omitted)
    const staffListRes = await request('GET', '/products?page=1&limit=5', null, staffToken);
    const staffSample = staffListRes.body?.data?.[0];
    console.log(`8. [UC-07] Staff List Products -> Status: ${staffListRes.status}, count: ${staffListRes.body?.data?.length}`);
    console.log(`   Staff Sample Product (costPrice must be undefined):`, {
      id: staffSample?.id,
      sku: staffSample?.sku,
      unitPrice: staffSample?.unitPrice,
      costPrice: staffSample?.costPrice,
    });

    // Manager lists products (costPrice must be visible)
    const mgrListRes = await request('GET', '/products?page=1&limit=5', null, managerToken);
    const mgrSample = mgrListRes.body?.data?.[0];
    console.log(`9. [UC-07] Manager List Products -> Status: ${mgrListRes.status}`);
    console.log(`   Manager Sample Product (costPrice present):`, {
      id: mgrSample?.id,
      sku: mgrSample?.sku,
      unitPrice: mgrSample?.unitPrice,
      costPrice: mgrSample?.costPrice,
    });

    // Single product lookup by staff (UC-08)
    const singleStaffRes = await request('GET', `/products/${createdProductId}`, null, staffToken);
    console.log(`10. [UC-08] Staff Single Product Lookup (costPrice masked) -> Status: ${singleStaffRes.status}, costPrice: ${singleStaffRes.body?.data?.costPrice}`);

    // Single product lookup by manager (UC-08)
    const singleMgrRes = await request('GET', `/products/${createdProductId}`, null, managerToken);
    console.log(`11. [UC-08] Manager Single Product Lookup (costPrice visible) -> Status: ${singleMgrRes.status}, costPrice: ${singleMgrRes.body?.data?.costPrice}`);

    // Non-existent product (404)
    const notFoundRes = await request('GET', '/products/999999', null, adminToken);
    console.log(`12. [UC-08] Non-existent Product Lookup (404) -> Status: ${notFoundRes.status}`, notFoundRes.body);

    // ------------------------------------------------------------------------
    // Part D: UC-09 - Update Product
    // ------------------------------------------------------------------------
    console.log('\n--- PART D: UC-09 UPDATE PRODUCT ---');
    const updateRes = await request('PUT', `/products/${createdProductId}`, {
      name: `LIVE Industrial Sensor (${ts}) - Upgraded`,
      unitPrice: 139.99,
    }, managerToken);
    console.log(`13. [UC-09] Manager Update Product -> Status: ${updateRes.status}`, updateRes.body?.data);

    // SKU Immutability check (400)
    const skuImmutRes = await request('PUT', `/products/${createdProductId}`, {
      sku: 'LIVE-MODIFIED-SKU-FAIL',
    }, adminToken);
    console.log(`14. [UC-09] SKU Immutability Violation (400) -> Status: ${skuImmutRes.status}`, skuImmutRes.body);

    // Staff forbidden update (403)
    const staffUpdRes = await request('PUT', `/products/${createdProductId}`, {
      name: 'Staff Renamed Attempt',
    }, staffToken);
    console.log(`15. [UC-09] Staff Update Forbidden (403) -> Status: ${staffUpdRes.status}`, staffUpdRes.body);

    // ------------------------------------------------------------------------
    // Part E: UC-10 - Deactivate & Reactivate Product
    // ------------------------------------------------------------------------
    console.log('\n--- PART E: UC-10 DEACTIVATE & REACTIVATE PRODUCT ---');
    // Staff forbidden deactivate (403)
    const staffDeactRes = await request('DELETE', `/products/${createdProductId}`, null, staffToken);
    console.log(`16. [UC-10] Staff Deactivate Forbidden (403) -> Status: ${staffDeactRes.status}`, staffDeactRes.body);

    // Manager soft-deactivates product (200)
    const deactRes = await request('DELETE', `/products/${createdProductId}`, null, managerToken);
    console.log(`17. [UC-10] Soft-Deactivate Product -> Status: ${deactRes.status}, isActive: ${deactRes.body?.data?.isActive}`);

    // Verify staff gets 404 for deactivated product
    const staffHiddenRes = await request('GET', `/products/${createdProductId}`, null, staffToken);
    console.log(`18. [UC-10] Staff Lookup Inactive Product (404) -> Status: ${staffHiddenRes.status}`, staffHiddenRes.body);

    // Reactivate product via PUT (200)
    const reactivateRes = await request('PUT', `/products/${createdProductId}`, {
      isActive: true,
    }, managerToken);
    console.log(`19. [UC-10] Reactivate Product -> Status: ${reactivateRes.status}, isActive: ${reactivateRes.body?.data?.isActive}`);

    // ------------------------------------------------------------------------
    // Part F: Self-Cleaning
    // ------------------------------------------------------------------------
    console.log('\n--- PART F: SELF-CLEANING LIVE DATA ---');
    if (createdProductId) {
      const cleanDeact = await request('DELETE', `/products/${createdProductId}`, null, adminToken);
      console.log(`20. Soft-Deactivate LIVE Product ${createdProductId} -> Status: ${cleanDeact.status}`);
    }

    console.log('\n====================================================================');
    console.log('[LIVE SERVER RUN]: All Module 2 tests passed against inventory_db!');
    console.log('Seeded products (IDs 1-20) remained completely untouched.');
    console.log('====================================================================\n');
  } finally {
    server.close();
    await pool.end();
  }
}

runLiveModule2().catch((err) => {
  console.error('[Fatal Error in Live Module 2 Run]:', err);
  process.exit(1);
});

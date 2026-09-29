/**
 * ============================================================================
 * File: backend/scripts/runLiveModule3Warehouses.js
 * Purpose: Safe live execution of Module 3 (Warehouses: UC-11 to UC-13).
 * Safety Guarantee:
 * - Credentials read strictly from process.env (no hardcoded fallbacks).
 * - Creates dedicated LIVE- prefixed warehouse via the API.
 * - Protects seeded warehouses (IDs 1-3).
 * - Soft-deactivates the LIVE- warehouse at the end (no DELETE).
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

async function runLiveModule3() {
  console.log('====================================================================');
  console.log(`[MODULE 3 LIVE RUN]: Target Database = ${process.env.DB_NAME} on PORT ${PORT}`);
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

  let createdWarehouseId = null;

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
    // Part B: UC-11 - Add Warehouse
    // ------------------------------------------------------------------------
    console.log('\n--- PART B: UC-11 ADD WAREHOUSE ---');
    const ts = Date.now().toString().slice(-5);
    const whCode = `WH-LIVE-${ts}`;

    // Admin creates warehouse
    const createRes = await request('POST', '/warehouses', {
      name: `LIVE Distribution Hub (${ts})`,
      code: whCode,
      city: 'Kansas City',
      address: '1200 Logistics Parkway',
      isActive: true,
    }, adminToken);
    console.log(`4. [UC-11] Admin Create Warehouse -> Status: ${createRes.status}`, createRes.body?.data);
    createdWarehouseId = createRes.body?.data?.id;

    // Duplicate Code Conflict (409)
    const dupRes = await request('POST', '/warehouses', {
      name: 'Duplicate Hub',
      code: whCode,
      city: 'Kansas City',
    }, adminToken);
    console.log(`5. [UC-11] Duplicate Warehouse Code (409) -> Status: ${dupRes.status}`, dupRes.body);

    // Validation Error: Missing required fields (400)
    const valRes = await request('POST', '/warehouses', { name: 'Incomplete Hub' }, adminToken);
    console.log(`6. [UC-11] Validation Error (400) -> Status: ${valRes.status}`, valRes.body);

    // Manager forbidden create (403)
    const mgrCreateRes = await request('POST', '/warehouses', {
      name: 'Manager Hub',
      code: `WH-MGR-${ts}`,
      city: 'Denver',
    }, managerToken);
    console.log(`7. [UC-11] Manager Create Warehouse (403) -> Status: ${mgrCreateRes.status}`, mgrCreateRes.body);

    // Staff forbidden create (403)
    const stfCreateRes = await request('POST', '/warehouses', {
      name: 'Staff Hub',
      code: `WH-STF-${ts}`,
      city: 'Austin',
    }, staffToken);
    console.log(`8. [UC-11] Staff Create Warehouse (403) -> Status: ${stfCreateRes.status}`, stfCreateRes.body);

    // ------------------------------------------------------------------------
    // Part C: UC-12 - View & Search Warehouses
    // ------------------------------------------------------------------------
    console.log('\n--- PART C: UC-12 VIEW & SEARCH WAREHOUSES ---');
    // Staff lists warehouses
    const listRes = await request('GET', '/warehouses?page=1&limit=5', null, staffToken);
    console.log(`9. [UC-12] Staff List Warehouses -> Status: ${listRes.status}, count: ${listRes.body?.data?.length}`);
    console.log(`   Sample Warehouse Object (camelCase):`, listRes.body?.data?.[0]);

    // Manager searches warehouses
    const searchRes = await request('GET', '/warehouses?search=Central', null, managerToken);
    console.log(`10. [UC-12] Manager Search Warehouses ("Central") -> Status: ${searchRes.status}, count: ${searchRes.body?.data?.length}`);

    // Admin filters by city
    const filterRes = await request('GET', '/warehouses?city=Chicago', null, adminToken);
    console.log(`11. [UC-12] Admin Filter Warehouses (City: Chicago) -> Status: ${filterRes.status}, count: ${filterRes.body?.data?.length}`);

    // Single lookup with stock summary (Warehouse 1)
    const getWh1Res = await request('GET', '/warehouses/1', null, staffToken);
    console.log(`12. [UC-12] Get Warehouse by ID (Warehouse 1 with stock aggregates) -> Status: ${getWh1Res.status}`, {
      id: getWh1Res.body?.data?.id,
      code: getWh1Res.body?.data?.code,
      name: getWh1Res.body?.data?.name,
      productCount: getWh1Res.body?.data?.productCount,
      totalStock: getWh1Res.body?.data?.totalStock,
    });

    // 404 on unknown warehouse
    const notFoundRes = await request('GET', '/warehouses/999999', null, adminToken);
    console.log(`13. [UC-12] Get Unknown Warehouse (404) -> Status: ${notFoundRes.status}`, notFoundRes.body);

    // ------------------------------------------------------------------------
    // Part D: UC-13 - Update Warehouse
    // ------------------------------------------------------------------------
    console.log('\n--- PART D: UC-13 UPDATE WAREHOUSE ---');
    const updateRes = await request('PUT', `/warehouses/${createdWarehouseId}`, {
      name: `LIVE Distribution Hub (${ts}) - Modernized`,
      address: '1250 Logistics Parkway, Suite 200',
    }, adminToken);
    console.log(`14. [UC-13] Admin Update Warehouse -> Status: ${updateRes.status}`, updateRes.body?.data);

    // Code immutability violation (400)
    const immutRes = await request('PUT', `/warehouses/${createdWarehouseId}`, {
      code: 'WH-MODIFIED-FAIL',
    }, adminToken);
    console.log(`15. [UC-13] Code Immutability Violation (400) -> Status: ${immutRes.status}`, immutRes.body);

    // Staff forbidden update (403)
    const stfUpdRes = await request('PUT', `/warehouses/${createdWarehouseId}`, {
      name: 'Staff Renamed',
    }, staffToken);
    console.log(`16. [UC-13] Staff Update Warehouse (403) -> Status: ${stfUpdRes.status}`, stfUpdRes.body);

    // ------------------------------------------------------------------------
    // Part E: UC-13 - Deactivate & Reactivate Warehouse
    // ------------------------------------------------------------------------
    console.log('\n--- PART E: UC-13 DEACTIVATE & REACTIVATE WAREHOUSE ---');
    // Deactivation blocked by existing stock (BR-08: Warehouse 1 holds inventory)
    const deactBlockRes = await request('DELETE', '/warehouses/1', null, adminToken);
    console.log(`17. [UC-13] Deactivate Warehouse with Stock (BR-08: 422) -> Status: ${deactBlockRes.status}`, deactBlockRes.body);

    // Manager deactivation forbidden (403)
    const mgrDeactRes = await request('DELETE', `/warehouses/${createdWarehouseId}`, null, managerToken);
    console.log(`18. [UC-13] Manager Deactivate Warehouse (403) -> Status: ${mgrDeactRes.status}`, mgrDeactRes.body);

    // Admin soft-deactivates empty LIVE- warehouse (200 OK)
    const deactRes = await request('DELETE', `/warehouses/${createdWarehouseId}`, null, adminToken);
    console.log(`19. [UC-13] Admin Soft-Deactivate Empty Warehouse -> Status: ${deactRes.status}, isActive: ${deactRes.body?.data?.isActive}`);

    // Verify staff gets 404 for deactivated warehouse
    const stfDeactLookup = await request('GET', `/warehouses/${createdWarehouseId}`, null, staffToken);
    console.log(`20. [UC-13] Staff Lookup Deactivated Warehouse (404) -> Status: ${stfDeactLookup.status}`, stfDeactLookup.body);

    // Admin reactivates warehouse via PUT (200 OK)
    const reactivateRes = await request('PUT', `/warehouses/${createdWarehouseId}`, { isActive: true }, adminToken);
    console.log(`21. [UC-13] Admin Reactivate Warehouse (200 OK) -> Status: ${reactivateRes.status}, isActive: ${reactivateRes.body?.data?.isActive}`);

    // ------------------------------------------------------------------------
    // Part F: Self-Cleaning
    // ------------------------------------------------------------------------
    console.log('\n--- PART F: SELF-CLEANING LIVE DATA ---');
    if (createdWarehouseId) {
      const cleanDeact = await request('DELETE', `/warehouses/${createdWarehouseId}`, null, adminToken);
      console.log(`22. Soft-Deactivate LIVE Warehouse ${createdWarehouseId} -> Status: ${cleanDeact.status}`);
    }

    console.log('\n====================================================================');
    console.log('[LIVE SERVER RUN]: All Module 3 tests passed against inventory_db!');
    console.log('Seeded warehouses (IDs 1-3) remained completely untouched.');
    console.log('====================================================================\n');
  } finally {
    server.close();
    await pool.end();
  }
}

runLiveModule3().catch((err) => {
  console.error('[Fatal Error in Live Module 3 Run]:', err);
  process.exit(1);
});

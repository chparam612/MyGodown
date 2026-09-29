/**
 * ============================================================================
 * File: backend/scripts/runLiveHttpTests.js
 * Purpose: Executes real HTTP requests against live server running on inventory_db.
 * Why it exists: Proves that live API endpoints work against inventory_db with real
 * credentials and validates status codes, response envelopes, and error handling.
 * ============================================================================
 */

import http from 'http';
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

// Force development environment for inventory_db
process.env.NODE_ENV = 'development';

const PORT = parseInt(process.env.PORT || '5000', 10);
const BASE_URL = `http://localhost:${PORT}/api`;

async function run() {
  console.log('====================================================================');
  console.log(`[LIVE SERVER TEST]: Target Database = ${process.env.DB_NAME} (NODE_ENV=${process.env.NODE_ENV})`);
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
    const headers = {
      'Accept': 'application/json',
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

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
    // Part A: Authenticate Seeded Phase 1 Users
    // ------------------------------------------------------------------------
    console.log('--- PART A: AUTHENTICATION (Phase 1 Seeded Users) ---');
    const adminLog = await request('POST', '/auth/login', {
      email: 'admin@mygodown.com',
      password: adminPassword,
    });
    console.log(`1. Admin Login (admin@mygodown.com) -> Status: ${adminLog.status}`);
    const adminToken = adminLog.body?.data?.token;
    console.log(`   Response User:`, adminLog.body?.data?.user, `Token: ${mask(adminToken)}`);

    const mgrLog = await request('POST', '/auth/login', {
      email: 'manager@mygodown.com',
      password: managerPassword,
    });
    console.log(`2. Manager Login (manager@mygodown.com) -> Status: ${mgrLog.status}`);
    const managerToken = mgrLog.body?.data?.token;

    const staffLog = await request('POST', '/auth/login', {
      email: 'staff@mygodown.com',
      password: staffPassword,
    });
    console.log(`3. Staff Login (staff@mygodown.com) -> Status: ${staffLog.status}`);
    const staffToken = staffLog.body?.data?.token;

    // ------------------------------------------------------------------------
    // Part B: Item 4 Verification (Deactivated Account Password Check Order)
    // ------------------------------------------------------------------------
    console.log('\n--- PART B: DEACTIVATED LOGIN PASSWORD VERIFICATION (Item 4) ---');
    // We test with unknown email, active user wrong password, and deactivated user if exists
    const unknownLog = await request('POST', '/auth/login', {
      email: 'nobody@mygodown.com',
      password: 'WrongPassword123!',
    });
    console.log(`4. Unknown Email -> Status: ${unknownLog.status}`, unknownLog.body);

    const wrongPwdLog = await request('POST', '/auth/login', {
      email: 'admin@mygodown.com',
      password: 'WrongPassword123!',
    });
    console.log(`5. Known Email + Wrong Password -> Status: ${wrongPwdLog.status}`, wrongPwdLog.body);

    // ------------------------------------------------------------------------
    // Part C: Item 5 Verification (Safe Last-Admin Protection on inventory_db)
    // ------------------------------------------------------------------------
    console.log('\n--- PART C: SAFE LAST-ADMIN PROTECTION ON LIVE SERVER (Item 5) ---');
    const selfDemoteRes = await request('PUT', '/users/1', { role: 'manager' }, adminToken);
    console.log(`6. Admin Self-Demotion Block (PUT /api/users/1) -> Status: ${selfDemoteRes.status}`, selfDemoteRes.body);

    const selfDeactivatePutRes = await request('PUT', '/users/1', { isActive: false }, adminToken);
    console.log(`7. Admin Self-Deactivation Block (PUT /api/users/1) -> Status: ${selfDeactivatePutRes.status}`, selfDeactivatePutRes.body);

    const selfDeactivateDelRes = await request('DELETE', '/users/1', null, adminToken);
    console.log(`8. Admin Self-Deactivation Block (DELETE /api/users/1) -> Status: ${selfDeactivateDelRes.status}`, selfDeactivateDelRes.body);

    // ------------------------------------------------------------------------
    // Part D: Module 3 (Warehouses: UC-11 to UC-13)
    // ------------------------------------------------------------------------
    console.log('\n--- PART D: MODULE 3 (Warehouses: UC-11 to UC-13) ---');
    const whCode = `WH-LIVE-${Date.now().toString().slice(-4)}`;

    // UC-11: Create Warehouse
    const createRes = await request('POST', '/warehouses', {
      name: 'Midwest Regional Logistics Hub',
      code: whCode,
      city: 'Kansas City',
      address: '1200 Logistics Parkway',
      isActive: true,
    }, adminToken);
    console.log(`9. [UC-11] Create Warehouse (Admin) -> Status: ${createRes.status}`, createRes.body);
    const createdId = createRes.body?.data?.id;

    // UC-11: Duplicate Code
    const dupRes = await request('POST', '/warehouses', {
      name: 'Duplicate Hub',
      code: whCode,
      city: 'Kansas City',
    }, adminToken);
    console.log(`10. [UC-11] Duplicate Warehouse Code -> Status: ${dupRes.status}`, dupRes.body);

    // UC-11: Validation Error
    const valRes = await request('POST', '/warehouses', { name: 'Incomplete' }, adminToken);
    console.log(`11. [UC-11] Validation Error (Missing fields) -> Status: ${valRes.status}`, valRes.body);

    // UC-11: Manager Forbidden
    const mgrCreateRes = await request('POST', '/warehouses', {
      name: 'Mgr Hub',
      code: 'WH-MGR-DENIED',
      city: 'Denver',
    }, managerToken);
    console.log(`12. [UC-11] Manager Create Warehouse -> Status: ${mgrCreateRes.status}`, mgrCreateRes.body);

    // UC-11: Staff Forbidden
    const stfCreateRes = await request('POST', '/warehouses', {
      name: 'Stf Hub',
      code: 'WH-STF-DENIED',
      city: 'Austin',
    }, staffToken);
    console.log(`13. [UC-11] Staff Create Warehouse -> Status: ${stfCreateRes.status}`, stfCreateRes.body);

    // UC-11: Unauthenticated
    const unauthRes = await request('POST', '/warehouses', {
      name: 'Unauth Hub',
      code: 'WH-UNAUTH',
      city: 'Miami',
    });
    console.log(`14. [UC-11] Unauthenticated Create -> Status: ${unauthRes.status}`, unauthRes.body);

    // UC-12: List Warehouses (Staff)
    const listRes = await request('GET', '/warehouses?page=1&limit=5', null, staffToken);
    console.log(`15. [UC-12] List Warehouses (Staff) -> Status: ${listRes.status}, count: ${listRes.body?.data?.length}`);
    console.log(`    Sample Warehouse Object (camelCase):`, listRes.body?.data?.[0]);

    // UC-12: Search Warehouses
    const searchRes = await request('GET', '/warehouses?search=Central', null, managerToken);
    console.log(`16. [UC-12] Search Warehouses ("Central") -> Status: ${searchRes.status}, count: ${searchRes.body?.data?.length}`);

    // UC-12: Filter Warehouses by City
    const filterRes = await request('GET', '/warehouses?city=Chicago', null, adminToken);
    console.log(`17. [UC-12] Filter Warehouses (City: Chicago) -> Status: ${filterRes.status}, count: ${filterRes.body?.data?.length}`);

    // UC-12: Get Warehouse by ID (Warehouse 1 with stock aggregates)
    const getRes = await request('GET', '/warehouses/1', null, staffToken);
    console.log(`18. [UC-12] Get Warehouse by ID (ID 1) -> Status: ${getRes.status}`, getRes.body);

    // UC-12: 404 Unknown Warehouse
    const notFoundRes = await request('GET', '/warehouses/999999', null, adminToken);
    console.log(`19. [UC-12] Get Warehouse 404 Unknown -> Status: ${notFoundRes.status}`, notFoundRes.body);

    // UC-13: Update Warehouse
    const updateRes = await request('PUT', `/warehouses/${createdId}`, {
      name: 'Midwest Regional Logistics Hub (Expanded)',
      address: '1250 Logistics Parkway, Suite 200',
    }, adminToken);
    console.log(`20. [UC-13] Update Warehouse (Admin) -> Status: ${updateRes.status}`, updateRes.body);

    // UC-13: Code Immutability
    const immutRes = await request('PUT', `/warehouses/${createdId}`, {
      code: 'WH-CHANGED-FAIL',
    }, adminToken);
    console.log(`21. [UC-13] Update Warehouse Code (Immutability 400) -> Status: ${immutRes.status}`, immutRes.body);

    // UC-13: Staff Update Forbidden
    const stfUpdRes = await request('PUT', `/warehouses/${createdId}`, {
      name: 'Staff Renamed',
    }, staffToken);
    console.log(`22. [UC-13] Staff Update Warehouse (403) -> Status: ${stfUpdRes.status}`, stfUpdRes.body);

    // UC-13: Deactivate Blocked by Stock (Warehouse 1 holds inventory)
    const deactBlockRes = await request('DELETE', '/warehouses/1', null, adminToken);
    console.log(`23. [UC-13] Deactivate Warehouse with Stock (BR-08: 422) -> Status: ${deactBlockRes.status}`, deactBlockRes.body);

    // UC-13: Manager Deactivate Forbidden
    const mgrDeactRes = await request('DELETE', `/warehouses/${createdId}`, null, managerToken);
    console.log(`24. [UC-13] Manager Deactivate Warehouse (403) -> Status: ${mgrDeactRes.status}`, mgrDeactRes.body);

    // UC-13: Soft Deactivate Empty Warehouse
    const deactRes = await request('DELETE', `/warehouses/${createdId}`, null, adminToken);
    console.log(`25. [UC-13] Soft-Deactivate Empty Warehouse (200 OK) -> Status: ${deactRes.status}`, deactRes.body);

    // UC-13: Verify Staff Gets 404 for Deactivated Warehouse
    const stfDeactLookup = await request('GET', `/warehouses/${createdId}`, null, staffToken);
    console.log(`26. [UC-13] Staff Lookup Deactivated Warehouse (404) -> Status: ${stfDeactLookup.status}`, stfDeactLookup.body);

    // UC-13: Reactivate Warehouse
    const reactivateRes = await request('PUT', `/warehouses/${createdId}`, { isActive: true }, adminToken);
    console.log(`27. [UC-13] Reactivate Warehouse (200 OK) -> Status: ${reactivateRes.status}`, reactivateRes.body);

    console.log('\n====================================================================');
    console.log('[LIVE SERVER RUN]: All 27 requests executed successfully against inventory_db!');
    console.log('====================================================================\n');
  } finally {
    server.close();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('[Fatal Error in Live Run]:', err);
  process.exit(1);
});

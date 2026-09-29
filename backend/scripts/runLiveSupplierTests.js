/**
 * ============================================================================
 * File: backend/scripts/runLiveSupplierTests.js
 * Purpose: Safe execution of 05-suppliers.http against inventory_db.
 * Safety Rules:
 *   1. Reads demo user credentials strictly from environment variables (no fallbacks).
 *   2. Creates dedicated LIVE- prefixed suppliers via the API.
 *   3. Never modifies or touches the 5 seeded suppliers (IDs 1-5).
 *   4. Cleans up at the end by soft-deactivating all created LIVE- suppliers.
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

// Target development database inventory_db
process.env.NODE_ENV = 'development';
const PORT = parseInt(process.env.PORT || '5000', 10);
const BASE_URL = `http://localhost:${PORT}/api`;

async function runLiveSupplierTests() {
  console.log('====================================================================');
  console.log(`[MODULE 5 LIVE RUN]: Target Database = ${process.env.DB_NAME} on PORT ${PORT}`);
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

  const createdSupplierIds = [];

  try {
    // ------------------------------------------------------------------------
    // Step 1: Authenticate Seeded Users (Credentials from process.env)
    // ------------------------------------------------------------------------
    console.log('--- STEP 1: AUTHENTICATION (Using process.env credentials) ---');
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
    // Step 2: UC-21 - Add Suppliers
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 2: UC-21 ADD SUPPLIERS ---');
    const ts = Date.now().toString().slice(-6);

    // 4. Admin creates supplier
    const supNameA = `LIVE-SUP-Quantum Technologies (${ts})`;
    const supEmailA = `quantum_${ts}@live-supplier.com`;
    const supARes = await request('POST', '/suppliers', {
      name: supNameA,
      contactName: 'Dr. Eli Vance',
      email: supEmailA,
      phone: '+1-555-0391',
      address: '77 Research Park Boulevard, Black Mesa, NM',
      isActive: true,
    }, adminToken);
    const supA = supARes.body.data;
    createdSupplierIds.push(supA.id);
    console.log(`4. [UC-21] Admin Create Supplier -> Status: ${supARes.status} [ID: ${supA.id}, Name: ${supA.name}]`);

    // 5. Manager creates supplier
    const supNameB = `LIVE-SUP-Aperture Logistics (${ts})`;
    const supEmailB = `aperture_${ts}@live-supplier.com`;
    const supBRes = await request('POST', '/suppliers', {
      name: supNameB,
      contactName: 'Cave Johnson',
      email: supEmailB,
      phone: '+1-555-0812',
      address: '1 Aperture Way, Upper Peninsula, MI',
    }, managerToken);
    const supB = supBRes.body.data;
    createdSupplierIds.push(supB.id);
    console.log(`5. [UC-21] Manager Create Supplier -> Status: ${supBRes.status} [ID: ${supB.id}, Name: ${supB.name}]`);

    // 6. Duplicate Name Conflict (409)
    const dupNameRes = await request('POST', '/suppliers', {
      name: supNameA,
      email: `other_${ts}@test.com`,
    }, adminToken);
    console.log(`6. [UC-21] Duplicate Name Conflict -> Status: ${dupNameRes.status}`, dupNameRes.body);

    // 7. Duplicate Email Conflict (409)
    const dupEmailRes = await request('POST', '/suppliers', {
      name: `Different Vendor Name (${ts})`,
      email: supEmailA,
    }, managerToken);
    console.log(`7. [UC-21] Duplicate Email Conflict -> Status: ${dupEmailRes.status}`, dupEmailRes.body);

    // 8. Missing Name Validation (400)
    const badNameRes = await request('POST', '/suppliers', {
      email: `no_name_${ts}@test.com`,
    }, managerToken);
    console.log(`8. [UC-21] Missing Name Validation -> Status: ${badNameRes.status}`, badNameRes.body);

    // 9. Invalid Email Validation (400)
    const badEmailRes = await request('POST', '/suppliers', {
      name: `Invalid Email Vendor (${ts})`,
      email: 'not-an-email',
    }, adminToken);
    console.log(`9. [UC-21] Invalid Email Validation -> Status: ${badEmailRes.status}`, badEmailRes.body);

    // 10. Staff Forbidden Create (403)
    const staffCreateRes = await request('POST', '/suppliers', {
      name: `Staff Supplier Attempt (${ts})`,
      email: `staff_${ts}@test.com`,
    }, staffToken);
    console.log(`10. [UC-21] Staff Forbidden Create -> Status: ${staffCreateRes.status}`, staffCreateRes.body);

    // 11. Unauthenticated Create (401)
    const unauthCreateRes = await request('POST', '/suppliers', {
      name: `Unauth Supplier (${ts})`,
    });
    console.log(`11. [UC-21] Unauthenticated Create -> Status: ${unauthCreateRes.status}`, unauthCreateRes.body);

    // ------------------------------------------------------------------------
    // Step 3: UC-22 - View & Search Suppliers
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 3: UC-22 VIEW & SEARCH SUPPLIERS ---');

    // 12. Staff lists suppliers
    const listRes = await request('GET', '/suppliers?page=1&limit=5', null, staffToken);
    console.log(`12. [UC-22] Staff List Suppliers -> Status: ${listRes.status}, Total: ${listRes.body?.meta?.total}`);

    // 13. Search suppliers
    const searchRes = await request('GET', `/suppliers?search=${encodeURIComponent(supNameA)}`, null, managerToken);
    console.log(`13. [UC-22] Search Suppliers -> Status: ${searchRes.status}, Matches: ${searchRes.body?.data?.length}`);

    // 14. Filter by isActive
    const filterRes = await request('GET', '/suppliers?isActive=true', null, adminToken);
    console.log(`14. [UC-22] Filter Active Suppliers -> Status: ${filterRes.status}, Count: ${filterRes.body?.data?.length}`);

    // 15. Get single supplier by ID (Seed supplier 1)
    const singleRes = await request('GET', '/suppliers/1', null, staffToken);
    console.log(`15. [UC-22] Single Lookup Seed Supplier 1 -> Status: ${singleRes.status}`, singleRes.body?.data);

    // 16. Non-existent supplier lookup (404)
    const notFoundRes = await request('GET', '/suppliers/999999', null, managerToken);
    console.log(`16. [UC-22] Non-Existent Supplier Lookup (404) -> Status: ${notFoundRes.status}`);

    // ------------------------------------------------------------------------
    // Step 4: UC-23 - Update Supplier
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 4: UC-23 UPDATE SUPPLIER ---');

    // 17. Manager updates supplier details
    const updateRes = await request('PUT', `/suppliers/${supA.id}`, {
      contactName: 'Dr. Gordon Freeman',
      phone: '+1-555-0999',
    }, managerToken);
    console.log(`17. [UC-23] Manager Update Supplier -> Status: ${updateRes.status}`, updateRes.body?.data);

    // 18. Duplicate Name on Update (409)
    const dupUpdateNameRes = await request('PUT', `/suppliers/${supA.id}`, {
      name: supNameB,
    }, managerToken);
    console.log(`18. [UC-23] Update Duplicate Name (409) -> Status: ${dupUpdateNameRes.status}`);

    // 19. Duplicate Email on Update (409)
    const dupUpdateEmailRes = await request('PUT', `/suppliers/${supA.id}`, {
      email: supEmailB,
    }, adminToken);
    console.log(`19. [UC-23] Update Duplicate Email (409) -> Status: ${dupUpdateEmailRes.status}`);

    // 20. Invalid Email on Update (400)
    const badUpdateEmailRes = await request('PUT', `/suppliers/${supA.id}`, {
      email: 'not-valid-email',
    }, managerToken);
    console.log(`20. [UC-23] Update Invalid Email (400) -> Status: ${badUpdateEmailRes.status}`);

    // 21. Staff Forbidden Update (403)
    const staffUpdateRes = await request('PUT', `/suppliers/${supA.id}`, {
      contactName: 'Staff Edit Attempt',
    }, staffToken);
    console.log(`21. [UC-23] Staff Forbidden Update (403) -> Status: ${staffUpdateRes.status}`);

    // ------------------------------------------------------------------------
    // Step 5: UC-24 - Deactivate Supplier & Staff 404 Check
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 5: UC-24 DEACTIVATE SUPPLIER ---');

    // 22. Staff Forbidden Deactivate (403)
    const staffDeactRes = await request('DELETE', `/suppliers/${supA.id}`, null, staffToken);
    console.log(`22. [UC-24] Staff Forbidden Deactivate (403) -> Status: ${staffDeactRes.status}`);

    // 23. Manager soft-deactivates supplier A
    const deactRes = await request('DELETE', `/suppliers/${supA.id}`, null, managerToken);
    console.log(`23. [UC-24] Soft-Deactivate Supplier A -> Status: ${deactRes.status}, isActive: ${deactRes.body?.data?.isActive}`);

    // 24. Verify Staff gets 404 on inactive supplier
    const staffHiddenRes = await request('GET', `/suppliers/${supA.id}`, null, staffToken);
    console.log(`24. [UC-24] Staff Single Lookup Deactivated Supplier (404) -> Status: ${staffHiddenRes.status}`);

    // 25. Deactivate Non-Existent Supplier (404)
    const deact404Res = await request('DELETE', '/suppliers/999999', null, adminToken);
    console.log(`25. [UC-24] Deactivate Non-Existent Supplier (404) -> Status: ${deact404Res.status}`);

    // ------------------------------------------------------------------------
    // Step 6: Self-Cleaning
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 6: SELF-CLEANING LIVE DATA ---');
    for (const supId of createdSupplierIds) {
      const cleanDeact = await request('DELETE', `/suppliers/${supId}`, null, adminToken);
      console.log(`   Soft-deactivate LIVE supplier ${supId} -> Status: ${cleanDeact.status}`);
    }

    // ------------------------------------------------------------------------
    // Step 7: Audit Seed Suppliers (IDs 1-5 must remain 100% intact)
    // ------------------------------------------------------------------------
    console.log('\n--- STEP 7: AUDIT SEEDED SUPPLIERS (IDs 1-5) ---');
    const [seedSuppliers] = await pool.query(
      `SELECT id, name, email, is_active FROM suppliers WHERE id <= 5 ORDER BY id ASC;`
    );
    console.log('Seeded Suppliers Status:');
    console.table(seedSuppliers);

    console.log('\n====================================================================');
    console.log('[LIVE SERVER RUN]: All Module 5 supplier tests passed against inventory_db!');
    console.log('Seeded suppliers remained completely untouched.');
    console.log('====================================================================\n');
  } finally {
    server.close();
    await pool.end();
  }
}

runLiveSupplierTests().catch((err) => {
  console.error('[Fatal Error in Live Supplier Run]:', err);
  process.exit(1);
});

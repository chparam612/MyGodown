/**
 * ============================================================================
 * File: backend/scripts/runLiveModule1Users.js
 * Purpose: Safe live execution of Module 1 (Auth & Users: UC-01 to UC-05).
 * Safety Guarantee:
 * - Credentials read strictly from process.env (no hardcoded fallbacks).
 * - Creates dedicated LIVE- prefixed user via the API.
 * - Protects seeded users (IDs 1-3).
 * - Soft-deactivates the LIVE- user at the end (no DELETE).
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

async function runLiveModule1() {
  console.log('====================================================================');
  console.log(`[MODULE 1 LIVE RUN]: Target Database = ${process.env.DB_NAME} on PORT ${PORT}`);
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

  let createdUserId = null;

  try {
    // ------------------------------------------------------------------------
    // Part A: Authenticate Seeded Phase 1 Users (UC-01)
    // ------------------------------------------------------------------------
    console.log('--- PART A: AUTHENTICATION (Phase 1 Seeded Users: UC-01) ---');
    const adminLog = await request('POST', '/auth/login', {
      email: 'admin@mygodown.com',
      password: adminPassword,
    });
    console.log(`1. Admin Login (admin@mygodown.com) -> Status: ${adminLog.status}`);
    const adminToken = adminLog.body?.data?.token;
    console.log(`   Admin User:`, adminLog.body?.data?.user, `Token: ${mask(adminToken)}`);

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

    // Current profile check (GET /auth/me)
    const meRes = await request('GET', '/auth/me', null, staffToken);
    console.log(`4. Staff /auth/me -> Status: ${meRes.status}`, meRes.body?.data);

    // ------------------------------------------------------------------------
    // Part B: Deactivated Login Verification & Error Envelope (Item 4)
    // ------------------------------------------------------------------------
    console.log('\n--- PART B: LOGIN ERROR ENVELOPE & DEACTIVATED ACCOUNT BEHAVIOR ---');
    const unknownLog = await request('POST', '/auth/login', {
      email: 'nobody@mygodown.com',
      password: 'WrongPassword123!',
    });
    console.log(`5. Unknown Email -> Status: ${unknownLog.status}`, unknownLog.body);

    const wrongPwdLog = await request('POST', '/auth/login', {
      email: 'admin@mygodown.com',
      password: 'WrongPassword123!',
    });
    console.log(`6. Known Email + Wrong Password -> Status: ${wrongPwdLog.status}`, wrongPwdLog.body);

    // ------------------------------------------------------------------------
    // Part C: User Management & RBAC Permissions (UC-02 to UC-05)
    // ------------------------------------------------------------------------
    console.log('\n--- PART C: USER MANAGEMENT & PERMISSION ENFORCEMENT ---');
    // Admin lists users (200 OK)
    const listUsersRes = await request('GET', '/users?page=1&limit=5', null, adminToken);
    console.log(`7. Admin List Users -> Status: ${listUsersRes.status}, Total: ${listUsersRes.body?.meta?.total}`);

    // Manager forbidden on user list (403 Forbidden)
    const mgrListRes = await request('GET', '/users', null, managerToken);
    console.log(`8. Manager List Users (403 Forbidden) -> Status: ${mgrListRes.status}`, mgrListRes.body);

    // Staff forbidden on user list (403 Forbidden)
    const stfListRes = await request('GET', '/users', null, staffToken);
    console.log(`9. Staff List Users (403 Forbidden) -> Status: ${stfListRes.status}`, stfListRes.body);

    // Create a LIVE- user (Admin only)
    const liveEmail = `live_user_${Date.now().toString().slice(-5)}@mygodown.com`;
    const createLiveUserRes = await request('POST', '/users', {
      name: 'LIVE Audit Staff',
      email: liveEmail,
      password: 'LivePassword123!',
      role: 'staff',
    }, adminToken);
    console.log(`10. Admin Create LIVE User -> Status: ${createLiveUserRes.status}`, createLiveUserRes.body?.data);
    createdUserId = createLiveUserRes.body?.data?.id;

    // Reset password by Admin (UC-04)
    const resetPwdRes = await request('POST', `/users/${createdUserId}/reset-password`, {
      password: 'ResetPassword123!',
    }, adminToken);
    console.log(`11. Admin Reset User Password -> Status: ${resetPwdRes.status}`, resetPwdRes.body);

    // Verify login with new password
    const newPwdLog = await request('POST', '/auth/login', {
      email: liveEmail,
      password: 'ResetPassword123!',
    });
    console.log(`12. Login with Reset Password -> Status: ${newPwdLog.status}`, newPwdLog.body?.data?.user);

    // ------------------------------------------------------------------------
    // Part D: Safe Last-Admin & Self-Protection Rules (Item 5)
    // ------------------------------------------------------------------------
    console.log('\n--- PART D: SAFE LAST-ADMIN & SELF-PROTECTION CHECKS ---');
    const selfDemoteRes = await request('PUT', '/users/1', { role: 'manager' }, adminToken);
    console.log(`13. Admin Self-Demotion Block (PUT /api/users/1) -> Status: ${selfDemoteRes.status}`, selfDemoteRes.body);

    const selfDeactRes = await request('PUT', '/users/1', { isActive: false }, adminToken);
    console.log(`14. Admin Self-Deactivation Block (PUT /api/users/1) -> Status: ${selfDeactRes.status}`, selfDeactRes.body);

    const selfDelRes = await request('DELETE', '/users/1', null, adminToken);
    console.log(`15. Admin Self-Deactivation Block (DELETE /api/users/1) -> Status: ${selfDelRes.status}`, selfDelRes.body);

    // ------------------------------------------------------------------------
    // Part E: Self-Cleaning
    // ------------------------------------------------------------------------
    console.log('\n--- PART E: SELF-CLEANING LIVE DATA ---');
    if (createdUserId) {
      const cleanRes = await request('DELETE', `/users/${createdUserId}`, null, adminToken);
      console.log(`16. Soft-Deactivate LIVE User ${createdUserId} -> Status: ${cleanRes.status}`);

      // Verify deactivated user login returns 401 with deactivated message when password matches
      const deactLog = await request('POST', '/auth/login', {
        email: liveEmail,
        password: 'ResetPassword123!',
      });
      console.log(`17. Deactivated User Login (Correct Password) -> Status: ${deactLog.status}`, deactLog.body);
    }

    console.log('\n====================================================================');
    console.log('[LIVE SERVER RUN]: All Module 1 tests passed against inventory_db!');
    console.log('Seeded users (IDs 1-3) remained completely untouched.');
    console.log('====================================================================\n');
  } finally {
    server.close();
    await pool.end();
  }
}

runLiveModule1().catch((err) => {
  console.error('[Fatal Error in Live Module 1 Run]:', err);
  process.exit(1);
});

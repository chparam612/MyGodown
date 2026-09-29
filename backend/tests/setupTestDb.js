/**
 * ============================================================================
 * File: backend/tests/setupTestDb.js
 * Purpose: Prepares dedicated test database (inventory_test_db) for Jest testing.
 * Why it exists: Enforces isolation so integration tests NEVER execute against
 * or mutate the live development database (inventory_db).
 *
 * SAFETY GUARD:
 * Explicitly terminates execution if target database equals 'inventory_db'.
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');
const repoDir = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(backendDir, '.env') });

const testDbName = process.env.DB_TEST_NAME || 'inventory_test_db';
const prodDbName = process.env.DB_NAME || 'inventory_db';

// SAFETY GUARD: Refuse to execute against development/production database
if (!testDbName || testDbName === prodDbName || testDbName === 'inventory_db') {
  console.error(`[FATAL SAFETY GUARD]: Test database name '${testDbName}' equals development database '${prodDbName}'. Aborting test database setup.`);
  process.exit(1);
}

export async function setupTestDatabase() {
  const rootConn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  try {
    // 1. Ensure test database exists
    await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${testDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await rootConn.query(`USE \`${testDbName}\`;`);

    // 2. Read and apply schema.sql
    const schemaSql = fs.readFileSync(path.join(repoDir, 'database/schema.sql'), 'utf8')
      .replace(/USE inventory_db;/g, `USE \`${testDbName}\`;`)
      .replace(/CREATE DATABASE IF NOT EXISTS inventory_db/g, `CREATE DATABASE IF NOT EXISTS \`${testDbName}\``);
    await rootConn.query(schemaSql);

    // 3. Read and apply 002_orders.sql migration
    const migrationSql = fs.readFileSync(path.join(repoDir, 'database/migrations/002_orders.sql'), 'utf8')
      .replace(/USE inventory_db;/g, `USE \`${testDbName}\`;`)
      .replace(/'inventory_db'/g, `'${testDbName}'`);
    await rootConn.query(migrationSql);

    // 4. Clean dynamically created test fixtures from prior runs (keep seed records intact)
    await rootConn.query(`DELETE FROM purchase_order_items;`);
    await rootConn.query(`DELETE FROM purchase_orders;`);
    await rootConn.query(`DELETE FROM stock_movements WHERE id > 0;`);
    await rootConn.query(`DELETE FROM stock_levels WHERE product_id > 20 OR warehouse_id > 3;`);
    await rootConn.query(`DELETE FROM products WHERE id > 20;`);
    await rootConn.query(`DELETE FROM suppliers WHERE id > 5;`);
    await rootConn.query(`DELETE FROM warehouses WHERE id > 3;`);
    await rootConn.query(`DELETE FROM users WHERE id > 4;`);

    // 5. Read and apply seed.sql
    const seedSql = fs.readFileSync(path.join(repoDir, 'database/seed.sql'), 'utf8')
      .replace(/USE inventory_db;/g, `USE \`${testDbName}\`;`);
    await rootConn.query(seedSql);

    // Drop legacy UNIQUE constraints from test DB suppliers table to reflect application-level rules
    try {
      await rootConn.query(`ALTER TABLE \`${testDbName}\`.suppliers DROP INDEX name;`);
    } catch (_) {}
    try {
      await rootConn.query(`ALTER TABLE \`${testDbName}\`.suppliers DROP INDEX email;`);
    } catch (_) {}
    try {
      await rootConn.query(`ALTER TABLE \`${testDbName}\`.suppliers DROP INDEX uq_suppliers_name;`);
    } catch (_) {}

    const testUsersSql = `
      INSERT INTO users (id, name, email, password_hash, role, is_active) VALUES
      (1, 'Test Admin', 'admin@test.com', '$2b$10$zImGWrIP4TXaXyeCIyH45.5CXp28gtnitF9ziqOM6Ncfjcwi/MxYC', 'admin', 1),
      (2, 'Test Manager', 'manager@test.com', '$2b$10$zImGWrIP4TXaXyeCIyH45.5CXp28gtnitF9ziqOM6Ncfjcwi/MxYC', 'manager', 1),
      (3, 'Test Staff', 'staff@test.com', '$2b$10$zImGWrIP4TXaXyeCIyH45.5CXp28gtnitF9ziqOM6Ncfjcwi/MxYC', 'staff', 1),
      (4, 'Deactivated User', 'inactive@test.com', '$2b$10$zImGWrIP4TXaXyeCIyH45.5CXp28gtnitF9ziqOM6Ncfjcwi/MxYC', 'staff', 0)
      ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), role = VALUES(role), is_active = VALUES(is_active);
    `;
    await rootConn.query(testUsersSql);

    return true;
  } finally {
    await rootConn.end();
  }
}

// Allow direct CLI invocation
if (process.argv[1] && process.argv[1].endsWith('setupTestDb.js')) {
  setupTestDatabase()
    .then(() => {
      console.log(`[setupTestDb] Successfully prepared test database '${testDbName}'.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[setupTestDb Fatal Error]:', err);
      process.exit(1);
    });
}

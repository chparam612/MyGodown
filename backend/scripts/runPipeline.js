/**
 * ============================================================================
 * File: backend/scripts/runPipeline.js
 * Purpose: Executes Phase 1 database pipeline: Step 4 (setup), Step 5 (verification),
 * and Step 6 (idempotency re-run).
 * Why it exists: Automates DDL/seed/user-seeding execution and collects raw outputs.
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');
const repoDir = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(backendDir, '.env') });

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true,
};

async function execute() {
  console.log('=== STEP 4: DATABASE SETUP & SEED EXECUTION ===\n');

  // 4a. Create database if missing
  let conn = await mysql.createConnection(config);
  console.log('[4a] Ensuring inventory_db exists...');
  await conn.query('CREATE DATABASE IF NOT EXISTS inventory_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
  await conn.query('USE inventory_db;');
  console.log('[4a] Database inventory_db ready.\n');

  // 4b. schema.sql
  console.log('[4b] Applying database/schema.sql...');
  const schemaSql = fs.readFileSync(path.join(repoDir, 'database/schema.sql'), 'utf8');
  await conn.query(schemaSql);
  console.log('[4b] schema.sql executed successfully.\n');

  // 4c. seed.sql
  console.log('[4c] Applying database/seed.sql...');
  const seedSql = fs.readFileSync(path.join(repoDir, 'database/seed.sql'), 'utf8');
  await conn.query(seedSql);
  console.log('[4c] seed.sql executed successfully.\n');

  // 4d. npm run seed:users
  console.log('[4d] Running npm run seed:users from backend/...');
  const seedUsersOutput = execSync('npm run seed:users', { cwd: backendDir, encoding: 'utf8' });
  console.log(seedUsersOutput.trim());
  console.log('[4d] seed:users completed.\n');

  console.log('=== STEP 5: VERIFICATION & AUDIT ===\n');

  // SHOW TABLES
  console.log('--- [5.1] SHOW TABLES; ---');
  const [tables] = await conn.query('SHOW TABLES;');
  for (const row of tables) {
    console.log(`  - ${Object.values(row)[0]}`);
  }

  // Row counts
  console.log('\n--- [5.2] TABLE ROW COUNTS ---');
  const countTables = ['warehouses', 'suppliers', 'products', 'users', 'stock_levels', 'stock_movements'];
  for (const t of countTables) {
    const [[res]] = await conn.query(`SELECT COUNT(*) as count FROM ${t};`);
    console.log(`  ${t.padEnd(16)}: ${res.count}`);
  }

  // SHOW CREATE TABLE stock_levels
  console.log('\n--- [5.3] SHOW CREATE TABLE stock_levels; ---');
  const [[createTable]] = await conn.query('SHOW CREATE TABLE stock_levels;');
  console.log(createTable['Create Table']);

  // SELECT id, email, role, is_active FROM users; (No password hashes)
  console.log('\n--- [5.4] USERS (SELECT id, email, role, is_active FROM users;) ---');
  const [users] = await conn.query('SELECT id, email, role, is_active FROM users;');
  console.table(users);

  // Negative test: quantity = -1
  console.log('--- [5.5] NEGATIVE TEST: UPDATE stock_levels SET quantity = -1 ---');
  await conn.beginTransaction();
  try {
    await conn.execute('UPDATE stock_levels SET quantity = -1 WHERE id = 1;');
    await conn.rollback();
    console.log('FAILED: Negative quantity unexpectedly succeeded!');
  } catch (err) {
    await conn.rollback();
    console.log('SUCCESS: Update rejected by CHECK constraint:');
    console.log(`  Error Code: ${err.code}`);
    console.log(`  Error No:   ${err.errno}`);
    console.log(`  SQLState:   ${err.sqlState}`);
    console.log(`  Message:    ${err.message}`);
  }

  console.log('\n=== STEP 6: IDEMPOTENCY TEST (SECOND RUN) ===\n');
  console.log('[6a] Re-running schema.sql...');
  await conn.query(schemaSql);
  console.log('[6b] Re-running seed.sql...');
  await conn.query(seedSql);
  console.log('[6c] Re-running npm run seed:users...');
  const seedUsersOutput2 = execSync('npm run seed:users', { cwd: backendDir, encoding: 'utf8' });
  console.log(seedUsersOutput2.trim());

  console.log('\n--- [6.4] POST-RE-RUN ROW COUNTS (MUST BE IDENTICAL) ---');
  for (const t of countTables) {
    const [[res]] = await conn.query(`SELECT COUNT(*) as count FROM ${t};`);
    console.log(`  ${t.padEnd(16)}: ${res.count}`);
  }

  await conn.end();
  console.log('\n=== PHASE 1 EXECUTION COMPLETE ===');
}

execute().catch(err => {
  console.error('\nEXECUTION FAILED:');
  console.error('Message:', err.message);
  console.error('SQL Message:', err.sqlMessage);
  console.error('Code:', err.code);
  process.exit(1);
});

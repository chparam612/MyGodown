/**
 * ============================================================================
 * File: backend/scripts/seedUsers.js
 * Purpose: Provision baseline user accounts (Admin, Manager, Staff) for RIMS.
 * Why it exists: Seed initial credentials required for role-based authentication.
 *
 * HARD RULES SATISFIED:
 * 1. Passwords hashed using bcryptjs with work factor >= 10.
 * 2. Passwords read exclusively from environment variables (no hardcoded passwords).
 * 3. Zero plaintext passwords or password hashes printed to console/logs.
 * 4. Idempotent: checks by email before inserting; logs 'created' vs 'already exists'.
 * 5. Uses parameterized SQL queries exclusively.
 * 6. Closes connection cleanly and exits non-zero on failure.
 * ============================================================================
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

// Resolve current directory in ES Module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment configuration from backend/.env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Bcrypt work factor (cost factor)
const BCRYPT_ROUNDS = 10;

// Verify presence of required demo password environment variables
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
const managerPassword = process.env.SEED_MANAGER_PASSWORD;
const staffPassword = process.env.SEED_STAFF_PASSWORD;

if (!adminPassword || !managerPassword || !staffPassword) {
  console.error('[seed:users Error]: Missing required seed password environment variables.');
  console.error('Please ensure the following keys are set in backend/.env:');
  console.error('  - SEED_ADMIN_PASSWORD');
  console.error('  - SEED_MANAGER_PASSWORD');
  console.error('  - SEED_STAFF_PASSWORD');
  process.exit(1);
}

// User definitions to seed
const USERS_TO_SEED = [
  {
    name: 'System Administrator',
    email: 'admin@mygodown.com',
    role: 'admin',
    plainPassword: adminPassword,
  },
  {
    name: 'Warehouse Manager',
    email: 'manager@mygodown.com',
    role: 'manager',
    plainPassword: managerPassword,
  },
  {
    name: 'Inventory Staff',
    email: 'staff@mygodown.com',
    role: 'staff',
    plainPassword: staffPassword,
  },
];

async function seedUsers() {
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'inventory_db',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  };

  console.log(`[seed:users] Connecting to database '${dbConfig.database}' on ${dbConfig.host}:${dbConfig.port}...`);
  let connection;

  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('[seed:users] Database connection established.');

    for (const user of USERS_TO_SEED) {
      // Check if user already exists (parameterized query)
      const [existing] = await connection.execute(
        'SELECT id, email, role, is_active FROM users WHERE email = ?',
        [user.email]
      );

      if (existing.length > 0) {
        console.log(`[seed:users] User already exists: ${user.email} (Role: ${existing[0].role}, Status: ${existing[0].is_active ? 'Active' : 'Inactive'})`);
      } else {
        // Hash password with bcryptjs
        const passwordHash = await bcrypt.hash(user.plainPassword, BCRYPT_ROUNDS);

        // Insert new user record (parameterized query)
        await connection.execute(
          'INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)',
          [user.name, user.email, passwordHash, user.role]
        );
        console.log(`[seed:users] User created: ${user.email} (Role: ${user.role})`);
      }
    }

    console.log('[seed:users] User seeding finished successfully.');
  } catch (error) {
    console.error('[seed:users Error]: Seeding operation failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('[seed:users] Database connection closed cleanly.');
    }
  }
}

seedUsers();

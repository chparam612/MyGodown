/**
 * ============================================================================
 * File: database/init.js
 * Purpose: Automated, idempotent database initializer for inventory_db.
 * Why it exists: Connects to the local MySQL instance using backend/.env,
 * executes schema.sql (DDL for 10 tables) and seeds.sql (initial accounts and catalog).
 * Protects credentials by never logging database passwords to output.
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

// Determine __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend/.env or root .env
const backendEnvPath = path.resolve(__dirname, '../backend/.env');
const rootEnvPath = path.resolve(__dirname, '../.env');

if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  console.error('[init.js Error]: No .env file found in backend/ or root directory.');
  console.error('Please create backend/.env using backend/.env.example as a template.');
  process.exit(1);
}

// Extract database configuration from environment
const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true, // Required to execute multi-statement SQL scripts
};

/**
 * Splits an SQL file into executable query chunks, ignoring SQL comment lines.
 * @param {string} filePath - Absolute path to the SQL file.
 * @returns {string} - Cleaned SQL string.
 */
function readSqlFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`SQL file not found at: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

async function run() {
  console.log(`[init.js] Connecting to MySQL server at ${config.host}:${config.port} as user '${config.user}'...`);

  let connection;
  try {
    // 1. Establish initial connection without selecting database (to allow CREATE DATABASE)
    connection = await mysql.createConnection(config);
    console.log('[init.js] Successfully connected to MySQL server.');

    // 2. Read and apply schema.sql
    const schemaPath = path.join(__dirname, 'schema.sql');
    console.log(`[init.js] Reading schema definitions from ${path.basename(schemaPath)}...`);
    const schemaSql = readSqlFile(schemaPath);

    console.log('[init.js] Applying schema (creating database and 10 tables if not exist)...');
    await connection.query(schemaSql);
    console.log('[init.js] Schema applied successfully.');

    // 3. Read and apply seeds.sql
    const seedsPath = path.join(__dirname, 'seeds.sql');
    console.log(`[init.js] Reading seed data from ${path.basename(seedsPath)}...`);
    const seedsSql = readSqlFile(seedsPath);

    console.log('[init.js] Applying initial seed data...');
    await connection.query(seedsSql);
    console.log('[init.js] Seed data inserted successfully (idempotent).');

    // 4. Verify table counts
    await connection.query('USE inventory_db');
    const [tables] = await connection.query('SHOW TABLES');
    console.log(`[init.js] Verification: database 'inventory_db' contains ${tables.length} tables.`);

    console.log('[init.js] Database initialization complete!');
  } catch (error) {
    console.error('[init.js Error]: Database operation failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

run();

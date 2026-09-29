/**
 * ============================================================================
 * File: backend/src/config/db.js
 * Purpose: MySQL connection pool and transaction management using mysql2/promise.
 * Why it exists: Provides thread-safe connection pooling, query helpers, and
 * ACID transaction wrapper withTransaction() that ensures connection release.
 * ============================================================================
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure .env is loaded
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const isTest = process.env.NODE_ENV === 'test';
const targetDatabase = isTest
  ? (process.env.DB_TEST_NAME || 'inventory_test_db')
  : (process.env.DB_NAME || 'inventory_db');

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: targetDatabase,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  decimalNumbers: true, // Auto-convert DECIMAL fields to JavaScript numbers when safe
});

/**
 * Executes a parameterized query using pool.
 * @param {string} sql - Parameterized SQL string
 * @param {Array} [params] - Query parameters
 * @returns {Promise<[Array, Array]>}
 */
export async function query(sql, params = []) {
  return pool.query(sql, params);
}

/**
 * Executes a prepared statement using pool.
 * @param {string} sql - Parameterized SQL string
 * @param {Array} [params] - Prepared statement parameters
 * @returns {Promise<[Array, Array]>}
 */
export async function execute(sql, params = []) {
  return pool.execute(sql, params);
}

/**
 * Executes operations inside an ACID transaction with automatic commit/rollback.
 * Releases the acquired connection back to the pool in all circumstances.
 * @template T
 * @param {(connection: mysql.PoolConnection) => Promise<T>} callback
 * @returns {Promise<T>}
 */
export async function withTransaction(callback) {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  try {
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Performs a lightweight database connectivity check.
 * @returns {Promise<boolean>}
 */
export async function checkDbHealth() {
  const [rows] = await pool.query('SELECT 1 AS healthy;');
  return rows && rows.length > 0 && rows[0].healthy === 1;
}

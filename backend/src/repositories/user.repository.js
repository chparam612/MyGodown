/**
 * ============================================================================
 * File: backend/src/repositories/user.repository.js
 * Purpose: Data Access Object for the users table.
 * Why it exists: Encapsulates all raw parameterized SQL queries for user
 * records, keeping controllers and services decoupled from database implementation.
 * ============================================================================
 */

import { execute, query } from '../config/db.js';

export class UserRepository {
  /**
   * Helper to format raw database user row to camelCase response format.
   */
  _formatUser(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      isActive: Boolean(row.is_active !== undefined ? row.is_active : row.isActive),
      createdAt: row.created_at || row.createdAt,
      updatedAt: row.updated_at || row.updatedAt,
    };
  }

  /**
   * Finds a user by email, including password_hash for authentication comparisons.
   */
  async findByEmailWithPassword(email) {
    const [rows] = await execute(
      'SELECT id, name, email, password_hash, role, is_active, created_at, updated_at FROM users WHERE email = ? LIMIT 1;',
      [email]
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      password_hash: r.password_hash,
      role: r.role,
      isActive: Boolean(r.is_active),
      is_active: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  /**
   * Finds a user by ID, excluding password_hash.
   */
  async findById(id) {
    const [rows] = await execute(
      'SELECT id, name, email, role, is_active, created_at, updated_at FROM users WHERE id = ? LIMIT 1;',
      [id]
    );
    return this._formatUser(rows[0]);
  }

  /**
   * Finds a user by ID, including password_hash (for password changes/resets).
   */
  async findByIdWithPassword(id) {
    const [rows] = await execute(
      'SELECT id, name, email, password_hash, role, is_active, created_at, updated_at FROM users WHERE id = ? LIMIT 1;',
      [id]
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      password_hash: r.password_hash,
      role: r.role,
      isActive: Boolean(r.is_active),
      is_active: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  /**
   * Creates a new user record.
   */
  async create({ name, email, passwordHash, role, isActive = 1 }) {
    const [result] = await execute(
      'INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?);',
      [name, email, passwordHash, role, isActive ? 1 : 0]
    );
    return this.findById(result.insertId);
  }

  /**
   * Updates an existing user record with dynamic parameterized fields.
   */
  async update(id, fields) {
    const updates = [];
    const params = [];

    if (fields.name !== undefined) {
      updates.push('name = ?');
      params.push(fields.name);
    }
    if (fields.email !== undefined) {
      updates.push('email = ?');
      params.push(fields.email);
    }
    if (fields.role !== undefined) {
      updates.push('role = ?');
      params.push(fields.role);
    }
    const activeVal = fields.is_active !== undefined ? fields.is_active : fields.isActive;
    if (activeVal !== undefined) {
      updates.push('is_active = ?');
      params.push(activeVal ? 1 : 0);
    }
    if (fields.passwordHash !== undefined) {
      updates.push('password_hash = ?');
      params.push(fields.passwordHash);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    params.push(id);
    await execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?;`,
      params
    );

    return this.findById(id);
  }

  /**
   * Lists users with search, role, and active status filters, plus pagination.
   */
  async findAll({ role, isActive, search, offset = 0, limit = 20 }) {
    const conditions = [];
    const params = [];

    if (role) {
      conditions.push('role = ?');
      params.push(role);
    }
    if (isActive !== undefined) {
      conditions.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }
    if (search) {
      conditions.push('(name LIKE ? OR email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total count query
    const [countRows] = await execute(
      `SELECT COUNT(*) as total FROM users ${whereClause};`,
      params
    );
    const total = countRows[0].total;

    // Paginated results (safe integers for LIMIT and OFFSET)
    params.push(Number(limit), Number(offset));
    const [rows] = await execute(
      `SELECT id, name, email, role, is_active, created_at, updated_at
       FROM users
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?;`,
      params
    );

    return { users: rows.map((r) => this._formatUser(r)), total };
  }

  /**
   * Counts active administrators to enforce last active admin protection.
   */
  async countActiveAdmins() {
    const [rows] = await execute(
      "SELECT COUNT(*) as total FROM users WHERE role = 'admin' AND is_active = 1;"
    );
    return rows[0].total;
  }
}

export const userRepository = new UserRepository();

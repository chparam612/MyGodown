/**
 * ============================================================================
 * File: backend/src/repositories/supplier.repository.js
 * Purpose: Data Access Object for suppliers table.
 * Why it exists: Encapsulates all raw parameterized SQL queries for supplier
 * records, keeping controllers and services decoupled from database implementation.
 * ============================================================================
 */

import { execute } from '../config/db.js';

export class SupplierRepository {
  /**
   * Finds a supplier by its primary key ID, including productCount.
   * @param {number} id - Supplier ID
   * @returns {Promise<Object|null>}
   */
  async findById(id) {
    const [rows] = await execute(
      `SELECT 
        s.id, 
        s.name, 
        s.contact_name AS contactName, 
        s.email, 
        s.phone, 
        s.address, 
        s.is_active AS isActive, 
        (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id) AS productCount,
        s.created_at AS createdAt, 
        s.updated_at AS updatedAt 
      FROM suppliers s 
      WHERE s.id = ? 
      LIMIT 1;`,
      [id]
    );

    if (!rows || rows.length === 0) return null;

    const row = rows[0];
    return {
      id: row.id,
      name: row.name,
      contactName: row.contactName,
      email: row.email,
      phone: row.phone,
      address: row.address,
      isActive: Boolean(row.isActive),
      productCount: parseInt(row.productCount || 0, 10),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Finds a supplier by exact unique name.
   * @param {string} name - Supplier name
   * @returns {Promise<Object|null>}
   */
  async findByName(name) {
    const [rows] = await execute(
      `SELECT id, name, contact_name AS contactName, email, phone, address, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt 
       FROM suppliers 
       WHERE name = ? 
       LIMIT 1;`,
      [name]
    );

    if (!rows || rows.length === 0) return null;
    return {
      ...rows[0],
      isActive: Boolean(rows[0].isActive),
    };
  }

  /**
   * Finds a supplier by exact unique email.
   * @param {string} email - Supplier email
   * @returns {Promise<Object|null>}
   */
  async findByEmail(email) {
    if (!email) return null;
    const [rows] = await execute(
      `SELECT id, name, contact_name AS contactName, email, phone, address, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt 
       FROM suppliers 
       WHERE email = ? 
       LIMIT 1;`,
      [email]
    );

    if (!rows || rows.length === 0) return null;
    return {
      ...rows[0],
      isActive: Boolean(rows[0].isActive),
    };
  }

  /**
   * Checks if a supplier exists and is currently active.
   * @param {number} id - Supplier ID
   * @returns {Promise<boolean>}
   */
  async isActiveSupplier(id) {
    const [rows] = await execute(
      'SELECT is_active FROM suppliers WHERE id = ? LIMIT 1;',
      [id]
    );
    if (!rows || rows.length === 0) return false;
    return Boolean(rows[0].is_active);
  }

  /**
   * Counts open purchase orders for a supplier (status in 'draft' or 'ordered').
   * @param {number} supplierId
   * @returns {Promise<number>}
   */
  async countOpenPurchaseOrders(supplierId) {
    const [rows] = await execute(
      `SELECT COUNT(*) AS openCount 
       FROM purchase_orders 
       WHERE supplier_id = ? AND status IN ('draft', 'ordered');`,
      [supplierId]
    );
    return parseInt(rows[0]?.openCount || 0, 10);
  }

  /**
   * Counts total linked products referencing this supplier.
   * @param {number} supplierId
   * @returns {Promise<{ total: number, active: number }>}
   */
  async countLinkedProducts(supplierId) {
    const [rows] = await execute(
      `SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active
       FROM products 
       WHERE supplier_id = ?;`,
      [supplierId]
    );
    return {
      total: parseInt(rows[0]?.total || 0, 10),
      active: parseInt(rows[0]?.active || 0, 10),
    };
  }

  /**
   * UC-22: Finds suppliers with pagination, searching, and filtering.
   */
  async findAll({ page = 1, limit = 20, search, isActive, sortBy = 'name', sortOrder = 'asc' }) {
    const conditions = [];
    const countParams = [];
    const dataParams = [];

    if (isActive !== undefined && isActive !== null) {
      conditions.push('s.is_active = ?');
      const val = isActive ? 1 : 0;
      countParams.push(val);
      dataParams.push(val);
    }

    if (search && search.trim() !== '') {
      conditions.push('(s.name LIKE ? OR s.email LIKE ? OR s.contact_name LIKE ?)');
      const pattern = `%${search.trim()}%`;
      countParams.push(pattern, pattern, pattern);
      dataParams.push(pattern, pattern, pattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Sort column whitelist
    const sortColumnMap = {
      id: 's.id',
      name: 's.name',
      email: 's.email',
      contactName: 's.contact_name',
      createdAt: 's.created_at',
      updatedAt: 's.updated_at',
      productCount: 'productCount',
    };
    const orderColumn = sortColumnMap[sortBy] || 's.name';
    const orderDir = String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // Total count
    const [countRows] = await execute(
      `SELECT COUNT(*) AS total FROM suppliers s ${whereClause};`,
      countParams
    );
    const total = parseInt(countRows[0]?.total || 0, 10);

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;
    dataParams.push(limitNum, offset);

    const [rows] = await execute(
      `SELECT 
        s.id, 
        s.name, 
        s.contact_name AS contactName, 
        s.email, 
        s.phone, 
        s.address, 
        s.is_active AS isActive, 
        (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id) AS productCount,
        s.created_at AS createdAt, 
        s.updated_at AS updatedAt 
      FROM suppliers s 
      ${whereClause} 
      ORDER BY ${orderColumn} ${orderDir} 
      LIMIT ? OFFSET ?;`,
      dataParams
    );

    const suppliers = rows.map((r) => ({
      id: r.id,
      name: r.name,
      contactName: r.contactName,
      email: r.email,
      phone: r.phone,
      address: r.address,
      isActive: Boolean(r.isActive),
      productCount: parseInt(r.productCount || 0, 10),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return {
      suppliers,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    };
  }

  /**
   * UC-21: Creates a new supplier.
   */
  async create({ name, contactName = null, email = null, phone = null, address = null, isActive = true }) {
    const [result] = await execute(
      `INSERT INTO suppliers (name, contact_name, email, phone, address, is_active)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [name, contactName, email || null, phone || null, address || null, isActive ? 1 : 0]
    );

    return this.findById(result.insertId);
  }

  /**
   * UC-23: Updates an existing supplier.
   */
  async update(id, fields) {
    const setClauses = [];
    const params = [];

    const fieldMap = {
      name: 'name',
      contactName: 'contact_name',
      email: 'email',
      phone: 'phone',
      address: 'address',
      isActive: 'is_active',
    };

    for (const [key, dbCol] of Object.entries(fieldMap)) {
      if (fields[key] !== undefined) {
        setClauses.push(`${dbCol} = ?`);
        if (key === 'isActive') {
          params.push(fields[key] ? 1 : 0);
        } else {
          params.push(fields[key] === '' ? null : fields[key]);
        }
      }
    }

    if (setClauses.length > 0) {
      params.push(id);
      await execute(
        `UPDATE suppliers SET ${setClauses.join(', ')} WHERE id = ?;`,
        params
      );
    }

    return this.findById(id);
  }
}

export const supplierRepository = new SupplierRepository();
export default supplierRepository;

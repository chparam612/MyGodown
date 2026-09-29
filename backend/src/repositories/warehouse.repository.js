/**
 * ============================================================================
 * File: backend/src/repositories/warehouse.repository.js
 * Purpose: Data Access Object for the warehouses table.
 * Why it exists: Encapsulates all raw parameterized SQL queries for warehouse
 * storage records, stock calculations, and search filtering.
 * ============================================================================
 */

import { execute } from '../config/db.js';

export class WarehouseRepository {
  /**
   * Helper to format raw warehouse row to standardized camelCase response format.
   */
  _formatWarehouse(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      address: row.address || null,
      city: row.city,
      isActive: Boolean(row.is_active !== undefined ? row.is_active : row.isActive),
      totalStock: row.totalStock !== undefined ? parseInt(row.totalStock, 10) : 0,
      productCount: row.productCount !== undefined ? parseInt(row.productCount, 10) : 0,
      createdAt: row.created_at || row.createdAt,
      updatedAt: row.updated_at || row.updatedAt,
    };
  }

  /**
   * Finds a warehouse by its primary key ID including real-time stock aggregates.
   * @param {number} id - Warehouse ID
   * @returns {Promise<Object|null>}
   */
  async findById(id) {
    const [rows] = await execute(
      `SELECT 
        w.id,
        w.name,
        w.code,
        w.address,
        w.city,
        w.is_active,
        w.created_at,
        w.updated_at,
        COALESCE(SUM(sl.quantity), 0) AS totalStock,
        COUNT(DISTINCT CASE WHEN sl.quantity > 0 THEN sl.product_id END) AS productCount
      FROM warehouses w
      LEFT JOIN stock_levels sl ON w.id = sl.warehouse_id
      WHERE w.id = ?
      GROUP BY w.id
      LIMIT 1;`,
      [id]
    );
    return this._formatWarehouse(rows[0]);
  }

  /**
   * Finds a warehouse by its unique natural code.
   * @param {string} code - Warehouse code (e.g., 'WH-CENTRAL')
   * @returns {Promise<Object|null>}
   */
  async findByCode(code) {
    const [rows] = await execute(
      `SELECT id, name, code, address, city, is_active, created_at, updated_at
       FROM warehouses
       WHERE code = ?
       LIMIT 1;`,
      [code]
    );
    return this._formatWarehouse(rows[0]);
  }

  /**
   * Creates a new warehouse record.
   */
  async create({ name, code, address = null, city, isActive = 1 }) {
    const [result] = await execute(
      `INSERT INTO warehouses (name, code, address, city, is_active)
       VALUES (?, ?, ?, ?, ?);`,
      [name, code, address, city, isActive ? 1 : 0]
    );
    return this.findById(result.insertId);
  }

  /**
   * Updates an existing warehouse record with dynamic parameterized fields.
   */
  async update(id, fields) {
    const fieldMap = {
      name: 'name',
      address: 'address',
      city: 'city',
      isActive: 'is_active',
      is_active: 'is_active',
    };

    const updates = [];
    const values = [];

    for (const [key, value] of Object.entries(fields)) {
      if (fieldMap[key] !== undefined) {
        updates.push(`${fieldMap[key]} = ?`);
        if (key === 'isActive' || key === 'is_active') {
          values.push(value ? 1 : 0);
        } else {
          values.push(value);
        }
      }
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    await execute(
      `UPDATE warehouses SET ${updates.join(', ')} WHERE id = ?;`,
      values
    );

    return this.findById(id);
  }

  /**
   * Soft-deactivates a warehouse by setting is_active = 0.
   */
  async softDeactivate(id) {
    await execute('UPDATE warehouses SET is_active = 0 WHERE id = ?;', [id]);
    return this.findById(id);
  }

  /**
   * Calculates total on-hand physical stock quantity held in this warehouse.
   * Used to guard against deactivating a facility holding active inventory (BR-08).
   */
  async getTotalStock(warehouseId) {
    const [rows] = await execute(
      'SELECT COALESCE(SUM(quantity), 0) AS totalStock FROM stock_levels WHERE warehouse_id = ?;',
      [warehouseId]
    );
    return parseInt(rows[0]?.totalStock || 0, 10);
  }

  /**
   * Finds all warehouses matching filters with pagination and metadata.
   */
  async findAll({ page = 1, limit = 20, search, city, isActive, sortBy = 'id', sortOrder = 'asc' }) {
    const conditions = [];
    const countParams = [];
    const dataParams = [];

    if (search && search.trim() !== '') {
      conditions.push('(w.name LIKE ? OR w.code LIKE ? OR w.city LIKE ?)');
      const searchPattern = `%${search.trim()}%`;
      countParams.push(searchPattern, searchPattern, searchPattern);
      dataParams.push(searchPattern, searchPattern, searchPattern);
    }

    if (city && city.trim() !== '') {
      conditions.push('w.city = ?');
      countParams.push(city.trim());
      dataParams.push(city.trim());
    }

    if (isActive !== undefined) {
      conditions.push('w.is_active = ?');
      const activeVal = isActive ? 1 : 0;
      countParams.push(activeVal);
      dataParams.push(activeVal);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 1. Total matching count
    const [countRows] = await execute(
      `SELECT COUNT(*) AS total FROM warehouses w ${whereClause};`,
      countParams
    );
    const total = parseInt(countRows[0].total, 10);

    // Whitelisted sort mapping
    const sortFieldMap = {
      id: 'w.id',
      name: 'w.name',
      code: 'w.code',
      city: 'w.city',
      createdAt: 'w.created_at',
    };
    const orderField = sortFieldMap[sortBy] || 'w.id';
    const orderDir = (sortOrder || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    // 2. Paginated data query
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;
    dataParams.push(limitNum, offset);

    const [rows] = await execute(
      `SELECT 
        w.id,
        w.name,
        w.code,
        w.address,
        w.city,
        w.is_active,
        w.created_at,
        w.updated_at,
        COALESCE(SUM(sl.quantity), 0) AS totalStock,
        COUNT(DISTINCT CASE WHEN sl.quantity > 0 THEN sl.product_id END) AS productCount
      FROM warehouses w
      LEFT JOIN stock_levels sl ON w.id = sl.warehouse_id
      ${whereClause}
      GROUP BY w.id
      ORDER BY ${orderField} ${orderDir}
      LIMIT ? OFFSET ?;`,
      dataParams
    );

    const warehouses = rows.map((r) => this._formatWarehouse(r));
    const totalPages = Math.ceil(total / limitNum) || 1;

    return {
      warehouses,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
    };
  }
}

export const warehouseRepository = new WarehouseRepository();
export default warehouseRepository;

/**
 * ============================================================================
 * File: backend/src/repositories/product.repository.js
 * Purpose: Data Access Object for the products table.
 * Why it exists: Encapsulates all raw parameterized SQL queries for product
 * records, stock calculations, and search filtering.
 * ============================================================================
 */

import { execute } from '../config/db.js';

export class ProductRepository {
  /**
   * Helper to format raw product row with clean numbers and types.
   */
  _formatProduct(row) {
    if (!row) return null;
    return {
      id: row.id,
      sku: row.sku,
      name: row.name,
      description: row.description,
      category: row.category,
      unitPrice: row.unitPrice !== undefined ? parseFloat(row.unitPrice) : undefined,
      costPrice: row.costPrice !== undefined ? parseFloat(row.costPrice) : undefined,
      reorderLevel: row.reorderLevel !== undefined ? parseInt(row.reorderLevel, 10) : undefined,
      supplierId: row.supplierId !== undefined ? parseInt(row.supplierId, 10) : undefined,
      supplierName: row.supplierName || null,
      isActive: Boolean(row.isActive),
      totalStock: row.totalStock !== undefined ? parseInt(row.totalStock, 10) : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Finds a product by its primary key ID.
   * @param {number} id - Product ID
   * @returns {Promise<Object|null>}
   */
  async findById(id) {
    const [rows] = await execute(
      `SELECT 
        p.id,
        p.sku,
        p.name,
        p.description,
        p.category,
        p.unit_price AS unitPrice,
        p.cost_price AS costPrice,
        p.reorder_level AS reorderLevel,
        p.supplier_id AS supplierId,
        s.name AS supplierName,
        p.is_active AS isActive,
        p.created_at AS createdAt,
        p.updated_at AS updatedAt,
        COALESCE(SUM(sl.quantity), 0) AS totalStock
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN stock_levels sl ON p.id = sl.product_id
      WHERE p.id = ?
      GROUP BY p.id
      LIMIT 1;`,
      [id]
    );
    return this._formatProduct(rows[0]);
  }

  /**
   * Finds a product by its unique SKU code.
   * @param {string} sku - Product SKU
   * @returns {Promise<Object|null>}
   */
  async findBySku(sku) {
    const [rows] = await execute(
      `SELECT 
        p.id,
        p.sku,
        p.name,
        p.description,
        p.category,
        p.unit_price AS unitPrice,
        p.cost_price AS costPrice,
        p.reorder_level AS reorderLevel,
        p.supplier_id AS supplierId,
        s.name AS supplierName,
        p.is_active AS isActive,
        p.created_at AS createdAt,
        p.updated_at AS updatedAt
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.sku = ?
      LIMIT 1;`,
      [sku]
    );
    return this._formatProduct(rows[0]);
  }

  /**
   * Creates a new product record.
   */
  async create({ sku, name, description = null, category = 'General', unitPrice, costPrice = 0.00, reorderLevel = 0, supplierId, isActive = 1 }) {
    const [result] = await execute(
      `INSERT INTO products (sku, name, description, category, unit_price, cost_price, reorder_level, supplier_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        sku,
        name,
        description,
        category,
        unitPrice,
        costPrice,
        reorderLevel,
        supplierId,
        isActive ? 1 : 0,
      ]
    );
    return this.findById(result.insertId);
  }

  /**
   * Updates an existing product record dynamically with parameterized fields.
   */
  async update(id, fields) {
    const fieldMap = {
      name: 'name',
      description: 'description',
      category: 'category',
      unitPrice: 'unit_price',
      costPrice: 'cost_price',
      reorderLevel: 'reorder_level',
      supplierId: 'supplier_id',
      isActive: 'is_active',
    };

    const updates = [];
    const values = [];

    for (const [key, value] of Object.entries(fields)) {
      if (fieldMap[key] !== undefined) {
        updates.push(`${fieldMap[key]} = ?`);
        if (key === 'isActive') {
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
      `UPDATE products SET ${updates.join(', ')} WHERE id = ?;`,
      values
    );

    return this.findById(id);
  }

  /**
   * Soft deactivates a product by setting is_active = 0.
   */
  async softDeactivate(id) {
    await execute('UPDATE products SET is_active = 0 WHERE id = ?;', [id]);
    return this.findById(id);
  }

  /**
   * Calculates total on-hand stock across all warehouses for a given product.
   */
  async getTotalStock(productId) {
    const [rows] = await execute(
      'SELECT COALESCE(SUM(quantity), 0) AS totalStock FROM stock_levels WHERE product_id = ?;',
      [productId]
    );
    return parseInt(rows[0]?.totalStock || 0, 10);
  }

  /**
   * Finds all products matching filters with pagination and metadata.
   */
  async findAll({ page = 1, limit = 10, search, category, supplierId, isActive, sortBy = 'id', sortOrder = 'asc' }) {
    const conditions = [];
    const countParams = [];
    const dataParams = [];

    if (search && search.trim() !== '') {
      conditions.push('(p.name LIKE ? OR p.sku LIKE ?)');
      const searchPattern = `%${search.trim()}%`;
      countParams.push(searchPattern, searchPattern);
      dataParams.push(searchPattern, searchPattern);
    }

    if (category) {
      conditions.push('p.category = ?');
      countParams.push(category);
      dataParams.push(category);
    }

    if (supplierId !== undefined) {
      conditions.push('p.supplier_id = ?');
      countParams.push(supplierId);
      dataParams.push(supplierId);
    }

    if (isActive !== undefined) {
      conditions.push('p.is_active = ?');
      const activeVal = isActive ? 1 : 0;
      countParams.push(activeVal);
      dataParams.push(activeVal);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 1. Total matching count
    const [countRows] = await execute(
      `SELECT COUNT(*) AS total FROM products p ${whereClause};`,
      countParams
    );
    const total = parseInt(countRows[0].total, 10);

    // Whitelisted sort mapping
    const sortFieldMap = {
      name: 'p.name',
      sku: 'p.sku',
      unitPrice: 'p.unit_price',
      costPrice: 'p.cost_price',
      category: 'p.category',
      reorderLevel: 'p.reorder_level',
      createdAt: 'p.created_at',
      id: 'p.id',
    };
    const orderField = sortFieldMap[sortBy] || 'p.id';
    const orderDir = (sortOrder || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    // 2. Paginated data query
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const offset = (pageNum - 1) * limitNum;
    dataParams.push(limitNum, offset);

    const [rows] = await execute(
      `SELECT 
        p.id,
        p.sku,
        p.name,
        p.description,
        p.category,
        p.unit_price AS unitPrice,
        p.cost_price AS costPrice,
        p.reorder_level AS reorderLevel,
        p.supplier_id AS supplierId,
        s.name AS supplierName,
        p.is_active AS isActive,
        p.created_at AS createdAt,
        p.updated_at AS updatedAt,
        COALESCE(SUM(sl.quantity), 0) AS totalStock
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN stock_levels sl ON p.id = sl.product_id
      ${whereClause}
      GROUP BY p.id
      ORDER BY ${orderField} ${orderDir}
      LIMIT ? OFFSET ?;`,
      dataParams
    );

    const products = rows.map((r) => this._formatProduct(r));
    const totalPages = Math.ceil(total / limitNum) || 1;

    return {
      products,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
    };
  }
}

export const productRepository = new ProductRepository();
export default productRepository;

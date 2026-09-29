/**
 * ============================================================================
 * File: backend/src/repositories/salesOrder.repository.js
 * Purpose: Data Access Object for sales_orders and sales_order_items.
 * Why it exists: Encapsulates all raw SQL queries for sales orders and
 * transactional locking, keeping controllers and services cleanly decoupled.
 * ============================================================================
 */

import { execute } from '../config/db.js';

export class SalesOrderRepository {
  /**
   * Generates a collision-safe unique sales order number.
   * Format: SO-YYYYMMDD-XXXX
   * @param {import('mysql2/promise').PoolConnection} [conn]
   * @returns {Promise<string>}
   */
  async generateUniqueSoNumber(conn = null) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    let attempts = 0;
    while (attempts < 10) {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const candidate = `SO-${dateStr}-${randomSuffix}`;
      const query = `SELECT id FROM sales_orders WHERE so_number = ? LIMIT 1;`;
      const [rows] = conn ? await conn.execute(query, [candidate]) : await execute(query, [candidate]);
      if (rows.length === 0) {
        return candidate;
      }
      attempts++;
    }
    return `SO-${dateStr}-${Date.now().toString().slice(-6)}`;
  }

  /**
   * Inserts a new sales order header within an active transaction.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {Object} soData
   * @returns {Promise<number>} Inserted SO ID
   */
  async createSalesOrder(conn, {
    soNumber,
    customerName,
    warehouseId,
    status = 'draft',
    totalAmount = 0,
    notes = null,
    createdBy,
  }) {
    const [result] = await conn.execute(
      `INSERT INTO sales_orders 
        (so_number, customer_name, warehouse_id, status, total_amount, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [soNumber, customerName, warehouseId, status, totalAmount, notes, createdBy]
    );
    return result.insertId;
  }

  /**
   * Batch inserts line items for a sales order within a transaction.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} salesOrderId
   * @param {Array<{ productId: number, quantity: number, unitPrice: number }>} items
   */
  async insertSalesOrderItems(conn, salesOrderId, items) {
    if (!items || items.length === 0) return;

    const values = [];
    const placeholders = [];
    for (const item of items) {
      placeholders.push('(?, ?, ?, ?)');
      values.push(salesOrderId, item.productId, item.quantity, item.unitPrice);
    }

    const query = `INSERT INTO sales_order_items (sales_order_id, product_id, quantity, unit_price) VALUES ${placeholders.join(', ')};`;
    await conn.execute(query, values);
  }

  /**
   * Finds a sales order by ID including line items and joined names.
   * @param {number} id
   * @param {import('mysql2/promise').PoolConnection} [conn]
   * @returns {Promise<Object|null>}
   */
  async findById(id, conn = null) {
    const soQuery = `
      SELECT 
        so.id,
        so.so_number AS soNumber,
        so.customer_name AS customerName,
        so.warehouse_id AS warehouseId,
        w.name AS warehouseName,
        so.status,
        so.total_amount AS totalAmount,
        so.notes,
        so.created_by AS createdBy,
        u.name AS createdByName,
        so.created_at AS createdAt,
        so.updated_at AS updatedAt
      FROM sales_orders so
      JOIN warehouses w ON so.warehouse_id = w.id
      JOIN users u ON so.created_by = u.id
      WHERE so.id = ?
      LIMIT 1;
    `;
    const [soRows] = conn ? await conn.execute(soQuery, [id]) : await execute(soQuery, [id]);
    if (!soRows || soRows.length === 0) return null;

    const so = soRows[0];

    const itemsQuery = `
      SELECT 
        soi.id,
        soi.sales_order_id AS salesOrderId,
        soi.product_id AS productId,
        p.name AS productName,
        p.sku AS productSku,
        soi.quantity,
        soi.unit_price AS unitPrice,
        soi.created_at AS createdAt,
        soi.updated_at AS updatedAt
      FROM sales_order_items soi
      JOIN products p ON soi.product_id = p.id
      WHERE soi.sales_order_id = ?
      ORDER BY soi.id ASC;
    `;
    const [itemRows] = conn ? await conn.execute(itemsQuery, [id]) : await execute(itemsQuery, [id]);

    return {
      id: so.id,
      soNumber: so.soNumber,
      customerName: so.customerName,
      warehouseId: so.warehouseId,
      warehouseName: so.warehouseName,
      status: so.status,
      totalAmount: parseFloat(so.totalAmount),
      notes: so.notes,
      createdBy: so.createdBy,
      createdByName: so.createdByName,
      createdAt: so.createdAt,
      updatedAt: so.updatedAt,
      items: (itemRows || []).map((item) => ({
        id: item.id,
        salesOrderId: item.salesOrderId,
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        quantity: parseInt(item.quantity, 10),
        unitPrice: parseFloat(item.unitPrice),
        subtotal: parseFloat((parseInt(item.quantity, 10) * parseFloat(item.unitPrice)).toFixed(2)),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    };
  }

  /**
   * Retrieves line items for a sales order ordered by product_id ASC.
   * @param {number} salesOrderId
   * @param {import('mysql2/promise').PoolConnection} [conn]
   * @returns {Promise<Array>}
   */
  async findItemsBySoId(salesOrderId, conn = null) {
    const query = `
      SELECT 
        soi.id,
        soi.sales_order_id AS salesOrderId,
        soi.product_id AS productId,
        p.name AS productName,
        p.sku AS productSku,
        soi.quantity,
        soi.unit_price AS unitPrice
      FROM sales_order_items soi
      JOIN products p ON soi.product_id = p.id
      WHERE soi.sales_order_id = ?
      ORDER BY soi.product_id ASC;
    `;
    const [rows] = conn ? await conn.execute(query, [salesOrderId]) : await execute(query, [salesOrderId]);
    return (rows || []).map((r) => ({
      id: r.id,
      salesOrderId: r.salesOrderId,
      productId: r.productId,
      productName: r.productName,
      productSku: r.productSku,
      quantity: parseInt(r.quantity, 10),
      unitPrice: parseFloat(r.unitPrice),
    }));
  }

  /**
   * Locks a sales order row FOR UPDATE inside an active transaction.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async lockSoForUpdate(conn, id) {
    const [rows] = await conn.execute(
      `SELECT id, so_number AS soNumber, customer_name AS customerName, warehouse_id AS warehouseId,
              status, total_amount AS totalAmount, notes, created_by AS createdBy
       FROM sales_orders
       WHERE id = ?
       FOR UPDATE;`,
      [id]
    );

    if (!rows || rows.length === 0) return null;
    return rows[0];
  }

  /**
   * Atomically updates sales order status to 'fulfilled' IF AND ONLY IF current status is 'confirmed'.
   * Returns affectedRows (1 on success, 0 if not confirmed).
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} id
   * @returns {Promise<number>} affectedRows
   */
  async guardedUpdateStatusToFulfilled(conn, id) {
    const [result] = await conn.execute(
      `UPDATE sales_orders 
       SET status = 'fulfilled', updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND status = 'confirmed';`,
      [id]
    );
    return result.affectedRows;
  }

  /**
   * Transitions a draft sales order to 'confirmed'.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} id
   * @returns {Promise<number>} affectedRows
   */
  async updateStatusToConfirmed(conn, id) {
    const [result] = await conn.execute(
      `UPDATE sales_orders 
       SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND status = 'draft';`,
      [id]
    );
    return result.affectedRows;
  }

  /**
   * Transitions a draft or confirmed sales order to 'cancelled'.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} id
   * @returns {Promise<number>} affectedRows
   */
  async updateStatusToCancelled(conn, id) {
    const [result] = await conn.execute(
      `UPDATE sales_orders 
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND status IN ('draft', 'confirmed');`,
      [id]
    );
    return result.affectedRows;
  }

  /**
   * Retrieves paginated sales orders list with optional filters.
   * @param {Object} filters
   * @returns {Promise<Object>}
   */
  async findAll({ page = 1, limit = 20, status, warehouseId, search }) {
    const conditions = [];
    const countParams = [];
    const dataParams = [];

    if (status && status.trim() !== '') {
      conditions.push('so.status = ?');
      countParams.push(status.trim());
      dataParams.push(status.trim());
    }

    if (warehouseId) {
      conditions.push('so.warehouse_id = ?');
      countParams.push(warehouseId);
      dataParams.push(warehouseId);
    }

    if (search && search.trim() !== '') {
      conditions.push('(so.so_number LIKE ? OR so.customer_name LIKE ? OR w.name LIKE ?)');
      const pattern = `%${search.trim()}%`;
      countParams.push(pattern, pattern, pattern);
      dataParams.push(pattern, pattern, pattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await execute(
      `SELECT COUNT(*) AS total 
       FROM sales_orders so
       JOIN warehouses w ON so.warehouse_id = w.id
       ${whereClause};`,
      countParams
    );
    const total = parseInt(countRows[0]?.total || 0, 10);

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;
    dataParams.push(limitNum, offset);

    const [rows] = await execute(
      `SELECT 
        so.id,
        so.so_number AS soNumber,
        so.customer_name AS customerName,
        so.warehouse_id AS warehouseId,
        w.name AS warehouseName,
        so.status,
        so.total_amount AS totalAmount,
        so.notes,
        so.created_by AS createdBy,
        u.name AS createdByName,
        so.created_at AS createdAt,
        so.updated_at AS updatedAt,
        (SELECT COUNT(*) FROM sales_order_items soi WHERE soi.sales_order_id = so.id) AS itemCount
      FROM sales_orders so
      JOIN warehouses w ON so.warehouse_id = w.id
      JOIN users u ON so.created_by = u.id
      ${whereClause}
      ORDER BY so.id DESC
      LIMIT ? OFFSET ?;`,
      dataParams
    );

    const salesOrders = (rows || []).map((r) => ({
      id: r.id,
      soNumber: r.soNumber,
      customerName: r.customerName,
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      status: r.status,
      totalAmount: parseFloat(r.totalAmount),
      notes: r.notes,
      createdBy: r.createdBy,
      createdByName: r.createdByName,
      itemCount: parseInt(r.itemCount || 0, 10),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return {
      salesOrders,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    };
  }
}

export const salesOrderRepository = new SalesOrderRepository();
export default salesOrderRepository;

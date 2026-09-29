/**
 * ============================================================================
 * File: backend/src/repositories/purchaseOrder.repository.js
 * Purpose: Data Access Object for purchase_orders and purchase_order_items.
 * Why it exists: Encapsulates all raw SQL queries for purchase orders and
 * transactional locking, keeping controllers and services cleanly decoupled.
 * ============================================================================
 */

import { execute } from '../config/db.js';

export class PurchaseOrderRepository {
  /**
   * Generates a collision-safe unique purchase order number.
   * Format: PO-YYYYMMDD-XXXX
   * @param {import('mysql2/promise').PoolConnection} [conn]
   * @returns {Promise<string>}
   */
  async generateUniquePoNumber(conn = null) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    let attempts = 0;
    while (attempts < 10) {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const candidate = `PO-${dateStr}-${randomSuffix}`;
      const query = `SELECT id FROM purchase_orders WHERE po_number = ? LIMIT 1;`;
      const [rows] = conn ? await conn.execute(query, [candidate]) : await execute(query, [candidate]);
      if (rows.length === 0) {
        return candidate;
      }
      attempts++;
    }
    // Fallback if random suffix collides
    return `PO-${dateStr}-${Date.now().toString().slice(-6)}`;
  }

  /**
   * Inserts a new purchase order header within a transaction.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {Object} poData
   * @returns {Promise<number>} Inserted PO ID
   */
  async createPurchaseOrder(conn, {
    poNumber,
    supplierId,
    warehouseId,
    status = 'draft',
    orderedAt = null,
    totalAmount = 0,
    notes = null,
    createdBy,
  }) {
    const [result] = await conn.execute(
      `INSERT INTO purchase_orders 
        (po_number, supplier_id, warehouse_id, status, ordered_at, total_amount, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [poNumber, supplierId, warehouseId, status, orderedAt, totalAmount, notes, createdBy]
    );
    return result.insertId;
  }

  /**
   * Batch inserts line items for a purchase order within a transaction.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} purchaseOrderId
   * @param {Array<{ productId: number, quantity: number, unitCost: number }>} items
   */
  async insertPurchaseOrderItems(conn, purchaseOrderId, items) {
    if (!items || items.length === 0) return;

    const values = [];
    const placeholders = [];
    for (const item of items) {
      placeholders.push('(?, ?, ?, ?)');
      values.push(purchaseOrderId, item.productId, item.quantity, item.unitCost);
    }

    const query = `INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_cost) VALUES ${placeholders.join(', ')};`;
    await conn.execute(query, values);
  }

  /**
   * Finds a purchase order by ID including line items and joined names.
   * @param {number} id
   * @param {import('mysql2/promise').PoolConnection} [conn]
   * @returns {Promise<Object|null>}
   */
  async findById(id, conn = null) {
    const poQuery = `
      SELECT 
        po.id,
        po.po_number AS poNumber,
        po.supplier_id AS supplierId,
        s.name AS supplierName,
        po.warehouse_id AS warehouseId,
        w.name AS warehouseName,
        po.status,
        po.ordered_at AS orderedAt,
        po.received_at AS receivedAt,
        po.received_by AS receivedBy,
        ur.name AS receivedByName,
        po.total_amount AS totalAmount,
        po.notes,
        po.created_by AS createdBy,
        u.name AS createdByName,
        po.created_at AS createdAt,
        po.updated_at AS updatedAt
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id = s.id
      JOIN warehouses w ON po.warehouse_id = w.id
      JOIN users u ON po.created_by = u.id
      LEFT JOIN users ur ON po.received_by = ur.id
      WHERE po.id = ?
      LIMIT 1;
    `;
    const [poRows] = conn ? await conn.execute(poQuery, [id]) : await execute(poQuery, [id]);
    if (!poRows || poRows.length === 0) return null;

    const po = poRows[0];

    const itemsQuery = `
      SELECT 
        poi.id,
        poi.purchase_order_id AS purchaseOrderId,
        poi.product_id AS productId,
        p.name AS productName,
        p.sku AS productSku,
        poi.quantity,
        poi.unit_cost AS unitCost,
        poi.created_at AS createdAt,
        poi.updated_at AS updatedAt
      FROM purchase_order_items poi
      JOIN products p ON poi.product_id = p.id
      WHERE poi.purchase_order_id = ?
      ORDER BY poi.id ASC;
    `;
    const [itemRows] = conn ? await conn.execute(itemsQuery, [id]) : await execute(itemsQuery, [id]);

    return {
      id: po.id,
      poNumber: po.poNumber,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      warehouseId: po.warehouseId,
      warehouseName: po.warehouseName,
      status: po.status,
      orderedAt: po.orderedAt,
      receivedAt: po.receivedAt,
      receivedBy: po.receivedBy,
      receivedByName: po.receivedByName,
      totalAmount: parseFloat(po.totalAmount),
      notes: po.notes,
      createdBy: po.createdBy,
      createdByName: po.createdByName,
      createdAt: po.createdAt,
      updatedAt: po.updatedAt,
      items: (itemRows || []).map((item) => ({
        id: item.id,
        purchaseOrderId: item.purchaseOrderId,
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        quantity: parseInt(item.quantity, 10),
        unitCost: parseFloat(item.unitCost),
        subtotal: parseFloat((parseInt(item.quantity, 10) * parseFloat(item.unitCost)).toFixed(2)),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    };
  }

  /**
   * Retrieves line items for a purchase order.
   * @param {number} purchaseOrderId
   * @param {import('mysql2/promise').PoolConnection} [conn]
   * @returns {Promise<Array>}
   */
  async findItemsByPoId(purchaseOrderId, conn = null) {
    const query = `
      SELECT 
        poi.id,
        poi.purchase_order_id AS purchaseOrderId,
        poi.product_id AS productId,
        p.name AS productName,
        p.sku AS productSku,
        poi.quantity,
        poi.unit_cost AS unitCost
      FROM purchase_order_items poi
      JOIN products p ON poi.product_id = p.id
      WHERE poi.purchase_order_id = ?
      ORDER BY poi.id ASC;
    `;
    const [rows] = conn ? await conn.execute(query, [purchaseOrderId]) : await execute(query, [purchaseOrderId]);
    return (rows || []).map((r) => ({
      id: r.id,
      purchaseOrderId: r.purchaseOrderId,
      productId: r.productId,
      productName: r.productName,
      productSku: r.productSku,
      quantity: parseInt(r.quantity, 10),
      unitCost: parseFloat(r.unitCost),
    }));
  }

  /**
   * Locks a purchase order row FOR UPDATE inside an active transaction.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async lockPoForUpdate(conn, id) {
    const [rows] = await conn.execute(
      `SELECT id, po_number AS poNumber, supplier_id AS supplierId, warehouse_id AS warehouseId,
              status, total_amount AS totalAmount, notes, created_by AS createdBy
       FROM purchase_orders
       WHERE id = ?
       FOR UPDATE;`,
      [id]
    );

    if (!rows || rows.length === 0) return null;
    return rows[0];
  }

  /**
   * Atomically updates purchase order status to 'received' IF AND ONLY IF current status is 'ordered'.
   * Returns affectedRows (1 on success, 0 if already received or cancelled).
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {{ id: number, receivedBy: number }} data
   * @returns {Promise<number>} affectedRows
   */
  async guardedUpdateStatusToReceived(conn, { id, receivedBy }) {
    const [result] = await conn.execute(
      `UPDATE purchase_orders 
       SET status = 'received', received_at = CURRENT_TIMESTAMP, received_by = ? 
       WHERE id = ? AND status = 'ordered';`,
      [receivedBy, id]
    );
    return result.affectedRows;
  }

  /**
   * Transitions a draft purchase order to 'ordered'.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} id
   * @returns {Promise<number>} affectedRows
   */
  async updateStatusToOrdered(conn, id) {
    const [result] = await conn.execute(
      `UPDATE purchase_orders 
       SET status = 'ordered', ordered_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND status = 'draft';`,
      [id]
    );
    return result.affectedRows;
  }

  /**
   * Transitions a draft or ordered purchase order to 'cancelled'.
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} id
   * @returns {Promise<number>} affectedRows
   */
  async updateStatusToCancelled(conn, id) {
    const [result] = await conn.execute(
      `UPDATE purchase_orders 
       SET status = 'cancelled' 
       WHERE id = ? AND status IN ('draft', 'ordered');`,
      [id]
    );
    return result.affectedRows;
  }

  /**
   * Updates purchase order header fields (supplier, warehouse, totalAmount, notes).
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} id
   * @param {{ supplierId: number, warehouseId: number, totalAmount: number, notes: string|null }} data
   * @returns {Promise<number>} affectedRows
   */
  async updatePurchaseOrder(conn, id, { supplierId, warehouseId, totalAmount, notes }) {
    const [result] = await conn.execute(
      `UPDATE purchase_orders 
       SET supplier_id = ?, warehouse_id = ?, total_amount = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?;`,
      [supplierId, warehouseId, totalAmount, notes, id]
    );
    return result.affectedRows;
  }

  /**
   * Deletes all line items for a purchase order (used when replacing items on a draft PO).
   * @param {import('mysql2/promise').PoolConnection} conn
   * @param {number} purchaseOrderId
   * @returns {Promise<number>} affectedRows
   */
  async deletePurchaseOrderItems(conn, purchaseOrderId) {
    const [result] = await conn.execute(
      `DELETE FROM purchase_order_items WHERE purchase_order_id = ?;`,
      [purchaseOrderId]
    );
    return result.affectedRows;
  }

  /**
   * Retrieves paginated purchase orders list with optional filters.
   * @param {Object} filters
   * @returns {Promise<Object>}
   */
  async findAll({ page = 1, limit = 20, status, supplierId, warehouseId, search }) {
    const conditions = [];
    const countParams = [];
    const dataParams = [];

    if (status && status.trim() !== '') {
      conditions.push('po.status = ?');
      countParams.push(status.trim());
      dataParams.push(status.trim());
    }

    if (supplierId) {
      conditions.push('po.supplier_id = ?');
      countParams.push(supplierId);
      dataParams.push(supplierId);
    }

    if (warehouseId) {
      conditions.push('po.warehouse_id = ?');
      countParams.push(warehouseId);
      dataParams.push(warehouseId);
    }

    if (search && search.trim() !== '') {
      conditions.push('(po.po_number LIKE ? OR s.name LIKE ? OR w.name LIKE ?)');
      const pattern = `%${search.trim()}%`;
      countParams.push(pattern, pattern, pattern);
      dataParams.push(pattern, pattern, pattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await execute(
      `SELECT COUNT(*) AS total 
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id
       JOIN warehouses w ON po.warehouse_id = w.id
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
        po.id,
        po.po_number AS poNumber,
        po.supplier_id AS supplierId,
        s.name AS supplierName,
        po.warehouse_id AS warehouseId,
        w.name AS warehouseName,
        po.status,
        po.ordered_at AS orderedAt,
        po.received_at AS receivedAt,
        po.received_by AS receivedBy,
        ur.name AS receivedByName,
        po.total_amount AS totalAmount,
        po.notes,
        po.created_by AS createdBy,
        u.name AS createdByName,
        po.created_at AS createdAt,
        po.updated_at AS updatedAt,
        (SELECT COUNT(*) FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id) AS itemCount
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id = s.id
      JOIN warehouses w ON po.warehouse_id = w.id
      JOIN users u ON po.created_by = u.id
      LEFT JOIN users ur ON po.received_by = ur.id
      ${whereClause}
      ORDER BY po.id DESC
      LIMIT ? OFFSET ?;`,
      dataParams
    );

    const purchaseOrders = (rows || []).map((r) => ({
      id: r.id,
      poNumber: r.poNumber,
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      status: r.status,
      orderedAt: r.orderedAt,
      receivedAt: r.receivedAt,
      receivedBy: r.receivedBy,
      receivedByName: r.receivedByName,
      totalAmount: parseFloat(r.totalAmount),
      notes: r.notes,
      createdBy: r.createdBy,
      createdByName: r.createdByName,
      itemCount: parseInt(r.itemCount || 0, 10),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return {
      purchaseOrders,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    };
  }
}

export const purchaseOrderRepository = new PurchaseOrderRepository();
export default purchaseOrderRepository;

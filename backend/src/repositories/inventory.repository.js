/**
 * ============================================================================
 * File: backend/src/repositories/inventory.repository.js
 * Purpose: Data Access Object for stock_levels and stock_movements tables.
 * Why it exists: Encapsulates all raw parameterized SQL queries for inventory
 * balances, movement logs, availability queries, and low-stock alerts.
 * ============================================================================
 */

import { execute } from '../config/db.js';

export class InventoryRepository {
  // ==========================================================================
  // TRANSACTION-SCOPED WRITE OPERATIONS (Requires active transaction connection)
  // ==========================================================================

  /**
   * Locks a specific product/warehouse stock level row for update using pessimistic row locking.
   * @param {import('mysql2/promise').PoolConnection} connection - Active transaction connection
   * @param {number} productId
   * @param {number} warehouseId
   * @returns {Promise<{ id: number, productId: number, warehouseId: number, quantity: number } | null>}
   */
  async lockStockLevelForUpdate(connection, productId, warehouseId) {
    const [rows] = await connection.execute(
      `SELECT id, product_id, warehouse_id, quantity
       FROM stock_levels
       WHERE product_id = ? AND warehouse_id = ?
       FOR UPDATE;`,
      [productId, warehouseId]
    );

    if (!rows || rows.length === 0) {
      return null;
    }

    return {
      id: rows[0].id,
      productId: rows[0].product_id,
      warehouseId: rows[0].warehouse_id,
      quantity: parseInt(rows[0].quantity, 10),
    };
  }

  /**
   * Upserts the current physical stock quantity for a product in a warehouse.
   * @param {import('mysql2/promise').PoolConnection} connection
   * @param {number} productId
   * @param {number} warehouseId
   * @param {number} newQuantity
   */
  async upsertStockLevel(connection, productId, warehouseId, newQuantity) {
    await connection.execute(
      `INSERT INTO stock_levels (product_id, warehouse_id, quantity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = VALUES(quantity);`,
      [productId, warehouseId, newQuantity]
    );
  }

  /**
   * Records an immutable audit log entry in stock_movements.
   * @param {import('mysql2/promise').PoolConnection} connection
   * @param {{ productId: number, warehouseId: number, userId: number, movementType: string, quantity: number, referenceType?: string, referenceId?: number, reference?: string }} movement
   * @returns {Promise<number>} Inserted movement record ID
   */
  async insertStockMovement(connection, {
    productId,
    warehouseId,
    userId,
    movementType,
    quantity,
    referenceType = null,
    referenceId = null,
    reference = null,
  }) {
    const [result] = await connection.execute(
      `INSERT INTO stock_movements (product_id, warehouse_id, user_id, movement_type, reference_type, reference_id, quantity, reference)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [productId, warehouseId, userId, movementType, referenceType, referenceId, quantity, reference]
    );
    return result.insertId;
  }

  /**
   * Updates reference metadata on an existing movement record (used to link transfer movements).
   * @param {import('mysql2/promise').PoolConnection} connection
   * @param {number} movementId
   * @param {{ referenceType: string, referenceId: number }} metadata
   */
  async updateMovementReference(connection, movementId, { referenceType, referenceId }) {
    await connection.execute(
      `UPDATE stock_movements SET reference_type = ?, reference_id = ? WHERE id = ?;`,
      [referenceType, referenceId, movementId]
    );
  }

  // ==========================================================================
  // READ-ONLY INVENTORY QUERIES
  // ==========================================================================

  /**
   * UC-14: Finds all current inventory stock levels with product and warehouse metadata.
   */
  async findAllStockLevels({ page = 1, limit = 20, warehouseId, productId, category, search, lowStock, userRole }) {
    const conditions = [];
    const countParams = [];
    const dataParams = [];

    // Filter by active entities by default
    conditions.push('p.is_active = 1');
    conditions.push('w.is_active = 1');

    if (warehouseId) {
      conditions.push('sl.warehouse_id = ?');
      countParams.push(warehouseId);
      dataParams.push(warehouseId);
    }

    if (productId) {
      conditions.push('sl.product_id = ?');
      countParams.push(productId);
      dataParams.push(productId);
    }

    if (category && category.trim() !== '') {
      conditions.push('p.category = ?');
      countParams.push(category.trim());
      dataParams.push(category.trim());
    }

    if (search && search.trim() !== '') {
      conditions.push('(p.name LIKE ? OR p.sku LIKE ? OR w.name LIKE ?)');
      const pattern = `%${search.trim()}%`;
      countParams.push(pattern, pattern, pattern);
      dataParams.push(pattern, pattern, pattern);
    }

    if (lowStock === true || lowStock === 'true' || lowStock === 1 || lowStock === '1') {
      conditions.push('sl.quantity <= p.reorder_level');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total count
    const [countRows] = await execute(
      `SELECT COUNT(*) AS total
       FROM stock_levels sl
       JOIN products p ON sl.product_id = p.id
       JOIN warehouses w ON sl.warehouse_id = w.id
       ${whereClause};`,
      countParams
    );
    const total = parseInt(countRows[0]?.total || 0, 10);

    // Pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;
    dataParams.push(limitNum, offset);

    const costPriceSelect = userRole !== 'staff' ? 'p.cost_price AS costPrice,' : '';

    const [rows] = await execute(
      `SELECT 
        sl.id,
        sl.product_id AS productId,
        p.sku,
        p.name AS productName,
        p.category,
        p.unit_price AS unitPrice,
        ${costPriceSelect}
        p.reorder_level AS reorderLevel,
        sl.warehouse_id AS warehouseId,
        w.name AS warehouseName,
        w.code AS warehouseCode,
        sl.quantity,
        sl.updated_at AS updatedAt
      FROM stock_levels sl
      JOIN products p ON sl.product_id = p.id
      JOIN warehouses w ON sl.warehouse_id = w.id
      ${whereClause}
      ORDER BY sl.id ASC
      LIMIT ? OFFSET ?;`,
      dataParams
    );

    const items = rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      sku: r.sku,
      productName: r.productName,
      category: r.category,
      unitPrice: parseFloat(r.unitPrice),
      costPrice: r.costPrice !== undefined ? parseFloat(r.costPrice) : undefined,
      reorderLevel: parseInt(r.reorderLevel, 10),
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      warehouseCode: r.warehouseCode,
      quantity: parseInt(r.quantity, 10),
      updatedAt: r.updatedAt,
    }));

    return {
      items,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    };
  }

  /**
   * UC-15: Checks stock availability for a product across warehouses.
   */
  async findAvailability(productId, warehouseId = null, requestedQuantity = null) {
    const params = [productId];
    let warehouseCondition = '';

    if (warehouseId) {
      warehouseCondition = 'AND sl.warehouse_id = ?';
      params.push(warehouseId);
    }

    const [rows] = await execute(
      `SELECT 
        sl.warehouse_id AS warehouseId,
        w.name AS warehouseName,
        w.code AS warehouseCode,
        sl.quantity
      FROM stock_levels sl
      JOIN warehouses w ON sl.warehouse_id = w.id
      WHERE sl.product_id = ? AND w.is_active = 1 ${warehouseCondition};`,
      params
    );

    const warehouseBreakdown = rows.map((r) => ({
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      warehouseCode: r.warehouseCode,
      quantity: parseInt(r.quantity, 10),
    }));

    const totalQuantity = warehouseBreakdown.reduce((sum, item) => sum + item.quantity, 0);

    const result = {
      productId: Number(productId),
      totalQuantity,
      warehouses: warehouseBreakdown,
    };

    if (requestedQuantity !== null && requestedQuantity !== undefined) {
      const targetQuantity = parseInt(requestedQuantity, 10);
      result.requestedQuantity = targetQuantity;
      result.isAvailable = warehouseId
        ? (warehouseBreakdown[0]?.quantity || 0) >= targetQuantity
        : totalQuantity >= targetQuantity;
    }

    return result;
  }

  /**
   * UC-20: Finds all inventory items where on-hand quantity <= configured reorder_level.
   */
  async findLowStock({ page = 1, limit = 20, warehouseId, category, search, userRole }) {
    const conditions = [
      'sl.quantity <= p.reorder_level',
      'p.is_active = 1',
      'w.is_active = 1',
    ];
    const countParams = [];
    const dataParams = [];

    if (warehouseId) {
      conditions.push('sl.warehouse_id = ?');
      countParams.push(warehouseId);
      dataParams.push(warehouseId);
    }

    if (category && category.trim() !== '') {
      conditions.push('p.category = ?');
      countParams.push(category.trim());
      dataParams.push(category.trim());
    }

    if (search && search.trim() !== '') {
      conditions.push('(p.name LIKE ? OR p.sku LIKE ? OR w.name LIKE ?)');
      const pattern = `%${search.trim()}%`;
      countParams.push(pattern, pattern, pattern);
      dataParams.push(pattern, pattern, pattern);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Total count
    const [countRows] = await execute(
      `SELECT COUNT(*) AS total
       FROM stock_levels sl
       JOIN products p ON sl.product_id = p.id
       JOIN warehouses w ON sl.warehouse_id = w.id
       ${whereClause};`,
      countParams
    );
    const total = parseInt(countRows[0]?.total || 0, 10);

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;
    dataParams.push(limitNum, offset);

    const costPriceSelect = userRole !== 'staff' ? 'p.cost_price AS costPrice,' : '';

    const [rows] = await execute(
      `SELECT 
        sl.id,
        sl.product_id AS productId,
        p.sku,
        p.name AS productName,
        p.category,
        p.unit_price AS unitPrice,
        ${costPriceSelect}
        p.reorder_level AS reorderLevel,
        p.supplier_id AS supplierId,
        s.name AS supplierName,
        sl.warehouse_id AS warehouseId,
        w.name AS warehouseName,
        w.code AS warehouseCode,
        sl.quantity,
        (p.reorder_level - sl.quantity) AS deficit,
        sl.updated_at AS updatedAt
      FROM stock_levels sl
      JOIN products p ON sl.product_id = p.id
      JOIN warehouses w ON sl.warehouse_id = w.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      ${whereClause}
      ORDER BY deficit DESC, sl.quantity ASC
      LIMIT ? OFFSET ?;`,
      dataParams
    );

    const items = rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      sku: r.sku,
      productName: r.productName,
      category: r.category,
      unitPrice: parseFloat(r.unitPrice),
      costPrice: r.costPrice !== undefined ? parseFloat(r.costPrice) : undefined,
      reorderLevel: parseInt(r.reorderLevel, 10),
      supplierId: r.supplierId ? parseInt(r.supplierId, 10) : null,
      supplierName: r.supplierName || null,
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      warehouseCode: r.warehouseCode,
      quantity: parseInt(r.quantity, 10),
      deficit: Math.max(0, parseInt(r.deficit, 10)),
      updatedAt: r.updatedAt,
    }));

    return {
      items,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    };
  }

  /**
   * UC-19: Lists historical stock movements with multi-attribute filtering and pagination.
   */
  async findAllMovements({ page = 1, limit = 20, productId, warehouseId, type, userId, startDate, endDate, search }) {
    const conditions = [];
    const countParams = [];
    const dataParams = [];

    if (productId) {
      conditions.push('sm.product_id = ?');
      countParams.push(productId);
      dataParams.push(productId);
    }

    if (warehouseId) {
      conditions.push('sm.warehouse_id = ?');
      countParams.push(warehouseId);
      dataParams.push(warehouseId);
    }

    if (type) {
      conditions.push('sm.movement_type = ?');
      countParams.push(type);
      dataParams.push(type);
    }

    if (userId) {
      conditions.push('sm.user_id = ?');
      countParams.push(userId);
      dataParams.push(userId);
    }

    if (startDate) {
      conditions.push('sm.created_at >= ?');
      countParams.push(`${startDate} 00:00:00`);
      dataParams.push(`${startDate} 00:00:00`);
    }

    if (endDate) {
      conditions.push('sm.created_at <= ?');
      countParams.push(`${endDate} 23:59:59`);
      dataParams.push(`${endDate} 23:59:59`);
    }

    if (search && search.trim() !== '') {
      conditions.push('(sm.reference LIKE ? OR p.name LIKE ? OR p.sku LIKE ?)');
      const pattern = `%${search.trim()}%`;
      countParams.push(pattern, pattern, pattern);
      dataParams.push(pattern, pattern, pattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total count
    const [countRows] = await execute(
      `SELECT COUNT(*) AS total
       FROM stock_movements sm
       JOIN products p ON sm.product_id = p.id
       JOIN warehouses w ON sm.warehouse_id = w.id
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
        sm.id,
        sm.product_id AS productId,
        p.name AS productName,
        p.sku AS productSku,
        sm.warehouse_id AS warehouseId,
        w.name AS warehouseName,
        w.code AS warehouseCode,
        sm.user_id AS userId,
        u.name AS userName,
        u.role AS userRole,
        sm.movement_type AS movementType,
        sm.reference_type AS referenceType,
        sm.reference_id AS referenceId,
        sm.quantity,
        sm.reference,
        sm.created_at AS createdAt
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      JOIN warehouses w ON sm.warehouse_id = w.id
      JOIN users u ON sm.user_id = u.id
      ${whereClause}
      ORDER BY sm.created_at DESC, sm.id DESC
      LIMIT ? OFFSET ?;`,
      dataParams
    );

    const movements = rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      productName: r.productName,
      productSku: r.productSku,
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      warehouseCode: r.warehouseCode,
      userId: r.userId,
      userName: r.userName,
      userRole: r.userRole,
      movementType: r.movementType,
      referenceType: r.referenceType || null,
      referenceId: r.referenceId ? parseInt(r.referenceId, 10) : null,
      quantity: parseInt(r.quantity, 10),
      reference: r.reference || null,
      createdAt: r.createdAt,
    }));

    return {
      movements,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    };
  }
}

export const inventoryRepository = new InventoryRepository();
export default inventoryRepository;

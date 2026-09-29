/**
 * ============================================================================
 * File: backend/src/repositories/dashboard.repository.js
 * Purpose: Data Access Object for dashboard aggregate metrics and summaries (UC-32).
 * Why it exists: Executes optimized, concurrent SQL aggregate queries across products,
 * stock levels, warehouses, purchase orders, sales orders, and stock movements.
 * ============================================================================
 */

import { execute } from '../config/db.js';

export class DashboardRepository {
  /**
   * Fetches high-level inventory, order, and warehouse aggregates for the dashboard.
   * Runs queries concurrently using Promise.all for maximum efficiency.
   * @returns {Promise<object>}
   */
  async getSummary() {
    const [
      [productCountRows],
      [stockSummaryRows],
      [lowStockRows],
      [openPoRows],
      [openSoRows],
      [stockByWarehouseRows],
      [recentMovementRows],
    ] = await Promise.all([
      // 1. Total active products count
      execute(
        `SELECT COUNT(*) AS total 
         FROM products 
         WHERE is_active = 1;`
      ),

      // 2. Total stock units and total stock valuation across active products and active warehouses
      execute(
        `SELECT 
           COALESCE(SUM(sl.quantity), 0) AS totalStockUnits,
           COALESCE(SUM(sl.quantity * p.cost_price), 0) AS stockValue
         FROM stock_levels sl
         JOIN products p ON sl.product_id = p.id
         JOIN warehouses w ON sl.warehouse_id = w.id
         WHERE p.is_active = 1 AND w.is_active = 1;`
      ),

      // 3. Low stock count: number of (product, warehouse) locations where stock is at or below reorder level
      execute(
        `SELECT COUNT(*) AS lowStockCount
         FROM stock_levels sl
         JOIN products p ON sl.product_id = p.id
         JOIN warehouses w ON sl.warehouse_id = w.id
         WHERE p.is_active = 1 AND w.is_active = 1 AND sl.quantity <= p.reorder_level;`
      ),

      // 4. Open purchase orders (draft or ordered)
      execute(
        `SELECT COUNT(*) AS openPurchaseOrders
         FROM purchase_orders
         WHERE status IN ('draft', 'ordered');`
      ),

      // 5. Open sales orders (draft or confirmed)
      execute(
        `SELECT COUNT(*) AS openSalesOrders
         FROM sales_orders
         WHERE status IN ('draft', 'confirmed');`
      ),

      // 6. Stock breakdown by warehouse (active warehouses only)
      execute(
        `SELECT 
           w.id AS warehouseId,
           w.name AS warehouseName,
           w.code AS warehouseCode,
           COALESCE(SUM(CASE WHEN p.is_active = 1 THEN sl.quantity ELSE 0 END), 0) AS totalUnits
         FROM warehouses w
         LEFT JOIN stock_levels sl ON w.id = sl.warehouse_id
         LEFT JOIN products p ON sl.product_id = p.id
         WHERE w.is_active = 1
         GROUP BY w.id, w.name, w.code
         ORDER BY w.id ASC;`
      ),

      // 7. Recent stock movements (latest 10)
      execute(
        `SELECT 
           sm.id,
           sm.product_id AS productId,
           p.name AS productName,
           p.sku AS productSku,
           sm.warehouse_id AS warehouseId,
           w.name AS warehouseName,
           sm.movement_type AS movementType,
           sm.quantity,
           sm.reference,
           sm.user_id AS createdBy,
           u.name AS createdByName,
           sm.created_at AS createdAt
         FROM stock_movements sm
         JOIN products p ON sm.product_id = p.id
         JOIN warehouses w ON sm.warehouse_id = w.id
         LEFT JOIN users u ON sm.user_id = u.id
         ORDER BY sm.created_at DESC, sm.id DESC
         LIMIT 10;`
      ),
    ]);

    return {
      totalActiveProducts: parseInt(productCountRows[0]?.total || 0, 10),
      totalStockUnits: parseInt(stockSummaryRows[0]?.totalStockUnits || 0, 10),
      stockValue: parseFloat(Number(stockSummaryRows[0]?.stockValue || 0).toFixed(2)),
      lowStockCount: parseInt(lowStockRows[0]?.lowStockCount || 0, 10),
      openPurchaseOrders: parseInt(openPoRows[0]?.openPurchaseOrders || 0, 10),
      openSalesOrders: parseInt(openSoRows[0]?.openSalesOrders || 0, 10),
      stockByWarehouse: stockByWarehouseRows.map((r) => ({
        warehouseId: parseInt(r.warehouseId, 10),
        warehouseName: r.warehouseName,
        warehouseCode: r.warehouseCode,
        totalUnits: parseInt(r.totalUnits || 0, 10),
      })),
      recentMovements: recentMovementRows.map((r) => ({
        id: parseInt(r.id, 10),
        productId: parseInt(r.productId, 10),
        productName: r.productName,
        productSku: r.productSku,
        warehouseId: parseInt(r.warehouseId, 10),
        warehouseName: r.warehouseName,
        movementType: r.movementType,
        quantity: parseInt(r.quantity, 10),
        reference: r.reference || null,
        createdBy: r.createdBy ? parseInt(r.createdBy, 10) : null,
        createdByName: r.createdByName || null,
        createdAt: r.createdAt,
      })),
    };
  }
}

export const defaultDashboardRepository = new DashboardRepository();

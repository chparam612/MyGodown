/**
 * ============================================================================
 * File: backend/src/controllers/inventory.controller.js
 * Purpose: Express controller for Inventory & Stock Movement endpoints (UC-14 to UC-20).
 * Why it exists: Handles HTTP requests, delegates stock operations to inventoryService,
 * and formats responses into standard success, error, and paginated envelopes.
 * ============================================================================
 */

import { inventoryService } from '../services/inventory.service.js';
import { successResponse, paginatedResponse } from '../utils/response.js';

export class InventoryController {
  /**
   * GET /api/inventory (UC-14)
   * Lists inventory stock levels with pagination and metadata.
   */
  async listInventory(req, res) {
    const result = await inventoryService.getInventory(req.query, req.user.role);
    return paginatedResponse(res, result.items, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    });
  }

  /**
   * GET /api/inventory/availability (UC-15)
   * Checks stock availability across warehouses for a product.
   */
  async checkAvailability(req, res) {
    const { productId, warehouseId, quantity } = req.query;
    const result = await inventoryService.checkAvailability(productId, warehouseId, quantity);
    return successResponse(res, result);
  }

  /**
   * GET /api/inventory/low-stock (UC-20)
   * Lists products at or below their reorder threshold.
   */
  async getLowStock(req, res) {
    const result = await inventoryService.getLowStock(req.query, req.user.role);
    return paginatedResponse(res, result.items, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    });
  }

  /**
   * GET /api/inventory/movements (UC-19)
   * Lists historical stock movements audit log.
   */
  async listMovements(req, res) {
    const result = await inventoryService.getMovements(req.query);
    return paginatedResponse(res, result.movements, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    });
  }

  /**
   * POST /api/inventory/movements (UC-16)
   * Records a direct stock movement ('in', 'out', 'adjustment').
   */
  async recordMovement(req, res) {
    const result = await inventoryService.recordMovement({
      ...req.body,
      userId: req.user.id,
    });
    return successResponse(res, result, 201);
  }

  /**
   * POST /api/inventory/adjust (UC-17)
   * Adjusts warehouse stock to physical count with required reason (Admin, Manager).
   */
  async adjustStock(req, res) {
    const result = await inventoryService.adjustStock({
      ...req.body,
      userId: req.user.id,
    });
    return successResponse(res, result, 200);
  }

  /**
   * POST /api/inventory/transfer (UC-18)
   * Transfers stock atomically between two active warehouses (Admin, Manager).
   */
  async transferStock(req, res) {
    const result = await inventoryService.transferStock({
      ...req.body,
      userId: req.user.id,
    });
    return successResponse(res, result, 200);
  }
}

export const inventoryController = new InventoryController();
export default inventoryController;

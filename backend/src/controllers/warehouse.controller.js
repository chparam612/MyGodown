/**
 * ============================================================================
 * File: backend/src/controllers/warehouse.controller.js
 * Purpose: Express controller for Warehouse endpoints (UC-11 to UC-13).
 * Why it exists: Parses requests, invokes warehouse service methods, and
 * formats JSON responses using standard success and pagination envelopes.
 * ============================================================================
 */

import { warehouseService } from '../services/warehouse.service.js';
import { successResponse, paginatedResponse } from '../utils/response.js';

export class WarehouseController {
  /**
   * POST /api/warehouses (UC-11)
   */
  async createWarehouse(req, res) {
    const warehouse = await warehouseService.createWarehouse(req.body);
    return successResponse(res, warehouse, 201);
  }

  /**
   * GET /api/warehouses (UC-12)
   */
  async listWarehouses(req, res) {
    const { warehouses, pagination } = await warehouseService.listWarehouses(
      req.query,
      req.user.role
    );
    return paginatedResponse(res, warehouses, pagination);
  }

  /**
   * GET /api/warehouses/:id (UC-12)
   */
  async getWarehouseById(req, res) {
    const warehouse = await warehouseService.getWarehouseById(
      req.params.id,
      req.user.role
    );
    return successResponse(res, warehouse);
  }

  /**
   * PUT /api/warehouses/:id (UC-13)
   */
  async updateWarehouse(req, res) {
    const warehouse = await warehouseService.updateWarehouse(
      req.params.id,
      req.body
    );
    return successResponse(res, warehouse);
  }

  /**
   * DELETE /api/warehouses/:id (UC-13)
   */
  async deactivateWarehouse(req, res) {
    const result = await warehouseService.deactivateWarehouse(req.params.id);
    return successResponse(res, result);
  }
}

export const warehouseController = new WarehouseController();
export default warehouseController;

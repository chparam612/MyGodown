/**
 * ============================================================================
 * File: backend/src/controllers/supplier.controller.js
 * Purpose: HTTP controller for Supplier management endpoints (UC-21 to UC-24).
 * Why it exists: Unpacks HTTP request parameters, invokes SupplierService,
 * and formats standardized JSON responses. Contains zero SQL queries.
 * ============================================================================
 */

import { supplierService } from '../services/supplier.service.js';

export class SupplierController {
  /**
   * UC-21: Adds a new supplier.
   * POST /api/suppliers
   */
  async createSupplier(req, res) {
    const supplier = await supplierService.createSupplier(req.body);
    return res.status(201).json({
      success: true,
      data: supplier,
    });
  }

  /**
   * UC-22: Lists and searches suppliers.
   * GET /api/suppliers
   */
  async getSuppliers(req, res) {
    const { page, limit, search, isActive, sortBy, sortOrder } = req.query;
    const result = await supplierService.getSuppliers({
      page,
      limit,
      search,
      isActive,
      sortBy,
      sortOrder,
      userRole: req.user?.role,
    });

    return res.status(200).json({
      success: true,
      data: result.suppliers,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  }

  /**
   * UC-22: Gets a single supplier by ID.
   * GET /api/suppliers/:id
   */
  async getSupplierById(req, res) {
    const supplier = await supplierService.getSupplierById(
      req.params.id,
      req.user?.role
    );
    return res.status(200).json({
      success: true,
      data: supplier,
    });
  }

  /**
   * UC-23: Updates supplier metadata.
   * PUT /api/suppliers/:id
   */
  async updateSupplier(req, res) {
    const supplier = await supplierService.updateSupplier(
      req.params.id,
      req.body,
      req.user?.role
    );
    return res.status(200).json({
      success: true,
      data: supplier,
    });
  }

  /**
   * UC-24: Soft-deactivates a supplier.
   * DELETE /api/suppliers/:id
   */
  async deactivateSupplier(req, res) {
    const supplier = await supplierService.deactivateSupplier(req.params.id);
    return res.status(200).json({
      success: true,
      data: supplier,
    });
  }
}

export const supplierController = new SupplierController();
export default supplierController;

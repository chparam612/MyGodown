/**
 * ============================================================================
 * File: backend/src/controllers/salesOrder.controller.js
 * Purpose: HTTP Controller for Sales Orders endpoints (UC-28 to UC-30).
 * Why it exists: Receives and delegates HTTP requests, invokes service layer,
 * and formats standardized camelCase JSON responses.
 * ============================================================================
 */

import { salesOrderService } from '../services/salesOrder.service.js';
import { sendSuccess, paginatedResponse } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export class SalesOrderController {
  /**
   * UC-28: POST /api/sales-orders
   * Creates a new draft sales order with validated items.
   */
  create = asyncHandler(async (req, res) => {
    const customerName = req.body.customerName ?? req.body.customer_name;
    const warehouseId = req.body.warehouseId ?? req.body.warehouse_id;

    const so = await salesOrderService.createSalesOrder({
      customerName,
      warehouseId,
      status: req.body.status,
      notes: req.body.notes,
      items: req.body.items,
      userId: req.user.id,
    });

    return sendSuccess(res, so, 201);
  });

  /**
   * UC-29: GET /api/sales-orders
   * Lists sales orders with pagination and filtering.
   */
  list = asyncHandler(async (req, res) => {
    const warehouseId = req.query.warehouseId ?? req.query.warehouse_id;

    const result = await salesOrderService.getSalesOrders({
      page: req.query.page,
      limit: req.query.limit,
      status: req.query.status,
      warehouseId: warehouseId ? parseInt(warehouseId, 10) : undefined,
      search: req.query.search,
    });

    return paginatedResponse(res, result.salesOrders, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    });
  });

  /**
   * UC-29: GET /api/sales-orders/:id
   * Retrieves single sales order details with line items.
   */
  getById = asyncHandler(async (req, res) => {
    const so = await salesOrderService.getSalesOrderById(req.params.id);
    return sendSuccess(res, so, 200);
  });

  /**
   * UC-30: PATCH /api/sales-orders/:id/status
   * Transitions sales order status according to state machine.
   */
  updateStatus = asyncHandler(async (req, res) => {
    const so = await salesOrderService.updateStatus(
      req.params.id,
      req.body.status,
      req.user.id,
      req.user.role
    );
    return sendSuccess(res, so, 200);
  });

  /**
   * POST /api/sales-orders/:id/confirm
   * Confirms a draft sales order.
   */
  confirm = asyncHandler(async (req, res) => {
    const so = await salesOrderService.confirmSalesOrder(req.params.id, req.user.id);
    return sendSuccess(res, so, 200);
  });

  /**
   * UC-30: POST /api/sales-orders/:id/fulfill
   * Atomically fulfills a confirmed sales order and decrements warehouse stock.
   */
  fulfill = asyncHandler(async (req, res) => {
    const so = await salesOrderService.fulfillSalesOrder(req.params.id, req.user.id);
    return sendSuccess(res, so, 200);
  });

  /**
   * POST /api/sales-orders/:id/cancel
   * Cancels a draft or confirmed sales order (admin, manager only).
   */
  cancel = asyncHandler(async (req, res) => {
    const so = await salesOrderService.cancelSalesOrder(req.params.id, req.user.id, req.user.role);
    return sendSuccess(res, so, 200);
  });
}

export const salesOrderController = new SalesOrderController();
export default salesOrderController;

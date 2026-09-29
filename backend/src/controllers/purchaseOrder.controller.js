/**
 * ============================================================================
 * File: backend/src/controllers/purchaseOrder.controller.js
 * Purpose: HTTP Controller for Purchase Orders endpoints (UC-25 to UC-27).
 * Why it exists: Receives and delegates HTTP requests, invokes service layer,
 * and formats standardized camelCase JSON responses.
 * ============================================================================
 */

import { purchaseOrderService } from '../services/purchaseOrder.service.js';
import { sendSuccess, paginatedResponse } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export class PurchaseOrderController {
  /**
   * UC-25: POST /api/purchase-orders
   * Creates a new purchase order with validated items.
   */
  create = asyncHandler(async (req, res) => {
    const supplierId = req.body.supplierId ?? req.body.supplier_id;
    const warehouseId = req.body.warehouseId ?? req.body.warehouse_id;

    const po = await purchaseOrderService.createPurchaseOrder({
      supplierId,
      warehouseId,
      status: req.body.status,
      notes: req.body.notes,
      items: req.body.items,
      userId: req.user.id,
    });

    return sendSuccess(res, po, 201);
  });

  /**
   * UC-26: GET /api/purchase-orders
   * Lists purchase orders with pagination and filtering.
   */
  list = asyncHandler(async (req, res) => {
    const supplierId = req.query.supplierId ?? req.query.supplier_id;
    const warehouseId = req.query.warehouseId ?? req.query.warehouse_id;

    const result = await purchaseOrderService.getPurchaseOrders({
      page: req.query.page,
      limit: req.query.limit,
      status: req.query.status,
      supplierId: supplierId ? parseInt(supplierId, 10) : undefined,
      warehouseId: warehouseId ? parseInt(warehouseId, 10) : undefined,
      search: req.query.search,
    });

    return paginatedResponse(res, result.purchaseOrders, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    });
  });

  /**
   * UC-26: GET /api/purchase-orders/:id
   * Retrieves single purchase order details with line items.
   */
  getById = asyncHandler(async (req, res) => {
    const po = await purchaseOrderService.getPurchaseOrderById(req.params.id);
    return sendSuccess(res, po, 200);
  });

  /**
   * UC-P08 / UC-26: PUT /api/purchase-orders/:id
   * Updates an existing draft purchase order before it is ordered.
   */
  update = asyncHandler(async (req, res) => {
    const supplierId = req.body.supplierId ?? req.body.supplier_id;
    const warehouseId = req.body.warehouseId ?? req.body.warehouse_id;

    const po = await purchaseOrderService.updatePurchaseOrder(req.params.id, {
      supplierId,
      warehouseId,
      notes: req.body.notes,
      items: req.body.items,
      userId: req.user.id,
    });

    return sendSuccess(res, po, 200);
  });

  /**
   * PATCH /api/purchase-orders/:id/status
   * Transitions purchase order status according to state machine.
   */
  updateStatus = asyncHandler(async (req, res) => {
    const po = await purchaseOrderService.updateStatus(req.params.id, req.body.status, req.user.id);
    return sendSuccess(res, po, 200);
  });

  /**
   * UC-27: POST /api/purchase-orders/:id/receive
   * Atomically receives an ordered purchase order and increases warehouse stock.
   */
  receive = asyncHandler(async (req, res) => {
    const po = await purchaseOrderService.receivePurchaseOrder(req.params.id, req.user.id);
    return sendSuccess(res, po, 200);
  });

  /**
   * POST /api/purchase-orders/:id/cancel
   * Cancels a draft or ordered purchase order.
   */
  cancel = asyncHandler(async (req, res) => {
    const po = await purchaseOrderService.cancelPurchaseOrder(req.params.id, req.user.id);
    return sendSuccess(res, po, 200);
  });
}

export const purchaseOrderController = new PurchaseOrderController();
export default purchaseOrderController;

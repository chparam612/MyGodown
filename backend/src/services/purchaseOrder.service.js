/**
 * ============================================================================
 * File: backend/src/services/purchaseOrder.service.js
 * Purpose: Business logic and transaction coordinator for Purchase Orders (UC-25 to UC-27).
 * Why it exists: Enforces strict state transitions, collision-safe PO numbering,
 * line item validation, and atomic guarded receipt with inventory ledger recording.
 * ============================================================================
 */

import { withTransaction } from '../config/db.js';
import { purchaseOrderRepository } from '../repositories/purchaseOrder.repository.js';
import { productRepository } from '../repositories/product.repository.js';
import { supplierRepository } from '../repositories/supplier.repository.js';
import { warehouseRepository } from '../repositories/warehouse.repository.js';
import { inventoryService } from './inventory.service.js';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  UnprocessableEntityError,
} from '../utils/errors.js';

export class PurchaseOrderService {
  /**
   * UC-25: Creates a new purchase order with validated line items.
   * Auto-calculates totals and generates collision-safe po_number.
   */
  async createPurchaseOrder({
    supplierId,
    warehouseId,
    status = 'draft',
    notes = null,
    items = [],
    userId,
  }) {
    const sId = parseInt(supplierId, 10);
    const wId = parseInt(warehouseId, 10);

    if (isNaN(sId) || sId <= 0) {
      throw new ValidationError('Valid supplier ID is required');
    }
    if (isNaN(wId) || wId <= 0) {
      throw new ValidationError('Valid warehouse ID is required');
    }

    // 1. Validate Supplier exists and is active
    const supplier = await supplierRepository.findById(sId);
    if (!supplier) {
      throw new NotFoundError(`Supplier with ID ${sId} not found`);
    }
    if (!supplier.isActive) {
      throw new UnprocessableEntityError(`Supplier '${supplier.name}' is inactive`);
    }

    // 2. Validate Warehouse exists and is active
    const warehouse = await warehouseRepository.findById(wId);
    if (!warehouse) {
      throw new NotFoundError(`Warehouse with ID ${wId} not found`);
    }
    if (!warehouse.isActive) {
      throw new UnprocessableEntityError(`Warehouse '${warehouse.name}' is inactive`);
    }

    // 3. Validate Line Items
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ValidationError('Purchase order must contain at least one line item');
    }

    // Consolidate duplicate products if provided (UC-25 Alternative Flow A2)
    const consolidatedMap = new Map();
    for (const item of items) {
      const pid = parseInt(item.productId ?? item.product_id, 10);
      const qty = parseInt(item.quantity, 10);
      const rawCost = item.unitCost !== undefined && item.unitCost !== null
        ? item.unitCost
        : (item.unit_cost !== undefined && item.unit_cost !== null ? item.unit_cost : null);

      if (isNaN(pid) || pid <= 0) {
        throw new ValidationError('Valid product ID is required for each line item');
      }
      if (isNaN(qty) || qty <= 0) {
        throw new ValidationError('Line item quantity must be a positive integer');
      }

      let parsedCost = null;
      if (rawCost !== null) {
        parsedCost = parseFloat(rawCost);
        if (isNaN(parsedCost) || parsedCost < 0) {
          throw new ValidationError('Line item unit cost cannot be negative');
        }
      }

      if (consolidatedMap.has(pid)) {
        const existing = consolidatedMap.get(pid);
        existing.quantity += qty;
        if (parsedCost !== null) {
          existing.unitCost = parsedCost;
        }
      } else {
        consolidatedMap.set(pid, {
          productId: pid,
          quantity: qty,
          unitCost: parsedCost,
        });
      }
    }

    // 4. Validate each product exists and is active; resolve unit cost
    const validatedItems = [];
    let calculatedTotal = 0;

    for (const entry of consolidatedMap.values()) {
      const product = await productRepository.findById(entry.productId);
      if (!product) {
        throw new NotFoundError(`Product with ID ${entry.productId} not found`);
      }
      if (!product.isActive) {
        throw new UnprocessableEntityError(`Product '${product.name}' is inactive`);
      }

      // Default unit cost to product cost price if not explicitly provided
      const resolvedUnitCost = entry.unitCost !== null
        ? entry.unitCost
        : (parseFloat(product.costPrice) || 0);

      const itemTotal = entry.quantity * resolvedUnitCost;
      calculatedTotal += itemTotal;

      validatedItems.push({
        productId: entry.productId,
        quantity: entry.quantity,
        unitCost: parseFloat(resolvedUnitCost.toFixed(2)),
      });
    }

    const totalAmount = parseFloat(calculatedTotal.toFixed(2));
    const initialStatus = status === 'ordered' ? 'ordered' : 'draft';
    const orderedAt = initialStatus === 'ordered' ? new Date() : null;

    // 5. Transactional insert of PO and lines with retry on ER_DUP_ENTRY collision
    let attempts = 0;
    const maxRetries = 5;

    while (attempts < maxRetries) {
      try {
        return await withTransaction(async (conn) => {
          const poNumber = await purchaseOrderRepository.generateUniquePoNumber(conn);
          const poId = await purchaseOrderRepository.createPurchaseOrder(conn, {
            poNumber,
            supplierId: sId,
            warehouseId: wId,
            status: initialStatus,
            orderedAt,
            totalAmount,
            notes: notes ? notes.trim() : null,
            createdBy: userId,
          });

          await purchaseOrderRepository.insertPurchaseOrderItems(conn, poId, validatedItems);

          return purchaseOrderRepository.findById(poId, conn);
        });
      } catch (err) {
        if ((err.code === 'ER_DUP_ENTRY' || err.errno === 1062) && (err.sqlMessage || err.message || '').includes('po_number')) {
          attempts++;
          if (attempts >= maxRetries) throw err;
          continue;
        }
        throw err;
      }
    }
  }

  /**
   * UC-26: Retrieves paginated purchase orders with optional filtering.
   */
  async getPurchaseOrders(query = {}) {
    return purchaseOrderRepository.findAll(query);
  }

  /**
   * UC-26: Retrieves a single purchase order by ID including line items.
   */
  async getPurchaseOrderById(id) {
    const poId = parseInt(id, 10);
    if (isNaN(poId) || poId <= 0) {
      throw new ValidationError('Invalid purchase order ID');
    }

    const po = await purchaseOrderRepository.findById(poId);
    if (!po) {
      throw new NotFoundError(`Purchase order with ID ${poId} not found`);
    }

    return po;
  }

  /**
   * UC-P08 / UC-26: Updates an existing purchase order before it is marked ordered.
   * STRICT GUARD:
   * - Only allowed when current status is 'draft'. If ordered, received, or cancelled -> 409 Conflict.
   * - Allows changing supplierId, warehouseId, notes, and line items.
   * - Recalculates total_amount on the server.
   * - Re-applies the duplicate-product merge rule.
   * - Validates active supplier, active warehouse, active products.
   */
  async updatePurchaseOrder(id, {
    supplierId,
    warehouseId,
    notes = null,
    items = [],
    userId,
  }) {
    const poId = parseInt(id, 10);
    if (isNaN(poId) || poId <= 0) {
      throw new ValidationError('Invalid purchase order ID');
    }

    const sId = parseInt(supplierId, 10);
    const wId = parseInt(warehouseId, 10);

    if (isNaN(sId) || sId <= 0) {
      throw new ValidationError('Valid supplier ID is required');
    }
    if (isNaN(wId) || wId <= 0) {
      throw new ValidationError('Valid warehouse ID is required');
    }

    // 1. Validate Supplier exists and is active
    const supplier = await supplierRepository.findById(sId);
    if (!supplier) {
      throw new NotFoundError(`Supplier with ID ${sId} not found`);
    }
    if (!supplier.isActive) {
      throw new UnprocessableEntityError(`Supplier '${supplier.name}' is inactive`);
    }

    // 2. Validate Warehouse exists and is active
    const warehouse = await warehouseRepository.findById(wId);
    if (!warehouse) {
      throw new NotFoundError(`Warehouse with ID ${wId} not found`);
    }
    if (!warehouse.isActive) {
      throw new UnprocessableEntityError(`Warehouse '${warehouse.name}' is inactive`);
    }

    // 3. Validate Line Items
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ValidationError('Purchase order must contain at least one line item');
    }

    // Consolidate duplicate products if provided (UC-25 Flow A2)
    const consolidatedMap = new Map();
    for (const item of items) {
      const pid = parseInt(item.productId ?? item.product_id, 10);
      const qty = parseInt(item.quantity, 10);
      const rawCost = item.unitCost !== undefined && item.unitCost !== null
        ? item.unitCost
        : (item.unit_cost !== undefined && item.unit_cost !== null ? item.unit_cost : null);

      if (isNaN(pid) || pid <= 0) {
        throw new ValidationError('Valid product ID is required for each line item');
      }
      if (isNaN(qty) || qty <= 0) {
        throw new ValidationError('Line item quantity must be a positive integer');
      }

      let parsedCost = null;
      if (rawCost !== null) {
        parsedCost = parseFloat(rawCost);
        if (isNaN(parsedCost) || parsedCost < 0) {
          throw new ValidationError('Line item unit cost cannot be negative');
        }
      }

      if (consolidatedMap.has(pid)) {
        const existing = consolidatedMap.get(pid);
        existing.quantity += qty;
        if (parsedCost !== null) {
          existing.unitCost = parsedCost;
        }
      } else {
        consolidatedMap.set(pid, {
          productId: pid,
          quantity: qty,
          unitCost: parsedCost,
        });
      }
    }

    // 4. Validate each product exists and is active; resolve unit cost
    const validatedItems = [];
    let calculatedTotal = 0;

    for (const entry of consolidatedMap.values()) {
      const product = await productRepository.findById(entry.productId);
      if (!product) {
        throw new NotFoundError(`Product with ID ${entry.productId} not found`);
      }
      if (!product.isActive) {
        throw new UnprocessableEntityError(`Product '${product.name}' is inactive`);
      }

      const resolvedUnitCost = entry.unitCost !== null
        ? entry.unitCost
        : (parseFloat(product.costPrice) || 0);

      const itemTotal = entry.quantity * resolvedUnitCost;
      calculatedTotal += itemTotal;

      validatedItems.push({
        productId: entry.productId,
        quantity: entry.quantity,
        unitCost: parseFloat(resolvedUnitCost.toFixed(2)),
      });
    }

    const totalAmount = parseFloat(calculatedTotal.toFixed(2));

    // 5. Transactional update of PO header and replacement of line items
    return withTransaction(async (conn) => {
      const po = await purchaseOrderRepository.lockPoForUpdate(conn, poId);
      if (!po) {
        throw new NotFoundError(`Purchase order with ID ${poId} not found`);
      }

      // STRICT STATUS GUARD: Only draft POs can be edited
      if (po.status !== 'draft') {
        throw new ConflictError(`Cannot edit purchase order in status '${po.status}'. Only draft purchase orders can be edited.`);
      }

      // Update PO header
      await purchaseOrderRepository.updatePurchaseOrder(conn, poId, {
        supplierId: sId,
        warehouseId: wId,
        totalAmount,
        notes: notes ? notes.trim() : null,
      });

      // Replace items
      await purchaseOrderRepository.deletePurchaseOrderItems(conn, poId);
      await purchaseOrderRepository.insertPurchaseOrderItems(conn, poId, validatedItems);

      return purchaseOrderRepository.findById(poId, conn);
    });
  }

  /**
   * Transitions purchase order status according to strict state machine:
   * draft -> ordered -> received
   * draft / ordered -> cancelled
   * Any illegal transition returns 409 Conflict.
   */
  async updateStatus(id, newStatus, userId) {
    const poId = parseInt(id, 10);
    if (isNaN(poId) || poId <= 0) {
      throw new ValidationError('Invalid purchase order ID');
    }

    const targetStatus = (newStatus || '').trim().toLowerCase();

    if (targetStatus === 'received') {
      return this.receivePurchaseOrder(poId, userId);
    }

    if (targetStatus === 'cancelled') {
      return this.cancelPurchaseOrder(poId, userId);
    }

    if (targetStatus === 'ordered') {
      return withTransaction(async (conn) => {
        const po = await purchaseOrderRepository.lockPoForUpdate(conn, poId);
        if (!po) {
          throw new NotFoundError(`Purchase order with ID ${poId} not found`);
        }

        if (po.status === 'ordered') {
          throw new ConflictError('Purchase order is already ordered');
        }
        if (po.status === 'received') {
          throw new ConflictError('Cannot transition a received purchase order to ordered');
        }
        if (po.status === 'cancelled') {
          throw new ConflictError('Cannot transition a cancelled purchase order to ordered');
        }
        if (po.status !== 'draft') {
          throw new ConflictError(`Cannot transition purchase order from '${po.status}' to 'ordered'`);
        }

        await purchaseOrderRepository.updateStatusToOrdered(conn, poId);
        return purchaseOrderRepository.findById(poId, conn);
      });
    }

    throw new ConflictError(`Illegal status transition to '${targetStatus}'`);
  }

  /**
   * Cancels a purchase order in 'draft' or 'ordered' status.
   * Stock is NOT modified. Received POs cannot be cancelled (409 Conflict).
   */
  async cancelPurchaseOrder(id, userId) {
    const poId = parseInt(id, 10);
    if (isNaN(poId) || poId <= 0) {
      throw new ValidationError('Invalid purchase order ID');
    }

    return withTransaction(async (conn) => {
      const po = await purchaseOrderRepository.lockPoForUpdate(conn, poId);
      if (!po) {
        throw new NotFoundError(`Purchase order with ID ${poId} not found`);
      }

      if (po.status === 'cancelled') {
        throw new ConflictError('Purchase order is already cancelled');
      }
      if (po.status === 'received') {
        throw new ConflictError('Cannot cancel a purchase order that has already been received');
      }
      if (po.status !== 'draft' && po.status !== 'ordered') {
        throw new ConflictError(`Cannot cancel purchase order in status '${po.status}'`);
      }

      const affected = await purchaseOrderRepository.updateStatusToCancelled(conn, poId);
      if (affected !== 1) {
        throw new ConflictError('Purchase order cancellation conflict');
      }

      return purchaseOrderRepository.findById(poId, conn);
    });
  }

  /**
   * UC-27: Receives an ordered purchase order.
   * ATOMIC TRANSACTION:
   * 1. Locks the PO row FOR UPDATE.
   * 2. Validates status is 'ordered' (draft, cancelled, or received -> 409 Conflict).
   * 3. Executes guarded UPDATE WHERE status = 'ordered', asserting affectedRows === 1 BEFORE inventory writes.
   * 4. For each line item, invokes inventoryService to add stock and write immutable movement.
   * 5. Second attempt fails with 409 Conflict and NEVER increases stock again.
   */
  async receivePurchaseOrder(id, userId) {
    const poId = parseInt(id, 10);
    if (isNaN(poId) || poId <= 0) {
      throw new ValidationError('Invalid purchase order ID');
    }

    return withTransaction(async (conn) => {
      // 1. Acquire pessimistic lock on the PO row
      const po = await purchaseOrderRepository.lockPoForUpdate(conn, poId);
      if (!po) {
        throw new NotFoundError(`Purchase order with ID ${poId} not found`);
      }

      // 2. State verification
      if (po.status === 'draft') {
        throw new ConflictError('Cannot receive a purchase order in draft status; it must be ordered first');
      }
      if (po.status === 'received') {
        throw new ConflictError('Purchase order has already been received');
      }
      if (po.status === 'cancelled') {
        throw new ConflictError('Cannot receive a cancelled purchase order');
      }
      if (po.status !== 'ordered') {
        throw new ConflictError(`Purchase order cannot be received in status '${po.status}'`);
      }

      // 3. Guarded UPDATE BEFORE calling inventory service (critical concurrency guard)
      const affectedRows = await purchaseOrderRepository.guardedUpdateStatusToReceived(conn, {
        id: poId,
        receivedBy: userId,
      });

      if (affectedRows !== 1) {
        throw new ConflictError('Purchase order has already been received or cancelled');
      }

      // 4. Fetch line items
      const items = await purchaseOrderRepository.findItemsByPoId(poId, conn);
      if (!items || items.length === 0) {
        throw new ConflictError('Purchase order contains no line items to receive');
      }

      // 5. Invoke inventory service for each line item to increment stock & write ledger
      for (const item of items) {
        await inventoryService.addStockFromPurchaseOrder(conn, {
          productId: item.productId,
          warehouseId: po.warehouseId,
          quantity: item.quantity,
          userId,
          poId: po.id,
          poNumber: po.poNumber,
        });
      }

      // 6. Return refreshed PO representation
      return purchaseOrderRepository.findById(poId, conn);
    });
  }
}

export const purchaseOrderService = new PurchaseOrderService();
export default purchaseOrderService;

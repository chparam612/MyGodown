/**
 * ============================================================================
 * File: backend/src/services/salesOrder.service.js
 * Purpose: Business logic and transaction coordinator for Sales Orders (UC-28 to UC-30).
 * Why it exists: Enforces strict state transitions, collision-safe SO numbering,
 * line item validation, unitPrice snapshotting from catalog unitPrice, atomic guarded
 * fulfillment with inventory deduction, and cancellation rules.
 * ============================================================================
 */

import { withTransaction } from '../config/db.js';
import { salesOrderRepository } from '../repositories/salesOrder.repository.js';
import { productRepository } from '../repositories/product.repository.js';
import { warehouseRepository } from '../repositories/warehouse.repository.js';
import { inventoryService } from './inventory.service.js';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  ForbiddenError,
  UnprocessableEntityError,
} from '../utils/errors.js';

export class SalesOrderService {
  /**
   * UC-28: Creates a new sales order in 'draft' status with validated line items.
   * Snapshots current product.unitPrice (NOT costPrice).
   * Auto-calculates totals and generates collision-safe so_number.
   */
  async createSalesOrder({
    customerName,
    warehouseId,
    status = 'draft',
    notes = null,
    items = [],
    userId,
  }) {
    const rawName = (customerName || '').trim();
    if (!rawName) {
      throw new ValidationError('Customer name is required');
    }

    const wId = parseInt(warehouseId, 10);
    if (isNaN(wId) || wId <= 0) {
      throw new ValidationError('Valid warehouse ID is required');
    }

    // 1. Validate Warehouse exists and is active
    const warehouse = await warehouseRepository.findById(wId);
    if (!warehouse) {
      throw new NotFoundError(`Warehouse with ID ${wId} not found`);
    }
    if (!warehouse.isActive) {
      throw new UnprocessableEntityError(`Warehouse '${warehouse.name}' is inactive`);
    }

    // 2. Validate Line Items
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ValidationError('Sales order must contain at least one line item');
    }

    // Consolidate duplicate products if provided
    const consolidatedMap = new Map();
    for (const item of items) {
      const pid = parseInt(item.productId ?? item.product_id, 10);
      const qty = parseInt(item.quantity, 10);
      const rawPrice = item.unitPrice !== undefined && item.unitPrice !== null
        ? item.unitPrice
        : (item.unit_price !== undefined && item.unit_price !== null ? item.unit_price : null);

      if (isNaN(pid) || pid <= 0) {
        throw new ValidationError('Valid product ID is required for each line item');
      }
      if (isNaN(qty) || qty <= 0) {
        throw new ValidationError('Line item quantity must be a positive integer');
      }

      let parsedPrice = null;
      if (rawPrice !== null) {
        parsedPrice = parseFloat(rawPrice);
        if (isNaN(parsedPrice) || parsedPrice < 0) {
          throw new ValidationError('Line item unit price cannot be negative');
        }
      }

      if (consolidatedMap.has(pid)) {
        const existing = consolidatedMap.get(pid);
        existing.quantity += qty;
        if (parsedPrice !== null) {
          existing.unitPrice = parsedPrice;
        }
      } else {
        consolidatedMap.set(pid, {
          productId: pid,
          quantity: qty,
          unitPrice: parsedPrice,
        });
      }
    }

    // 3. Validate each product exists and is active; snapshot unitPrice from product.unitPrice (NOT costPrice)
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

      // Snapshot unitPrice: default to product.unitPrice (selling price)
      const resolvedUnitPrice = entry.unitPrice !== null
        ? entry.unitPrice
        : (parseFloat(product.unitPrice) || 0);

      const itemTotal = entry.quantity * resolvedUnitPrice;
      calculatedTotal += itemTotal;

      validatedItems.push({
        productId: entry.productId,
        quantity: entry.quantity,
        unitPrice: parseFloat(resolvedUnitPrice.toFixed(2)),
      });
    }

    const totalAmount = parseFloat(calculatedTotal.toFixed(2));
    const initialStatus = 'draft';

    // 4. Transactional insert of SO and lines with retry on ER_DUP_ENTRY collision
    let attempts = 0;
    const maxRetries = 5;

    while (attempts < maxRetries) {
      try {
        return await withTransaction(async (conn) => {
          const soNumber = await salesOrderRepository.generateUniqueSoNumber(conn);
          const soId = await salesOrderRepository.createSalesOrder(conn, {
            soNumber,
            customerName: rawName,
            warehouseId: wId,
            status: initialStatus,
            totalAmount,
            notes: notes ? notes.trim() : null,
            createdBy: userId,
          });

          await salesOrderRepository.insertSalesOrderItems(conn, soId, validatedItems);

          return salesOrderRepository.findById(soId, conn);
        });
      } catch (err) {
        if ((err.code === 'ER_DUP_ENTRY' || err.errno === 1062) && (err.sqlMessage || err.message || '').includes('so_number')) {
          attempts++;
          if (attempts >= maxRetries) throw err;
          continue;
        }
        throw err;
      }
    }
  }

  /**
   * UC-29: Retrieves paginated sales orders with optional filtering.
   */
  async getSalesOrders(query = {}) {
    return salesOrderRepository.findAll(query);
  }

  /**
   * UC-29: Retrieves a single sales order by ID including line items.
   */
  async getSalesOrderById(id) {
    const soId = parseInt(id, 10);
    if (isNaN(soId) || soId <= 0) {
      throw new ValidationError('Invalid sales order ID');
    }

    const so = await salesOrderRepository.findById(soId);
    if (!so) {
      throw new NotFoundError(`Sales order with ID ${soId} not found`);
    }

    return so;
  }

  /**
   * Confirms a sales order (draft -> confirmed).
   * Stock remains unchanged.
   */
  async confirmSalesOrder(id, userId) {
    const soId = parseInt(id, 10);
    if (isNaN(soId) || soId <= 0) {
      throw new ValidationError('Invalid sales order ID');
    }

    return withTransaction(async (conn) => {
      const so = await salesOrderRepository.lockSoForUpdate(conn, soId);
      if (!so) {
        throw new NotFoundError(`Sales order with ID ${soId} not found`);
      }

      if (so.status === 'confirmed') {
        throw new ConflictError('Sales order is already confirmed');
      }
      if (so.status === 'fulfilled') {
        throw new ConflictError('Cannot confirm a fulfilled sales order');
      }
      if (so.status === 'cancelled') {
        throw new ConflictError('Cannot confirm a cancelled sales order');
      }
      if (so.status !== 'draft') {
        throw new ConflictError(`Cannot confirm sales order in status '${so.status}'`);
      }

      await salesOrderRepository.updateStatusToConfirmed(conn, soId);
      return salesOrderRepository.findById(soId, conn);
    });
  }

  /**
   * UC-30: Fulfills a confirmed sales order in ONE transaction.
   * STRICT GUARD & ATOMICITY:
   * 1. Locks the SO row FOR UPDATE.
   * 2. Asserts status is 'confirmed' (draft, fulfilled, or cancelled -> 409 Conflict).
   * 3. Executes guarded UPDATE WHERE status = 'confirmed', asserting affectedRows === 1 BEFORE inventory writes.
   * 4. For each line item, invokes inventoryService.deductStockForSalesOrder.
   * 5. If ANY line lacks available stock, throws InsufficientStockError (422), rolling back everything.
   * 6. Double fulfillment returns 409 Conflict and NEVER deducts stock again.
   */
  async fulfillSalesOrder(id, userId) {
    const soId = parseInt(id, 10);
    if (isNaN(soId) || soId <= 0) {
      throw new ValidationError('Invalid sales order ID');
    }

    return withTransaction(async (conn) => {
      // 1. Acquire pessimistic lock on the SO row
      const so = await salesOrderRepository.lockSoForUpdate(conn, soId);
      if (!so) {
        throw new NotFoundError(`Sales order with ID ${soId} not found`);
      }

      // 2. State verification
      if (so.status === 'draft') {
        throw new ConflictError('Cannot fulfill a draft sales order; it must be confirmed first');
      }
      if (so.status === 'fulfilled') {
        throw new ConflictError('Sales order has already been fulfilled');
      }
      if (so.status === 'cancelled') {
        throw new ConflictError('Cannot fulfill a cancelled sales order');
      }
      if (so.status !== 'confirmed') {
        throw new ConflictError(`Sales order cannot be fulfilled in status '${so.status}'`);
      }

      // 3. Guarded UPDATE BEFORE calling inventory service (critical concurrency guard)
      const affectedRows = await salesOrderRepository.guardedUpdateStatusToFulfilled(conn, soId);
      if (affectedRows !== 1) {
        throw new ConflictError('Sales order has already been fulfilled or cancelled');
      }

      // 4. Fetch line items (ordered by product_id ASC for deadlock prevention)
      const items = await salesOrderRepository.findItemsBySoId(soId, conn);
      if (!items || items.length === 0) {
        throw new ConflictError('Sales order contains no line items to fulfill');
      }

      // 5. Invoke inventory service for each line item to deduct stock & write ledger
      // If any product lacks stock, InsufficientStockError (422) is thrown and rolls back the transaction.
      for (const item of items) {
        await inventoryService.deductStockForSalesOrder(conn, {
          productId: item.productId,
          warehouseId: so.warehouseId,
          quantity: item.quantity,
          userId,
          soId: so.id,
          soNumber: so.soNumber,
        });
      }

      // 6. Return refreshed SO representation
      return salesOrderRepository.findById(soId, conn);
    });
  }

  /**
   * Cancels a sales order in 'draft' or 'confirmed' status.
   * RBAC: Allowed for Admin and Manager only.
   * NEVER allowed once fulfilled (409 Conflict).
   * Stock is NOT modified.
   */
  async cancelSalesOrder(id, userId, userRole) {
    if (userRole === 'staff') {
      throw new ForbiddenError('Staff users are not permitted to cancel sales orders');
    }

    const soId = parseInt(id, 10);
    if (isNaN(soId) || soId <= 0) {
      throw new ValidationError('Invalid sales order ID');
    }

    return withTransaction(async (conn) => {
      const so = await salesOrderRepository.lockSoForUpdate(conn, soId);
      if (!so) {
        throw new NotFoundError(`Sales order with ID ${soId} not found`);
      }

      if (so.status === 'cancelled') {
        throw new ConflictError('Sales order is already cancelled');
      }
      if (so.status === 'fulfilled') {
        throw new ConflictError('Cannot cancel a sales order that has already been fulfilled');
      }
      if (so.status !== 'draft' && so.status !== 'confirmed') {
        throw new ConflictError(`Cannot cancel sales order in status '${so.status}'`);
      }

      const affected = await salesOrderRepository.updateStatusToCancelled(conn, soId);
      if (affected !== 1) {
        throw new ConflictError('Sales order cancellation conflict');
      }

      return salesOrderRepository.findById(soId, conn);
    });
  }

  /**
   * UC-30: Transitions sales order status according to strict state machine:
   * draft -> confirmed -> fulfilled
   * draft / confirmed -> cancelled (admin, manager only)
   * Any illegal transition returns 409 Conflict.
   */
  async updateStatus(id, newStatus, userId, userRole) {
    const targetStatus = (newStatus || '').trim().toLowerCase();

    if (targetStatus === 'confirmed') {
      return this.confirmSalesOrder(id, userId);
    }

    if (targetStatus === 'fulfilled') {
      return this.fulfillSalesOrder(id, userId);
    }

    if (targetStatus === 'cancelled') {
      return this.cancelSalesOrder(id, userId, userRole);
    }

    throw new ConflictError(`Illegal status transition to '${targetStatus}'`);
  }
}

export const salesOrderService = new SalesOrderService();
export default salesOrderService;

/**
 * ============================================================================
 * File: backend/src/services/inventory.service.js
 * Purpose: Authoritative business logic and transaction coordinator for Inventory (UC-14 to UC-20).
 * Why it exists: Enforces the architectural rule that ONLY this service writes
 * to stock_levels and stock_movements, executing all updates inside ACID transactions
 * with pessimistic locking (SELECT ... FOR UPDATE) and deadlock prevention.
 * ============================================================================
 */

import { withTransaction } from '../config/db.js';
import { inventoryRepository } from '../repositories/inventory.repository.js';
import { productRepository } from '../repositories/product.repository.js';
import { warehouseRepository } from '../repositories/warehouse.repository.js';
import {
  NotFoundError,
  ValidationError,
  InsufficientStockError,
  UnprocessableEntityError,
} from '../utils/errors.js';

export class InventoryService {
  /**
   * UC-14: Retrieves paginated overview of inventory stock levels.
   */
  async getInventory(query = {}, userRole) {
    return inventoryRepository.findAllStockLevels({
      ...query,
      userRole,
    });
  }

  /**
   * UC-15: Checks product stock availability per-warehouse and system-wide.
   */
  async checkAvailability(productId, warehouseId = null, requestedQuantity = null) {
    const product = await productRepository.findById(productId);
    if (!product) {
      throw new NotFoundError(`Product with ID ${productId} not found`);
    }

    if (warehouseId) {
      const warehouse = await warehouseRepository.findById(warehouseId);
      if (!warehouse) {
        throw new NotFoundError(`Warehouse with ID ${warehouseId} not found`);
      }
    }

    return inventoryRepository.findAvailability(productId, warehouseId, requestedQuantity);
  }

  /**
   * UC-20: Retrieves products whose stock levels are at or below reorder threshold.
   * Strips costPrice for staff users (BR-05).
   */
  async getLowStock(query = {}, userRole) {
    return inventoryRepository.findLowStock({
      ...query,
      userRole,
    });
  }

  /**
   * UC-19: Retrieves historical audit log of stock movements with multi-attribute filtering.
   */
  async getMovements(query = {}) {
    return inventoryRepository.findAllMovements(query);
  }

  /**
   * UC-16: Records a single warehouse stock movement ('in', 'out', 'adjustment').
   * Runs in ACID transaction with pessimistic row lock.
   */
  async recordMovement({ productId, warehouseId, movementType, quantity, reference = null, userId }) {
    const product = await productRepository.findById(productId);
    if (!product) {
      throw new NotFoundError(`Product with ID ${productId} not found`);
    }
    if (!product.isActive) {
      throw new UnprocessableEntityError(`Cannot record movement for deactivated product '${product.name}'`);
    }

    const warehouse = await warehouseRepository.findById(warehouseId);
    if (!warehouse) {
      throw new NotFoundError(`Warehouse with ID ${warehouseId} not found`);
    }
    if (!warehouse.isActive) {
      throw new UnprocessableEntityError(`Cannot record movement for inactive warehouse '${warehouse.name}'`);
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      throw new ValidationError('Movement quantity must be a positive integer');
    }

    return withTransaction(async (conn) => {
      // 1. Lock stock row FOR UPDATE
      const currentStockRow = await inventoryRepository.lockStockLevelForUpdate(conn, productId, warehouseId);
      const currentStock = currentStockRow ? currentStockRow.quantity : 0;

      let newStock;
      if (movementType === 'out') {
        if (currentStock < qty) {
          throw new InsufficientStockError(
            `Insufficient stock available for this operation. Requested: ${qty}, Available: ${currentStock}`
          );
        }
        newStock = currentStock - qty;
      } else if (movementType === 'in') {
        newStock = currentStock + qty;
      } else if (movementType === 'adjustment') {
        newStock = currentStock + qty;
        if (newStock < 0) {
          throw new InsufficientStockError(
            `Adjustment results in negative stock: ${newStock}`
          );
        }
      } else {
        throw new ValidationError(`Invalid movement type '${movementType}'`);
      }

      // 2. Update stock level
      await inventoryRepository.upsertStockLevel(conn, productId, warehouseId, newStock);

      // 3. Record movement audit entry
      const movementId = await inventoryRepository.insertStockMovement(conn, {
        productId,
        warehouseId,
        userId,
        movementType,
        referenceType: 'manual',
        referenceId: null,
        quantity: qty,
        reference,
      });

      return {
        movementId,
        productId,
        warehouseId,
        previousStock: currentStock,
        newStock,
        quantity: qty,
        movementType,
        reference,
      };
    });
  }

  /**
   * UC-17: Adjusts warehouse stock to an audited physical count (Admin / Manager only).
   * Enforces REQUIRED non-empty reason and records signed delta.
   */
  async adjustStock({ productId, warehouseId, countedQuantity, reason, userId }) {
    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
      throw new ValidationError('Adjustment reason is required');
    }

    const targetQuantity = parseInt(countedQuantity, 10);
    if (isNaN(targetQuantity) || targetQuantity < 0) {
      throw new ValidationError('Counted quantity cannot be negative');
    }

    const product = await productRepository.findById(productId);
    if (!product) {
      throw new NotFoundError(`Product with ID ${productId} not found`);
    }
    if (!product.isActive) {
      throw new UnprocessableEntityError(`Cannot adjust stock for deactivated product '${product.name}'`);
    }

    const warehouse = await warehouseRepository.findById(warehouseId);
    if (!warehouse) {
      throw new NotFoundError(`Warehouse with ID ${warehouseId} not found`);
    }
    if (!warehouse.isActive) {
      throw new UnprocessableEntityError(`Cannot adjust stock in inactive warehouse '${warehouse.name}'`);
    }

    const cleanReason = reason.trim();

    return withTransaction(async (conn) => {
      // 1. Lock current stock row
      const currentStockRow = await inventoryRepository.lockStockLevelForUpdate(conn, productId, warehouseId);
      const currentStock = currentStockRow ? currentStockRow.quantity : 0;
      const delta = targetQuantity - currentStock;

      // 2. Update stock level to counted quantity
      await inventoryRepository.upsertStockLevel(conn, productId, warehouseId, targetQuantity);

      // 3. Record adjustment movement with signed delta
      const movementId = await inventoryRepository.insertStockMovement(conn, {
        productId,
        warehouseId,
        userId,
        movementType: 'adjustment',
        referenceType: 'adjustment',
        referenceId: null,
        quantity: delta,
        reference: cleanReason,
      });

      return {
        movementId,
        productId,
        warehouseId,
        previousQuantity: currentStock,
        countedQuantity: targetQuantity,
        delta,
        reason: cleanReason,
      };
    });
  }

  /**
   * UC-18: Transfers stock between two distinct active warehouses (Admin / Manager only).
   * Deadlock prevention: Always acquires locks in ascending warehouse_id order.
   * Atomicity: Two linked stock movements share a unique transfer reference.
   */
  async transferStock({ productId, sourceWarehouseId, destinationWarehouseId, quantity, reason = null, userId }) {
    const srcId = parseInt(sourceWarehouseId, 10);
    const dstId = parseInt(destinationWarehouseId, 10);
    const transferQty = parseInt(quantity, 10);

    // Guard: Source and Destination must differ
    if (srcId === dstId) {
      throw new ValidationError('Source and destination warehouses cannot be the same');
    }

    if (isNaN(transferQty) || transferQty <= 0) {
      throw new ValidationError('Transfer quantity must be greater than zero');
    }

    // Verify product exists and active
    const product = await productRepository.findById(productId);
    if (!product) {
      throw new NotFoundError(`Product with ID ${productId} not found`);
    }
    if (!product.isActive) {
      throw new UnprocessableEntityError(`Cannot transfer stock for deactivated product '${product.name}'`);
    }

    // Verify source warehouse
    const srcWarehouse = await warehouseRepository.findById(srcId);
    if (!srcWarehouse) {
      throw new NotFoundError(`Source warehouse with ID ${srcId} not found`);
    }
    if (!srcWarehouse.isActive) {
      throw new UnprocessableEntityError(`Cannot transfer stock from inactive warehouse '${srcWarehouse.name}'`);
    }

    // Verify destination warehouse
    const dstWarehouse = await warehouseRepository.findById(dstId);
    if (!dstWarehouse) {
      throw new NotFoundError(`Destination warehouse with ID ${dstId} not found`);
    }
    if (!dstWarehouse.isActive) {
      throw new UnprocessableEntityError(`Cannot transfer stock to inactive warehouse '${dstWarehouse.name}'`);
    }

    // Deadlock Prevention: Order warehouse IDs numerically
    const isSrcFirst = srcId < dstId;
    const firstLockId = isSrcFirst ? srcId : dstId;
    const secondLockId = isSrcFirst ? dstId : srcId;

    return withTransaction(async (conn) => {
      // 1. Acquire row locks in deterministic ascending order
      const firstRow = await inventoryRepository.lockStockLevelForUpdate(conn, productId, firstLockId);
      const secondRow = await inventoryRepository.lockStockLevelForUpdate(conn, productId, secondLockId);

      const srcRow = isSrcFirst ? firstRow : secondRow;
      const dstRow = isSrcFirst ? secondRow : firstRow;

      const srcQty = srcRow ? srcRow.quantity : 0;
      const dstQty = dstRow ? dstRow.quantity : 0;

      // 2. Validate source availability
      if (srcQty < transferQty) {
        throw new InsufficientStockError(
          `Insufficient stock in source warehouse '${srcWarehouse.name}' for transfer. Available: ${srcQty}, Requested: ${transferQty}`
        );
      }

      // 3. Compute new balances
      const newSrcQty = srcQty - transferQty;
      const newDstQty = dstQty + transferQty;

      // 4. Update both warehouse balances
      await inventoryRepository.upsertStockLevel(conn, productId, srcId, newSrcQty);
      await inventoryRepository.upsertStockLevel(conn, productId, dstId, newDstQty);

      // 5. Generate shared transfer reference
      const transferRef = `TRF-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      const userNote = reason ? `: ${reason.trim()}` : '';
      const srcMovementRef = `${transferRef} (Transfer to WH ${dstId}${userNote})`;
      const dstMovementRef = `${transferRef} (Transfer from WH ${srcId}${userNote})`;

      // 6. Record twin audit movements (both movements share the same reference_id = sourceMovementId)
      const sourceMovementId = await inventoryRepository.insertStockMovement(conn, {
        productId,
        warehouseId: srcId,
        userId,
        movementType: 'out',
        referenceType: 'transfer',
        referenceId: null,
        quantity: transferQty,
        reference: srcMovementRef,
      });

      // Update source movement so both movements share sourceMovementId
      await inventoryRepository.updateMovementReference(conn, sourceMovementId, {
        referenceType: 'transfer',
        referenceId: sourceMovementId,
      });

      const destinationMovementId = await inventoryRepository.insertStockMovement(conn, {
        productId,
        warehouseId: dstId,
        userId,
        movementType: 'in',
        referenceType: 'transfer',
        referenceId: sourceMovementId,
        quantity: transferQty,
        reference: dstMovementRef,
      });

      return {
        productId,
        sourceWarehouseId: srcId,
        destinationWarehouseId: dstId,
        quantity: transferQty,
        transferReference: transferRef,
        sourceRemainingStock: newSrcQty,
        destinationNewStock: newDstQty,
        sourceMovementId,
        destinationMovementId,
        notes: reason || null,
      };
    });
  }
}

export const inventoryService = new InventoryService();
export default inventoryService;

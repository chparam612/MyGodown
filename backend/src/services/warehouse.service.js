/**
 * ============================================================================
 * File: backend/src/services/warehouse.service.js
 * Purpose: Business logic service for Warehouse Management (UC-11 to UC-13).
 * Why it exists: Enforces business constraints (unique code 409, code immutability 400,
 * stock guard on deactivation 422, staff inactive hiding 404) keeping controllers slim.
 * ============================================================================
 */

import { warehouseRepository } from '../repositories/warehouse.repository.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  UnprocessableEntityError,
} from '../utils/errors.js';
import { ROLES } from '../middleware/permissions.js';

export class WarehouseService {
  /**
   * UC-11: Creates a new warehouse facility (Admin only).
   * Enforces natural code uniqueness (409 Conflict).
   */
  async createWarehouse({ name, code, address, city, isActive = true }) {
    const normalizedCode = code.trim().toUpperCase();

    const existing = await warehouseRepository.findByCode(normalizedCode);
    if (existing) {
      throw new ConflictError(`A warehouse with code '${normalizedCode}' already exists`);
    }

    return warehouseRepository.create({
      name: name.trim(),
      code: normalizedCode,
      address: address ? address.trim() : null,
      city: city.trim(),
      isActive: isActive !== false,
    });
  }

  /**
   * UC-12: Lists warehouses with pagination, search, and active filters.
   * Staff cannot view inactive facilities.
   */
  async listWarehouses(query = {}, userRole = ROLES.STAFF) {
    const {
      page = 1,
      limit = 20,
      search,
      city,
      isActive,
      is_active,
      sortBy = 'id',
      sortOrder = 'asc',
    } = query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    // Handle active filter with role-based restriction
    const rawActive = isActive !== undefined ? isActive : is_active;
    let activeFilter;

    if (userRole === ROLES.STAFF) {
      // Staff can never view inactive warehouses
      if (rawActive === false || rawActive === 'false' || rawActive === 0 || rawActive === '0') {
        return {
          warehouses: [],
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: 0,
            totalPages: 1,
          },
        };
      }
      activeFilter = true;
    } else {
      // Admin / Manager can filter explicitly, defaults to active only if omitted
      if (rawActive !== undefined) {
        activeFilter = rawActive === true || rawActive === 'true' || rawActive === 1 || rawActive === '1';
      } else {
        activeFilter = true;
      }
    }

    const { warehouses, total, totalPages } = await warehouseRepository.findAll({
      page: pageNum,
      limit: limitNum,
      search,
      city,
      isActive: activeFilter,
      sortBy,
      sortOrder,
    });

    return {
      warehouses,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
    };
  }

  /**
   * UC-12: Retrieves single warehouse details including stock summary.
   * Returns 404 if inactive warehouse is requested by Staff.
   */
  async getWarehouseById(id, userRole = ROLES.STAFF) {
    const warehouse = await warehouseRepository.findById(id);
    if (!warehouse) {
      throw new NotFoundError(`Warehouse with ID ${id} not found`);
    }

    if (!warehouse.isActive && userRole === ROLES.STAFF) {
      throw new NotFoundError(`Warehouse with ID ${id} not found`);
    }

    return warehouse;
  }

  /**
   * UC-13: Updates warehouse attributes (Admin only).
   * - Warehouse code is immutable after creation (400 Bad Request).
   * - Deactivation blocked if warehouse currently holds inventory stock > 0 (422 Unprocessable Entity).
   */
  async updateWarehouse(id, updateData) {
    const warehouse = await warehouseRepository.findById(id);
    if (!warehouse) {
      throw new NotFoundError(`Warehouse with ID ${id} not found`);
    }

    // Guard: Warehouse code is immutable after creation
    if (updateData.code && updateData.code.trim().toUpperCase() !== warehouse.code) {
      throw new ValidationError('Warehouse code cannot be modified after creation');
    }

    // Guard: Prevent deactivation if warehouse contains physical stock (BR-08)
    const deactivating =
      updateData.isActive === false ||
      updateData.isActive === 0 ||
      updateData.is_active === false ||
      updateData.is_active === 0;

    if (deactivating && warehouse.isActive) {
      const currentStock = await warehouseRepository.getTotalStock(id);
      if (currentStock > 0) {
        throw new UnprocessableEntityError(
          `Cannot deactivate warehouse that currently holds inventory stock (${currentStock} units on hand). Transfer or adjust stock to 0 first.`
        );
      }
    }

    return warehouseRepository.update(id, updateData);
  }

  /**
   * UC-13: Soft-deactivates warehouse (Admin only).
   * Guarded against deactivating facilities holding stock > 0 (422 Unprocessable Entity).
   */
  async deactivateWarehouse(id) {
    const warehouse = await warehouseRepository.findById(id);
    if (!warehouse) {
      throw new NotFoundError(`Warehouse with ID ${id} not found`);
    }

    if (!warehouse.isActive) {
      return { id: Number(id), isActive: false, message: 'Warehouse is already inactive' };
    }

    // Guard: Check stock before soft-deactivating
    const currentStock = await warehouseRepository.getTotalStock(id);
    if (currentStock > 0) {
      throw new UnprocessableEntityError(
        `Cannot deactivate warehouse that currently holds inventory stock (${currentStock} units on hand). Transfer or adjust stock to 0 first.`
      );
    }

    await warehouseRepository.softDeactivate(id);
    return {
      id: Number(id),
      isActive: false,
      message: 'Warehouse successfully deactivated',
    };
  }
}

export const warehouseService = new WarehouseService();
export default warehouseService;

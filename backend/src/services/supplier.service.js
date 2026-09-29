/**
 * ============================================================================
 * File: backend/src/services/supplier.service.js
 * Purpose: Business logic service for Supplier Management (UC-21 to UC-24).
 * Why it exists: Enforces business rules (unique name/email, open PO protection,
 * role-based inactive filtering, soft deletion) independent of HTTP transport.
 * ============================================================================
 */

import { supplierRepository } from '../repositories/supplier.repository.js';
import {
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
} from '../utils/errors.js';
import { ROLES } from '../middleware/permissions.js';

export class SupplierService {
  /**
   * UC-21: Adds a new supplier with unique name and email checks.
   */
  async createSupplier({ name, contactName = null, email = null, phone = null, address = null, isActive = true }) {
    const cleanName = name.trim();
    const cleanEmail = email ? email.trim().toLowerCase() : null;

    // Check duplicate email (application-level check)
    if (cleanEmail) {
      const existingByEmail = await supplierRepository.findByEmail(cleanEmail);
      if (existingByEmail) {
        throw new ConflictError(`Supplier with email '${cleanEmail}' already exists`);
      }
    }

    return supplierRepository.create({
      name: cleanName,
      contactName: contactName ? contactName.trim() : null,
      email: cleanEmail,
      phone: phone ? phone.trim() : null,
      address: address ? address.trim() : null,
      isActive,
    });
  }

  /**
   * UC-22: Lists and searches suppliers with pagination and RBAC inactive filtering.
   */
  async getSuppliers({ page = 1, limit = 20, search, isActive, sortBy = 'name', sortOrder = 'asc', userRole }) {
    let effectiveIsActive = isActive;

    // Staff cannot view inactive suppliers
    if (userRole === ROLES.STAFF) {
      if (isActive === false) {
        return {
          suppliers: [],
          total: 0,
          page: Math.max(1, parseInt(page, 10) || 1),
          limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
          totalPages: 0,
        };
      }
      effectiveIsActive = true;
    } else if (isActive === undefined) {
      // Default to active suppliers for admin/manager unless explicitly filtered
      effectiveIsActive = true;
    }

    return supplierRepository.findAll({
      page,
      limit,
      search,
      isActive: effectiveIsActive,
      sortBy,
      sortOrder,
    });
  }

  /**
   * UC-22: Gets supplier details by primary key ID.
   */
  async getSupplierById(id, userRole) {
    const supplier = await supplierRepository.findById(id);
    if (!supplier) {
      throw new NotFoundError(`Supplier with ID ${id} not found`);
    }

    // Staff receives 404 for inactive suppliers (consistent with products and warehouses)
    if (userRole === ROLES.STAFF && !supplier.isActive) {
      throw new NotFoundError(`Supplier with ID ${id} not found`);
    }

    return supplier;
  }

  /**
   * UC-23: Updates supplier metadata and handles reactivation or deactivation guards.
   */
  async updateSupplier(id, updateData, userRole) {
    const supplier = await supplierRepository.findById(id);
    if (!supplier) {
      throw new NotFoundError(`Supplier with ID ${id} not found`);
    }

    // Validate email uniqueness if changed (application-level check)
    if (updateData.email && updateData.email.trim().toLowerCase() !== (supplier.email ? supplier.email.toLowerCase() : null)) {
      const existingEmail = await supplierRepository.findByEmail(updateData.email.trim().toLowerCase());
      if (existingEmail && existingEmail.id !== Number(id)) {
        throw new ConflictError(`Supplier with email '${updateData.email.trim().toLowerCase()}' already exists`);
      }
    }

    // Guard: If deactivating via update (isActive: false), check open purchase orders
    if (updateData.isActive === false && supplier.isActive === true) {
      const openPoCount = await supplierRepository.countOpenPurchaseOrders(id);
      if (openPoCount > 0) {
        throw new UnprocessableEntityError(
          `Cannot deactivate supplier with open purchase orders awaiting receipt (${openPoCount} open POs)`
        );
      }
    }

    const payload = { ...updateData };
    if (payload.name) payload.name = payload.name.trim();
    if (payload.email) payload.email = payload.email.trim().toLowerCase();
    if (payload.contactName) payload.contactName = payload.contactName.trim();
    if (payload.phone) payload.phone = payload.phone.trim();
    if (payload.address) payload.address = payload.address.trim();

    return supplierRepository.update(id, payload);
  }

  /**
   * UC-24: Soft-deactivates a supplier (BR-07: blocked by open purchase orders).
   */
  async deactivateSupplier(id) {
    const supplier = await supplierRepository.findById(id);
    if (!supplier) {
      throw new NotFoundError(`Supplier with ID ${id} not found`);
    }

    if (!supplier.isActive) {
      return supplier;
    }

    // BR-07: A supplier with purchase orders still awaiting receipt cannot be deactivated
    const openPoCount = await supplierRepository.countOpenPurchaseOrders(id);
    if (openPoCount > 0) {
      throw new UnprocessableEntityError(
        `Cannot deactivate supplier with open purchase orders awaiting receipt (${openPoCount} open POs)`
      );
    }

    return supplierRepository.update(id, { isActive: false });
  }
}

export const supplierService = new SupplierService();
export default supplierService;

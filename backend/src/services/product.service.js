/**
 * ============================================================================
 * File: backend/src/services/product.service.js
 * Purpose: Business logic and rules orchestration for Product Management (Module 2).
 * Why it exists: Enforces business rules (BR-04 SKU uniqueness/immutability,
 * BR-05 cost price visibility per role, BR-07 soft delete, active supplier check)
 * before persisting via repositories.
 * ============================================================================
 */

import productRepository from '../repositories/product.repository.js';
import supplierRepository from '../repositories/supplier.repository.js';
import {
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
  ForbiddenError,
} from '../utils/errors.js';

export class ProductService {
  /**
   * Registers a new catalog product (UC-07).
   * Validates SKU uniqueness (409) and active supplier relationship (422).
   */
  async createProduct({
    sku,
    name,
    description,
    category,
    unitPrice,
    costPrice,
    reorderLevel,
    supplierId,
  }) {
    // 1. Verify SKU uniqueness (BR-04)
    const existingProduct = await productRepository.findBySku(sku);
    if (existingProduct) {
      throw new ConflictError('SKU already exists');
    }

    // 2. Verify supplier exists and is active (BR-07)
    const supplier = await supplierRepository.findById(supplierId);
    if (!supplier || !supplier.isActive) {
      throw new UnprocessableEntityError('Supplier does not exist or is inactive');
    }

    // 3. Persist product record
    return productRepository.create({
      sku,
      name,
      description,
      category,
      unitPrice,
      costPrice,
      reorderLevel,
      supplierId,
      isActive: 1,
    });
  }

  /**
   * Lists products with filtering, search, and pagination (UC-08).
   * Masks cost price from Staff role (BR-05).
   * Restricts Staff from viewing inactive products (BR-07).
   */
  async getProducts(filters, userRole) {
    const queryFilters = { ...filters };

    // Default listing hides inactive products (BR-07); only Admin/Manager may pass isActive=false
    if (queryFilters.isActive === undefined) {
      queryFilters.isActive = true;
    }

    // Staff cannot view inactive products
    if (userRole === 'staff') {
      if (queryFilters.isActive === false) {
        // Staff explicitly asked for inactive products -> return empty set
        return {
          products: [],
          meta: {
            total: 0,
            page: queryFilters.page || 1,
            limit: queryFilters.limit || 10,
            totalPages: 1,
          },
        };
      }
      queryFilters.isActive = true;
    }

    const result = await productRepository.findAll(queryFilters);

    // Enforce BR-05: Hide cost price from Staff users
    if (userRole === 'staff') {
      result.products.forEach((product) => {
        delete product.costPrice;
      });
    }

    return {
      products: result.products,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    };
  }

  /**
   * Retrieves single product by ID (UC-08).
   * Masks cost price from Staff role (BR-05).
   */
  async getProductById(id, userRole) {
    const product = await productRepository.findById(id);
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    // Staff cannot view inactive products
    if (userRole === 'staff' && !product.isActive) {
      throw new NotFoundError('Product not found');
    }

    // Enforce BR-05: Hide cost price from Staff users
    if (userRole === 'staff') {
      delete product.costPrice;
    }

    return product;
  }

  /**
   * Updates an existing product (UC-09).
   * SKU is immutable (BR-04). Validates active supplier if changed (422).
   */
  async updateProduct(id, updateData) {
    const existing = await productRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Product not found');
    }

    // If updating supplier, verify that new supplier exists and is active
    if (updateData.supplierId !== undefined) {
      const supplier = await supplierRepository.findById(updateData.supplierId);
      if (!supplier || !supplier.isActive) {
        throw new UnprocessableEntityError('Supplier does not exist or is inactive');
      }
    }

    return productRepository.update(id, updateData);
  }

  /**
   * Soft-deactivates a product (UC-10, BR-07).
   * Calculates remaining stock for advisory feedback.
   */
  async deactivateProduct(id) {
    const existing = await productRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Product not found');
    }

    const remainingStock = await productRepository.getTotalStock(id);
    const deactivated = await productRepository.softDeactivate(id);

    return {
      ...deactivated,
      remainingStock,
      notice:
        remainingStock > 0
          ? `Product deactivated. Notice: ${remainingStock} units remain in inventory.`
          : 'Product deactivated successfully',
    };
  }
}

export default new ProductService();

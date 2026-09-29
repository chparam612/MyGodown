/**
 * ============================================================================
 * File: backend/src/controllers/product.controller.js
 * Purpose: HTTP Request Handler for Product Management endpoints.
 * Why it exists: Translates incoming HTTP requests into service method calls
 * and shapes standard JSON response envelopes. Controllers do zero SQL.
 * ============================================================================
 */

import productService from '../services/product.service.js';
import { successResponse } from '../utils/response.js';

export class ProductController {
  /**
   * POST /api/products
   * Registers a new product (UC-07)
   */
  async create(req, res) {
    const product = await productService.createProduct(req.body);
    return successResponse(res, product, 201);
  }

  /**
   * GET /api/products
   * Lists products with search, filtering, and pagination (UC-08)
   */
  async list(req, res) {
    const { products, meta } = await productService.getProducts(req.query, req.user.role);
    return successResponse(res, products, 200, meta);
  }

  /**
   * GET /api/products/:id
   * Retrieves single product by ID (UC-08)
   */
  async getById(req, res) {
    const product = await productService.getProductById(req.params.id, req.user.role);
    return successResponse(res, product, 200);
  }

  /**
   * PUT /api/products/:id
   * Updates an existing product (UC-09)
   */
  async update(req, res) {
    const product = await productService.updateProduct(req.params.id, req.body);
    return successResponse(res, product, 200);
  }

  /**
   * DELETE /api/products/:id
   * Soft-deactivates an existing product (UC-10)
   */
  async deactivate(req, res) {
    const result = await productService.deactivateProduct(req.params.id);
    return successResponse(res, result, 200);
  }
}

export default new ProductController();

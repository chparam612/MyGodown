import { axiosClient } from './axiosClient.js';

export const productsApi = {
  /**
   * UC-08: List products with pagination, search, category & active status filters
   */
  list: (params) => axiosClient.get('/products', { params }),

  /**
   * UC-08: Get product details by ID (includes warehouse stock distribution)
   */
  getById: (id) => axiosClient.get(`/products/${id}`),

  /**
   * UC-07: Create new product (Admin, Manager)
   */
  create: (data) => axiosClient.post('/products', data),

  /**
   * UC-09: Update product details (Admin, Manager - SKU is immutable)
   */
  update: (id, data) => axiosClient.put(`/products/${id}`, data),

  /**
   * UC-10: Soft-deactivate product (Admin, Manager)
   */
  deactivate: (id) => axiosClient.delete(`/products/${id}`),
};

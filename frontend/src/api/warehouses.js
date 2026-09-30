import { axiosClient } from './axiosClient.js';

export const warehousesApi = {
  /**
   * UC-12: List warehouses with pagination and search
   */
  list: (params) => axiosClient.get('/warehouses', { params }),

  /**
   * UC-12: Get warehouse details by ID with product/stock summary
   */
  getById: (id) => axiosClient.get(`/warehouses/${id}`),

  /**
   * UC-11: Create a new warehouse (Admin only)
   */
  create: (data) => axiosClient.post('/warehouses', data),

  /**
   * UC-13: Update warehouse details (Admin only - Code is immutable)
   */
  update: (id, data) => axiosClient.put(`/warehouses/${id}`, data),

  /**
   * UC-13: Soft-deactivate warehouse (Admin only - fails with 422 if stock exists)
   */
  deactivate: (id) => axiosClient.delete(`/warehouses/${id}`),
};

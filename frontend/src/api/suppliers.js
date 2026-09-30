import { axiosClient } from './axiosClient.js';

export const suppliersApi = {
  /**
   * UC-22: List suppliers with search and active status filter
   */
  list: (params) => axiosClient.get('/suppliers', { params }),

  /**
   * UC-22: Get supplier details by ID with productCount
   */
  getById: (id) => axiosClient.get(`/suppliers/${id}`),

  /**
   * UC-21: Create new supplier (Admin, Manager - names are not required to be unique)
   */
  create: (data) => axiosClient.post('/suppliers', data),

  /**
   * UC-23: Update supplier details (Admin, Manager)
   */
  update: (id, data) => axiosClient.put(`/suppliers/${id}`, data),

  /**
   * UC-24: Soft-deactivate supplier (Admin, Manager - fails with 422 if open POs exist)
   */
  deactivate: (id) => axiosClient.delete(`/suppliers/${id}`),
};

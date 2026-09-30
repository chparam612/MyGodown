import { axiosClient } from './axiosClient.js';

export const usersApi = {
  /**
   * UC-05: List users with pagination and filters (Admin only)
   */
  list: (params) => axiosClient.get('/users', { params }),

  /**
   * UC-05: Get single user by ID (Admin only)
   */
  getById: (id) => axiosClient.get(`/users/${id}`),

  /**
   * UC-04: Create a new user (Admin only)
   */
  create: (data) => axiosClient.post('/users', data),

  /**
   * UC-06: Update user name, role, or active status (Admin only)
   */
  update: (id, data) => axiosClient.put(`/users/${id}`, data),

  /**
   * UC-06: Soft-deactivate user (Admin only)
   */
  deactivate: (id) => axiosClient.delete(`/users/${id}`),

  /**
   * UC-P02: Reset another user's password (Admin only)
   */
  resetPassword: (id, payload) => axiosClient.post(`/users/${id}/reset-password`, payload),
};

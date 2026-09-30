import { axiosClient } from './axiosClient.js';

export const salesOrdersApi = {
  /**
   * UC-29: List sales orders with status filter and pagination
   */
  list: (params) => axiosClient.get('/sales-orders', { params }),

  /**
   * UC-29: Get single sales order with line items, prices and subtotals
   */
  getById: (id) => axiosClient.get(`/sales-orders/${id}`),

  /**
   * UC-28: Create draft sales order
   */
  create: (data) => axiosClient.post('/sales-orders', data),

  /**
   * UC-30: Confirm draft sales order (allocates order, leaves stock untouched)
   */
  confirm: (id) => axiosClient.post(`/sales-orders/${id}/confirm`),

  /**
   * UC-30: Fulfill sales order (atomically decrements physical warehouse stock)
   */
  fulfill: (id) => axiosClient.post(`/sales-orders/${id}/fulfill`),

  /**
   * UC-30: Cancel sales order (Admin, Manager only - Staff returns 403)
   */
  cancel: (id) => axiosClient.post(`/sales-orders/${id}/cancel`),
};

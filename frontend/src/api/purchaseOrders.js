import { axiosClient } from './axiosClient.js';

export const purchaseOrdersApi = {
  /**
   * UC-26: List purchase orders with status filter and pagination (Admin, Manager)
   */
  list: (params) => axiosClient.get('/purchase-orders', { params }),

  /**
   * UC-26: Get single purchase order with line items and subtotals
   */
  getById: (id) => axiosClient.get(`/purchase-orders/${id}`),

  /**
   * UC-25: Create draft or ordered purchase order
   */
  create: (data) => axiosClient.post('/purchase-orders', data),

  /**
   * UC-P08: Edit draft purchase order (supplier, warehouse, line items)
   */
  updateDraft: (id, data) => axiosClient.put(`/purchase-orders/${id}`, data),

  /**
   * UC-27: Transition status draft -> ordered
   */
  markOrdered: (id) => axiosClient.patch(`/purchase-orders/${id}/status`, { status: 'ordered' }),

  /**
   * UC-27: Receive purchase order goods into warehouse stock
   */
  receive: (id) => axiosClient.post(`/purchase-orders/${id}/receive`),

  /**
   * UC-27: Cancel purchase order (only if not already received)
   */
  cancel: (id) => axiosClient.post(`/purchase-orders/${id}/cancel`),
};

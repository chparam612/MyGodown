import { axiosClient } from './axiosClient.js';

export const inventoryApi = {
  /**
   * UC-14: List current inventory stock levels across warehouses
   */
  listStock: (params) => axiosClient.get('/inventory', { params }),

  /**
   * UC-15: Check stock availability for a product across all warehouses
   */
  checkAvailability: (params) => axiosClient.get('/inventory/availability', { params }),

  /**
   * UC-16: Record direct stock movement (in/out)
   */
  recordMovement: (data) => axiosClient.post('/inventory/movements', data),

  /**
   * UC-17: Adjust stock to an audited physical cycle count (Admin, Manager)
   */
  adjustStock: (data) => axiosClient.post('/inventory/adjust', data),

  /**
   * UC-18: Inter-warehouse stock transfer (Admin, Manager)
   */
  transferStock: (data) => axiosClient.post('/inventory/transfer', data),

  /**
   * UC-19: View historical stock movement audit ledger
   */
  listMovements: (params) => axiosClient.get('/inventory/movements', { params }),

  /**
   * UC-20: Monitor low-stock items at or below reorder level
   */
  listLowStock: (params) => axiosClient.get('/inventory/low-stock', { params }),
};

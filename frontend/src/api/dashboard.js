import { axiosClient } from './axiosClient.js';

export const dashboardApi = {
  /**
   * UC-32: Get aggregate dashboard summary
   * Note: stockValue is omitted from response for staff role (BR-05)
   */
  getSummary: () => axiosClient.get('/dashboard/summary'),
};

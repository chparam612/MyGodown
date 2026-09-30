import { axiosClient } from './axiosClient.js';

export const authApi = {
  /**
   * UC-01: Authenticate user with email and password
   * @param {{ email: string, password: string }} credentials
   * @returns {Promise<{ success: boolean, data: { token: string, user: any } }>}
   */
  login: (credentials) => axiosClient.post('/auth/login', credentials),

  /**
   * UC-02: Get current authenticated user profile
   * @returns {Promise<{ success: boolean, data: any }>}
   */
  getMe: () => axiosClient.get('/auth/me'),

  /**
   * UC-03: Change own password
   * @param {{ currentPassword: string, newPassword: string }} payload
   * @returns {Promise<{ success: boolean, data: { message: string } }>}
   */
  changePassword: (payload) => axiosClient.post('/auth/change-password', payload),
};

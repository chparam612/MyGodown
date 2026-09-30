import axios from 'axios';
import { STORAGE_KEYS } from '../utils/constants.js';

// Base URL defaults to '/api' which Vite proxies to backend server (http://localhost:5000)
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

export const axiosClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Request interceptor: Attach JWT Bearer token from localStorage
axiosClient.interceptors.request.use(
  (config) => {
    try {
      // LocalStorage access wrapped in try/catch for sandbox/private-mode resilience
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      console.error('[axiosClient] Unable to retrieve auth token from localStorage', err);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Unwrap standard backend envelope and handle 401 session expiry
axiosClient.interceptors.response.use(
  (response) => {
    // Backend standard envelope: { success: true, data: ..., meta?: ... }
    return response.data;
  },
  (error) => {
    // Handle 401 Unauthorized (expired token, invalid token, or deactivated user)
    if (error.response?.status === 401) {
      try {
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
      } catch (err) {
        console.error('[axiosClient] Unable to clear auth token from localStorage', err);
      }

      // Avoid redirect loops if the 401 originated from the login endpoint itself
      const requestUrl = error.config?.url || '';
      if (!requestUrl.includes('/auth/login') && window.location.pathname !== '/login') {
        // Dispatch custom event for React AuthContext to update state smoothly
        window.dispatchEvent(new CustomEvent('rims:session-expired'));
        window.location.href = '/login?expired=1';
      }
    }

    return Promise.reject(error);
  }
);

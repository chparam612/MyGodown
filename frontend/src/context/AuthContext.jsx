import React, { useState, useEffect, useCallback } from 'react';
import { authApi } from '../api/auth.js';
import { STORAGE_KEYS } from '../utils/constants.js';
import { AuthContext } from './authContextDef.js';

export function AuthProvider({ children }) {
  // Stored in localStorage for session restoration across browser refreshes
  // Note: Acceptable for this project demonstration; HttpOnly cookies are standard for production
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.TOKEN);
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Logout method
  const logout = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
    } catch (err) {
      console.error('[AuthContext] Failed to remove token from localStorage', err);
    }
    setToken(null);
    setUser(null);
  }, []);

  // Restore authenticated session on mount via GET /api/auth/me
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      if (!token) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const response = await authApi.getMe();
        if (isMounted && response?.data) {
          setUser(response.data);
        }
      } catch (err) {
        console.warn('[AuthContext] Session verification failed on startup', err);
        // Invalid or expired token: clear state
        if (isMounted) {
          logout();
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    restoreSession();

    // Listen for 401 session expiry events dispatched by axiosClient
    const handleSessionExpired = () => {
      logout();
    };

    window.addEventListener('rims:session-expired', handleSessionExpired);
    return () => {
      isMounted = false;
      window.removeEventListener('rims:session-expired', handleSessionExpired);
    };
  }, [token, logout]);

  // Login method (UC-01)
  const login = async (email, password) => {
    const res = await authApi.login({ email, password });
    const { token: receivedToken, user: receivedUser } = res.data;

    try {
      localStorage.setItem(STORAGE_KEYS.TOKEN, receivedToken);
    } catch (err) {
      console.error('[AuthContext] Failed to save token to localStorage', err);
    }

    setToken(receivedToken);
    setUser(receivedUser);
    return res.data;
  };

  // Helper to test user role
  const hasRole = useCallback(
    (roleOrRoles) => {
      if (!user?.role) return false;
      if (Array.isArray(roleOrRoles)) {
        return roleOrRoles.includes(user.role);
      }
      return user.role === roleOrRoles;
    },
    [user]
  );

  const value = {
    user,
    token,
    loading,
    isAuthenticated: Boolean(token && user),
    login,
    logout,
    hasRole,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

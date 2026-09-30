import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useAuth } from '../context/useAuth.js';

export function ProtectedRoute({ allowedRoles }) {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <CircularProgress size={44} thickness={4} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Authenticating session...
        </Typography>
      </Box>
    );
  }

  if (!isAuthenticated) {
    // Redirect unauthenticated visitors to login, preserving intended path in location state
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Role gating check
  if (Array.isArray(allowedRoles) && user?.role) {
    if (!allowedRoles.includes(user.role)) {
      return <Navigate to="/access-denied" replace />;
    }
  }

  return <Outlet />;
}

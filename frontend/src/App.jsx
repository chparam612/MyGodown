import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

import { theme } from './theme.js';
import { AuthProvider } from './context/AuthContext.jsx';
import { ProtectedRoute } from './routes/ProtectedRoute.jsx';
import { MainLayout } from './layouts/MainLayout.jsx';
import { USER_ROLES } from './utils/constants.js';

// Route-level code splitting via React.lazy()
const Login = lazy(() => import('./pages/Login.jsx').then((m) => ({ default: m.Login })));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx').then((m) => ({ default: m.Dashboard })));
const Products = lazy(() => import('./pages/Products.jsx').then((m) => ({ default: m.Products })));
const Warehouses = lazy(() => import('./pages/Warehouses.jsx').then((m) => ({ default: m.Warehouses })));
const Inventory = lazy(() => import('./pages/Inventory.jsx').then((m) => ({ default: m.Inventory })));
const Suppliers = lazy(() => import('./pages/Suppliers.jsx').then((m) => ({ default: m.Suppliers })));
const PurchaseOrders = lazy(() => import('./pages/PurchaseOrders.jsx').then((m) => ({ default: m.PurchaseOrders })));
const SalesOrders = lazy(() => import('./pages/SalesOrders.jsx').then((m) => ({ default: m.SalesOrders })));
const Users = lazy(() => import('./pages/Users.jsx').then((m) => ({ default: m.Users })));
const NotFound = lazy(() => import('./pages/NotFound.jsx').then((m) => ({ default: m.NotFound })));
const AccessDenied = lazy(() => import('./pages/AccessDenied.jsx').then((m) => ({ default: m.AccessDenied })));

function PageLoader() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
      }}
    >
      <CircularProgress size={38} thickness={4} />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        Loading view...
      </Typography>
    </Box>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public Login Route (UC-01) */}
              <Route path="/login" element={<Login />} />

              {/* Authenticated Application Layout */}
              <Route element={<ProtectedRoute />}>
                <Route element={<MainLayout />}>
                  {/* Core operational routes */}
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/inventory" element={<Inventory />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/warehouses" element={<Warehouses />} />
                  <Route path="/suppliers" element={<Suppliers />} />

                  {/* Purchase Orders: Admin and Manager only (Staff blocked with 403) */}
                  <Route
                    path="/purchase-orders"
                    element={
                      <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN, USER_ROLES.MANAGER]} />
                    }
                  >
                    <Route index element={<PurchaseOrders />} />
                  </Route>

                  <Route path="/sales-orders" element={<SalesOrders />} />

                  {/* Users: Admin only */}
                  <Route
                    path="/users"
                    element={<ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]} />}
                  >
                    <Route index element={<Users />} />
                  </Route>

                  <Route path="/access-denied" element={<AccessDenied />} />
                </Route>
              </Route>

              {/* 404 Catch-all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

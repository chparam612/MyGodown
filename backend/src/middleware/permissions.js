/**
 * ============================================================================
 * File: backend/src/middleware/permissions.js
 * Purpose: Central Role-Based Access Control (RBAC) permission map for RIMS.
 * Why it exists: Provides a single, clean definition of the permission matrix
 * and role hierarchy (admin > manager > staff).
 * ============================================================================
 */

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  MANAGER: 'manager',
  STAFF: 'staff',
});

// Role hierarchy rank (higher numerical value inherits permissions of lower)
export const ROLE_HIERARCHY = Object.freeze({
  [ROLES.ADMIN]: 3,
  [ROLES.MANAGER]: 2,
  [ROLES.STAFF]: 1,
});

/**
 * Checks whether a given user role possesses at least the required role rank.
 * @param {string} userRole - User's current role
 * @param {string} requiredRole - Minimum role required
 * @returns {boolean}
 */
export function hasMinimumRole(userRole, requiredRole) {
  const userRank = ROLE_HIERARCHY[userRole] || 0;
  const requiredRank = ROLE_HIERARCHY[requiredRole] || 999;
  return userRank >= requiredRank;
}

/**
 * Central Permission Matrix Mapping.
 * Maps operational resources and actions to permitted roles.
 */
export const PERMISSION_MATRIX = Object.freeze({
  // Users: Admin only (own profile accessible to all authenticated)
  USERS_CREATE: [ROLES.ADMIN],
  USERS_READ: [ROLES.ADMIN],
  USERS_UPDATE: [ROLES.ADMIN],
  USERS_DEACTIVATE: [ROLES.ADMIN],

  // Products: Read all; Write admin & manager
  PRODUCTS_READ: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
  PRODUCTS_WRITE: [ROLES.ADMIN, ROLES.MANAGER],

  // Warehouses: Read all; Write admin only
  WAREHOUSES_READ: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
  WAREHOUSES_WRITE: [ROLES.ADMIN],

  // Inventory & Stock:
  INVENTORY_VIEW: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
  INVENTORY_CHECK: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
  INVENTORY_LOW_STOCK: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
  INVENTORY_MOVEMENT_HISTORY: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
  INVENTORY_RECORD_MOVEMENT: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
  INVENTORY_ADJUST: [ROLES.ADMIN, ROLES.MANAGER],
  INVENTORY_TRANSFER: [ROLES.ADMIN, ROLES.MANAGER],

  // Suppliers: Read all; Write admin & manager
  SUPPLIERS_READ: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
  SUPPLIERS_WRITE: [ROLES.ADMIN, ROLES.MANAGER],

  // Purchase Orders: Admin & manager only
  PURCHASE_ORDERS_READ: [ROLES.ADMIN, ROLES.MANAGER],
  PURCHASE_ORDERS_WRITE: [ROLES.ADMIN, ROLES.MANAGER],
  PURCHASE_ORDERS_RECEIVE: [ROLES.ADMIN, ROLES.MANAGER],

  // Sales Orders: Create & Read all; Confirm/Fulfil all; Cancel admin & manager
  SALES_ORDERS_READ: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
  SALES_ORDERS_CREATE: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
  SALES_ORDERS_UPDATE_STATUS: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
  SALES_ORDERS_CANCEL: [ROLES.ADMIN, ROLES.MANAGER],

  // Dashboard: Read for all roles
  DASHBOARD_VIEW: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
});

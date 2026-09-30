import { USER_ROLES } from './constants.js';

/**
 * Frontend Permission Matrix
 * Mirrors backend authorization guards defined across Modules 1 through 8.
 * Note: Frontend gating is a user convenience; backend remains the authoritative enforcement point.
 */
const PERMISSIONS = {
  // Users (UC-04, UC-05, UC-06, UC-P02)
  'users:view': [USER_ROLES.ADMIN],
  'users:create': [USER_ROLES.ADMIN],
  'users:edit': [USER_ROLES.ADMIN],
  'users:deactivate': [USER_ROLES.ADMIN],
  'users:reset_password': [USER_ROLES.ADMIN],

  // Products (UC-07 to UC-10)
  'products:view': [USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.STAFF],
  'products:view_cost': [USER_ROLES.ADMIN, USER_ROLES.MANAGER], // BR-05: staff never sees costPrice
  'products:create': [USER_ROLES.ADMIN, USER_ROLES.MANAGER],
  'products:edit': [USER_ROLES.ADMIN, USER_ROLES.MANAGER],
  'products:deactivate': [USER_ROLES.ADMIN, USER_ROLES.MANAGER],

  // Warehouses (UC-11 to UC-13)
  'warehouses:view': [USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.STAFF],
  'warehouses:create': [USER_ROLES.ADMIN],
  'warehouses:edit': [USER_ROLES.ADMIN],
  'warehouses:deactivate': [USER_ROLES.ADMIN],

  // Inventory (UC-14 to UC-20)
  'inventory:view': [USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.STAFF],
  'inventory:view_cost': [USER_ROLES.ADMIN, USER_ROLES.MANAGER], // BR-05: staff never sees costPrice
  'inventory:availability': [USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.STAFF],
  'inventory:record_movement': [USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.STAFF], // UC-16
  'inventory:adjust': [USER_ROLES.ADMIN, USER_ROLES.MANAGER], // UC-17
  'inventory:transfer': [USER_ROLES.ADMIN, USER_ROLES.MANAGER], // UC-18
  'inventory:movements': [USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.STAFF], // UC-19
  'inventory:low_stock': [USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.STAFF], // UC-20

  // Suppliers (UC-21 to UC-24)
  'suppliers:view': [USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.STAFF],
  'suppliers:create': [USER_ROLES.ADMIN, USER_ROLES.MANAGER],
  'suppliers:edit': [USER_ROLES.ADMIN, USER_ROLES.MANAGER],
  'suppliers:deactivate': [USER_ROLES.ADMIN, USER_ROLES.MANAGER],

  // Purchase Orders (UC-25 to UC-27, UC-P08)
  'purchase_orders:view': [USER_ROLES.ADMIN, USER_ROLES.MANAGER], // Hidden from staff
  'purchase_orders:create': [USER_ROLES.ADMIN, USER_ROLES.MANAGER],
  'purchase_orders:edit': [USER_ROLES.ADMIN, USER_ROLES.MANAGER],
  'purchase_orders:order': [USER_ROLES.ADMIN, USER_ROLES.MANAGER],
  'purchase_orders:receive': [USER_ROLES.ADMIN, USER_ROLES.MANAGER],
  'purchase_orders:cancel': [USER_ROLES.ADMIN, USER_ROLES.MANAGER],

  // Sales Orders (UC-28 to UC-30)
  'sales_orders:view': [USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.STAFF],
  'sales_orders:create': [USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.STAFF],
  'sales_orders:confirm': [USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.STAFF],
  'sales_orders:fulfill': [USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.STAFF],
  'sales_orders:cancel': [USER_ROLES.ADMIN, USER_ROLES.MANAGER], // Staff denied cancellation (403)

  // Dashboard (UC-32)
  'dashboard:view': [USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.STAFF],
  'dashboard:view_valuation': [USER_ROLES.ADMIN, USER_ROLES.MANAGER], // BR-05: stockValue omitted for staff
};

/**
 * Checks whether a given role is authorized to perform an action.
 * @param {string|null|undefined} role
 * @param {string} action
 * @returns {boolean}
 */
export function can(role, action) {
  if (!role) return false;
  const allowedRoles = PERMISSIONS[action];
  if (!allowedRoles) {
    console.warn(`[Permissions] Undefined permission action: ${action}`);
    return false;
  }
  return allowedRoles.includes(role);
}

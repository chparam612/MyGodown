/**
 * Application Constants & Real Domain Enums
 * Source of truth: docs/api-contract.md
 */

export const STORAGE_KEYS = {
  // Stored in localStorage for session persistence across refreshes.
  // Note: Acceptable for this project/architecture; HttpOnly cookies would be preferred for high-security production.
  TOKEN: 'rims_auth_token',
};

export const USER_ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  STAFF: 'staff',
};

// Database Schema ENUM('in', 'out', 'adjustment')
export const MOVEMENT_TYPES = {
  IN: 'in',
  OUT: 'out',
  ADJUSTMENT: 'adjustment',
};

// stock_movements.reference_type VARCHAR(50) written by services
export const REFERENCE_TYPES = {
  MANUAL: 'manual',
  ADJUSTMENT: 'adjustment',
  TRANSFER: 'transfer',
  PURCHASE_ORDER: 'purchase_order',
  SALES_ORDER: 'sales_order',
};

// purchase_orders.status ENUM
export const PO_STATUSES = {
  DRAFT: 'draft',
  ORDERED: 'ordered',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
};

// sales_orders.status ENUM
export const SO_STATUSES = {
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  FULFILLED: 'fulfilled',
  CANCELLED: 'cancelled',
};

export const CURRENCY_SYMBOL = '$';
export const DEFAULT_PAGE_SIZE = 20;

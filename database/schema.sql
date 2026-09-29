-- ============================================================================
-- File: database/schema.sql
-- Purpose: Phase 1 DDL Schema for Retail Inventory Management System (RIMS).
-- Why it exists: Defines the foundational 6 relational tables for inventory_db
-- enforcing strict relational integrity, check constraints, indexes, and soft deletes.
--
-- HARD RULES SATISFIED:
-- 1. Zero DROP / TRUNCATE statements (safe, non-destructive execution).
-- 2. Every table uses CREATE TABLE IF NOT EXISTS, ENGINE=InnoDB, utf8mb4, utf8mb4_unicode_ci.
-- 3. Idempotent DDL execution.
-- 4. Monetary columns use DECIMAL(10,2) exclusively (never FLOAT or DOUBLE).
-- 5. Foreign keys use ON DELETE RESTRICT on master data to prevent orphan references.
--
-- NOTE ON CHECK CONSTRAINTS:
-- Named CHECK constraints require MySQL 8.0.16+ to be actively parsed and enforced.
-- The application layer must also validate these conditions before sending queries.
-- ============================================================================

-- Ensure target database exists and select it
CREATE DATABASE IF NOT EXISTS inventory_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE inventory_db;

-- ----------------------------------------------------------------------------
-- 1. Table: users
-- Purpose: System actor accounts with role-based access control.
-- Why: Stores credentials (bcrypt hash) and role for authentication & authorization.
-- Roles: admin > manager > staff (hierarchical permissions).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'manager', 'staff') NOT NULL DEFAULT 'staff',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_email (email),
  INDEX idx_users_role (role),
  INDEX idx_users_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. Table: warehouses
-- Purpose: Physical storage locations where inventory is held.
-- Why: Supports multi-site inventory segregation, tracking, and stock transfers.
-- code: Natural unique identifier (e.g., 'WH-CENTRAL') used in logistics.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warehouses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  address VARCHAR(255) DEFAULT NULL,
  city VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_warehouses_code (code),
  INDEX idx_warehouses_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. Table: suppliers
-- Purpose: External vendor records supplying products to the business.
-- Why: Master records required for tracking product procurement and purchase orders.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  contact_name VARCHAR(100) DEFAULT NULL,
  email VARCHAR(150) DEFAULT NULL,
  phone VARCHAR(50) DEFAULT NULL,
  address TEXT DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_suppliers_name (name),
  INDEX idx_suppliers_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. Table: products
-- Purpose: Sellable catalogue items tracked by unique SKU.
-- Why: Core master entity linking suppliers, prices, reorder thresholds, and stock.
-- Design Decisions:
--   - unit_price & cost_price: DECIMAL(10,2) to prevent binary floating-point rounding errors.
--   - supplier_id: ON DELETE RESTRICT ensures a supplier cannot be deleted while products reference it.
--   - is_active: Soft deletion preserves relational integrity in orders and historical reports.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT DEFAULT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'General',
  unit_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  cost_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  reorder_level INT NOT NULL DEFAULT 0,
  supplier_id INT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_products_unit_price CHECK (unit_price >= 0),
  CONSTRAINT chk_products_cost_price CHECK (cost_price >= 0),
  CONSTRAINT chk_products_reorder_level CHECK (reorder_level >= 0),
  INDEX idx_products_sku (sku),
  INDEX idx_products_name (name),
  INDEX idx_products_category (category),
  INDEX idx_products_is_active (is_active),
  INDEX idx_products_supplier (supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. Table: stock_levels
-- Purpose: Current on-hand quantity of each product in each warehouse.
-- Why: Real-time inventory balance lookup for sales availability and replenishment.
-- Design Decisions:
--   - UNIQUE (product_id, warehouse_id): Ensures exactly one authoritative record per product per warehouse.
--   - ON DELETE RESTRICT on product_id & warehouse_id: Strictly blocks cascading deletion of master data.
--   - CHECK (quantity >= 0): Prevents inventory from ever going negative at the database level.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_levels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  warehouse_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_levels_product FOREIGN KEY (product_id) REFERENCES products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_stock_levels_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT uq_stock_levels_product_warehouse UNIQUE (product_id, warehouse_id),
  CONSTRAINT chk_stock_levels_quantity CHECK (quantity >= 0),
  INDEX idx_stock_levels_product (product_id),
  INDEX idx_stock_levels_warehouse (warehouse_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. Table: stock_movements
-- Purpose: Immutable ledger recording every quantity change across the system.
-- Why: Full audit trail for inbound receipts, outbound sales, and stock adjustments.
-- Design Decisions:
--   - movement_type: ENUM('in', 'out', 'adjustment') classifies the operational nature of the change.
--   - quantity: Integer change amount (positive magnitude; direction indicated by type or signed value).
--   - user_id: Foreign key tracking the specific employee who executed or authorized the movement.
--   - No updated_at: Ledger rows are append-only and must never be modified or deleted.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  warehouse_id INT NOT NULL,
  user_id INT NOT NULL,
  movement_type ENUM('in', 'out', 'adjustment') NOT NULL,
  quantity INT NOT NULL,
  reference VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_movements_product FOREIGN KEY (product_id) REFERENCES products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_stock_movements_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_stock_movements_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_stock_movements_product (product_id),
  INDEX idx_stock_movements_warehouse (warehouse_id),
  INDEX idx_stock_movements_user (user_id),
  INDEX idx_stock_movements_type (movement_type),
  INDEX idx_stock_movements_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

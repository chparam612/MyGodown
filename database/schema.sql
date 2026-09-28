-- ============================================================================
-- File: database/schema.sql
-- Purpose: DDL schema definition for Retail Inventory Management System (RIMS).
-- Why it exists: Creates the 10 core tables in inventory_db with strict relational
-- integrity, non-negative checks, foreign key constraints, and soft-delete flags.
-- ============================================================================

-- Ensure the designated database exists and is selected
CREATE DATABASE IF NOT EXISTS inventory_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE inventory_db;

-- ----------------------------------------------------------------------------
-- 1. Table: users
-- Purpose: System accounts with role-based access control (admin, manager, staff).
-- Why: Authenticates actors and enforces hierarchical permission matrix (BR-02, BR-14, BR-15).
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
  INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. Table: products
-- Purpose: Sellable catalogue items tracked by unique SKU.
-- Why: Stores cost, selling price, and reorder levels for inventory monitoring (BR-04, BR-05, BR-16).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT DEFAULT NULL,
  category VARCHAR(100) DEFAULT 'General',
  cost_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  selling_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  reorder_level INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_products_cost CHECK (cost_price >= 0),
  CONSTRAINT chk_products_selling CHECK (selling_price >= 0),
  CONSTRAINT chk_products_reorder CHECK (reorder_level >= 0),
  INDEX idx_products_sku (sku),
  INDEX idx_products_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. Table: warehouses
-- Purpose: Physical stock storage locations.
-- Why: Enables multi-warehouse inventory tracking and transfer between sites (BR-08, BR-09).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warehouses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  location VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_warehouses_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. Table: stock_levels
-- Purpose: Current on-hand quantity per product per warehouse.
-- Why: Real-time stock availability, prevented from dropping below zero (BR-03, BR-16).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_levels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  warehouse_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_levels_product FOREIGN KEY (product_id) REFERENCES products(id) ON UPDATE CASCADE,
  CONSTRAINT fk_stock_levels_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON UPDATE CASCADE,
  CONSTRAINT uq_product_warehouse UNIQUE (product_id, warehouse_id),
  CONSTRAINT chk_stock_quantity CHECK (quantity >= 0),
  INDEX idx_stock_levels_lookup (product_id, warehouse_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. Table: stock_movements
-- Purpose: Immutable ledger recording every quantity change.
-- Why: Audit trail for receipts, sales, adjustments, transfers, and cancellations (BR-06).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  warehouse_id INT NOT NULL,
  type ENUM('RECEIPT', 'SALE', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'SALE_CANCEL') NOT NULL,
  quantity_change INT NOT NULL,
  reference_id INT DEFAULT NULL,
  reference_type VARCHAR(50) DEFAULT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_movements_product FOREIGN KEY (product_id) REFERENCES products(id) ON UPDATE CASCADE,
  CONSTRAINT fk_stock_movements_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON UPDATE CASCADE,
  CONSTRAINT fk_stock_movements_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE,
  INDEX idx_stock_movements_product (product_id),
  INDEX idx_stock_movements_warehouse (warehouse_id),
  INDEX idx_stock_movements_type (type),
  INDEX idx_stock_movements_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. Table: suppliers
-- Purpose: External vendor records supplying inventory.
-- Why: Required for purchase orders and vendor tracking with soft delete (BR-07).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  contact_person VARCHAR(100) DEFAULT NULL,
  email VARCHAR(150) DEFAULT NULL,
  phone VARCHAR(50) DEFAULT NULL,
  address TEXT DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_suppliers_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 7. Table: purchase_orders
-- Purpose: Inbound replenishment orders sent to suppliers.
-- Why: Tracks procurement status (Ordered -> Received) into a warehouse (BR-10).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  po_number VARCHAR(50) NOT NULL UNIQUE,
  supplier_id INT NOT NULL,
  warehouse_id INT NOT NULL,
  status ENUM('Ordered', 'Received') NOT NULL DEFAULT 'Ordered',
  total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  created_by INT NOT NULL,
  received_by INT DEFAULT NULL,
  received_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON UPDATE CASCADE,
  CONSTRAINT fk_po_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON UPDATE CASCADE,
  CONSTRAINT fk_po_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE,
  CONSTRAINT fk_po_received_by FOREIGN KEY (received_by) REFERENCES users(id) ON UPDATE CASCADE,
  CONSTRAINT chk_po_total CHECK (total_amount >= 0),
  INDEX idx_po_status (status),
  INDEX idx_po_supplier (supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 8. Table: po_items
-- Purpose: Line items for purchase orders.
-- Why: Details products, quantities, and cost prices locked at purchase time (BR-05, BR-17).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS po_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  po_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_cost DECIMAL(10, 2) NOT NULL,
  subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_po_items_po FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_po_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON UPDATE CASCADE,
  CONSTRAINT chk_po_items_quantity CHECK (quantity > 0),
  CONSTRAINT chk_po_items_cost CHECK (unit_cost >= 0),
  INDEX idx_po_items_po (po_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 9. Table: sales_orders
-- Purpose: Customer orders fulfilled from warehouse stock.
-- Why: Manages fulfillment flow New -> Packed -> Shipped (or Cancelled) (BR-11, BR-12, BR-13).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  so_number VARCHAR(50) NOT NULL UNIQUE,
  customer_name VARCHAR(150) NOT NULL,
  warehouse_id INT NOT NULL,
  status ENUM('New', 'Packed', 'Shipped', 'Cancelled') NOT NULL DEFAULT 'New',
  total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  created_by INT NOT NULL,
  shipped_at TIMESTAMP NULL DEFAULT NULL,
  cancelled_at TIMESTAMP NULL DEFAULT NULL,
  cancellation_reason VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_so_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON UPDATE CASCADE,
  CONSTRAINT fk_so_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE,
  CONSTRAINT chk_so_total CHECK (total_amount >= 0),
  INDEX idx_so_status (status),
  INDEX idx_so_warehouse (warehouse_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 10. Table: order_items
-- Purpose: Line items for sales orders.
-- Why: Stores quantity and unit price locked at the time of sale (BR-05, BR-11, BR-17).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON UPDATE CASCADE,
  CONSTRAINT chk_order_items_quantity CHECK (quantity > 0),
  CONSTRAINT chk_order_items_price CHECK (unit_price >= 0),
  INDEX idx_order_items_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Migration: database/migrations/002_orders.sql
-- Purpose: Additive schema migration for Purchase and Sales Orders.
-- Why it exists: Introduces purchase_orders, purchase_order_items, sales_orders,
-- and sales_order_items, and extends stock_movements with reference metadata.
--
-- HARD RULES SATISFIED:
-- 1. Zero DROP statements (purely additive DDL).
-- 2. CREATE TABLE IF NOT EXISTS, ENGINE=InnoDB, utf8mb4, utf8mb4_unicode_ci.
-- 3. Money columns use DECIMAL(10,2) exclusively.
-- 4. Named foreign keys with ON DELETE RESTRICT on master data.
-- 5. Named CHECK constraints on non-negative totals and positive line quantities.
-- 6. Fully idempotent execution.
-- ============================================================================

USE inventory_db;

-- ----------------------------------------------------------------------------
-- 1. Extend stock_movements with reference_type and reference_id (if missing)
-- Uses information_schema inspection to ensure 100% idempotent execution.
-- ----------------------------------------------------------------------------
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists
FROM information_schema.columns
WHERE table_schema = 'inventory_db'
  AND table_name = 'stock_movements'
  AND column_name = 'reference_type';

SET @stmt = IF(@col_exists = 0,
  'ALTER TABLE stock_movements ADD COLUMN reference_type VARCHAR(50) DEFAULT NULL AFTER movement_type;',
  'SELECT "Column reference_type already exists on stock_movements";'
);
PREPARE alter_stmt FROM @stmt;
EXECUTE alter_stmt;
DEALLOCATE PREPARE alter_stmt;

SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists
FROM information_schema.columns
WHERE table_schema = 'inventory_db'
  AND table_name = 'stock_movements'
  AND column_name = 'reference_id';

SET @stmt = IF(@col_exists = 0,
  'ALTER TABLE stock_movements ADD COLUMN reference_id INT DEFAULT NULL AFTER reference_type;',
  'SELECT "Column reference_id already exists on stock_movements";'
);
PREPARE alter_stmt FROM @stmt;
EXECUTE alter_stmt;
DEALLOCATE PREPARE alter_stmt;

-- ----------------------------------------------------------------------------
-- 2. Table: purchase_orders
-- Purpose: Tracks inbound procurement orders placed with suppliers.
-- Lifecycle: draft -> ordered -> received (or cancelled).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  po_number VARCHAR(50) NOT NULL UNIQUE,
  supplier_id INT NOT NULL,
  warehouse_id INT NOT NULL,
  status ENUM('draft', 'ordered', 'received', 'cancelled') NOT NULL DEFAULT 'draft',
  ordered_at TIMESTAMP NULL DEFAULT NULL,
  received_at TIMESTAMP NULL DEFAULT NULL,
  received_by INT DEFAULT NULL,
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  notes TEXT DEFAULT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_po_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_po_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_po_received_by FOREIGN KEY (received_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_po_total_amount CHECK (total_amount >= 0),
  INDEX idx_po_status (status),
  INDEX idx_po_supplier (supplier_id),
  INDEX idx_po_warehouse (warehouse_id),
  INDEX idx_po_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. Table: purchase_order_items
-- Purpose: Line items for purchase orders with unit purchase costs.
-- Constraint: Unique product per purchase order; positive quantity.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  purchase_order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_cost DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_po_items_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_po_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT uq_po_items_po_product UNIQUE (purchase_order_id, product_id),
  CONSTRAINT chk_po_items_quantity CHECK (quantity > 0),
  CONSTRAINT chk_po_items_unit_cost CHECK (unit_cost >= 0),
  INDEX idx_po_items_po (purchase_order_id),
  INDEX idx_po_items_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. Table: sales_orders
-- Purpose: Outbound customer orders fulfilled from warehouse inventory.
-- Lifecycle: draft -> confirmed -> fulfilled (or cancelled).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  so_number VARCHAR(50) NOT NULL UNIQUE,
  customer_name VARCHAR(150) NOT NULL,
  warehouse_id INT NOT NULL,
  status ENUM('draft', 'confirmed', 'fulfilled', 'cancelled') NOT NULL DEFAULT 'draft',
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  notes TEXT DEFAULT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_so_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_so_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_so_total_amount CHECK (total_amount >= 0),
  INDEX idx_so_status (status),
  INDEX idx_so_warehouse (warehouse_id),
  INDEX idx_so_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. Table: sales_order_items
-- Purpose: Line items for sales orders capturing unit selling price at sale.
-- Constraint: Unique product per sales order; positive quantity.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sales_order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_so_items_so FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_so_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT uq_so_items_so_product UNIQUE (sales_order_id, product_id),
  CONSTRAINT chk_so_items_quantity CHECK (quantity > 0),
  CONSTRAINT chk_so_items_unit_price CHECK (unit_price >= 0),
  INDEX idx_so_items_so (sales_order_id),
  INDEX idx_so_items_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

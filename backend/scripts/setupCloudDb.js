/**
 * ============================================================================
 * File: backend/scripts/setupCloudDb.js
 * Purpose: 1-click cloud database setup and schema migration script for RIMS.
 * Why it exists: Eliminates manual SQL imports and PowerShell piping issues.
 * Works seamlessly on Aiven, Render, local MySQL, or any remote database.
 * ============================================================================
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend/.env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const isLocalhost =
  !process.env.DB_HOST ||
  process.env.DB_HOST === 'localhost' ||
  process.env.DB_HOST === '127.0.0.1' ||
  process.env.DB_HOST === 'mysql';

const useSsl =
  process.env.DB_SSL === 'true' ||
  (!isLocalhost && process.env.DB_SSL !== 'false');

const targetDb = process.env.DB_NAME || 'defaultdb';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: targetDb,
  multipleStatements: true,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
};

const BCRYPT_ROUNDS = 10;
const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'AdminPassword123!';
const managerPassword = process.env.SEED_MANAGER_PASSWORD || 'ManagerPassword123!';
const staffPassword = process.env.SEED_STAFF_PASSWORD || 'StaffPassword123!';

const TABLES_DDL = `
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
  INDEX idx_warehouses_city (city),
  INDEX idx_warehouses_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  contact_name VARCHAR(100) DEFAULT NULL,
  email VARCHAR(150) DEFAULT NULL,
  phone VARCHAR(50) DEFAULT NULL,
  address VARCHAR(255) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_suppliers_name (name),
  INDEX idx_suppliers_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT DEFAULT NULL,
  category VARCHAR(100) NOT NULL,
  unit_of_measure VARCHAR(30) NOT NULL DEFAULT 'units',
  cost_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  selling_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  reorder_level INT NOT NULL DEFAULT 0,
  supplier_id INT DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_products_cost_price CHECK (cost_price >= 0),
  CONSTRAINT chk_products_selling_price CHECK (selling_price >= 0),
  CONSTRAINT chk_products_reorder_level CHECK (reorder_level >= 0),
  INDEX idx_products_sku (sku),
  INDEX idx_products_category (category),
  INDEX idx_products_supplier (supplier_id),
  INDEX idx_products_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  warehouse_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_inventory_product_warehouse UNIQUE (product_id, warehouse_id),
  CONSTRAINT fk_inventory_product FOREIGN KEY (product_id) REFERENCES products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_inventory_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_inventory_quantity CHECK (quantity >= 0),
  INDEX idx_inventory_product (product_id),
  INDEX idx_inventory_warehouse (warehouse_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  warehouse_id INT NOT NULL,
  user_id INT NOT NULL,
  movement_type ENUM('in', 'out', 'adjustment') NOT NULL,
  reference_type VARCHAR(50) DEFAULT NULL,
  quantity INT NOT NULL,
  reference VARCHAR(255) DEFAULT NULL,
  reference_id INT DEFAULT NULL,
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

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  po_number VARCHAR(50) NOT NULL UNIQUE,
  supplier_id INT NOT NULL,
  warehouse_id INT NOT NULL,
  status ENUM('draft', 'ordered', 'received', 'cancelled') NOT NULL DEFAULT 'draft',
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  notes TEXT DEFAULT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_po_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_po_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_po_total_amount CHECK (total_amount >= 0),
  INDEX idx_po_status (status),
  INDEX idx_po_supplier (supplier_id),
  INDEX idx_po_warehouse (warehouse_id),
  INDEX idx_po_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  purchase_order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_po_items_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_po_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT uq_po_items_po_product UNIQUE (purchase_order_id, product_id),
  CONSTRAINT chk_po_items_quantity CHECK (quantity > 0),
  CONSTRAINT chk_po_items_unit_price CHECK (unit_price >= 0),
  INDEX idx_po_items_po (purchase_order_id),
  INDEX idx_po_items_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
`;

const SEED_DATA_SQL = `
INSERT INTO warehouses (name, code, address, city, is_active)
VALUES
  ('Central Logistics Hub', 'WH-CENTRAL', '100 Industrial Parkway', 'Chicago', 1),
  ('East Coast Distribution Center', 'WH-EAST', '450 Harbor Boulevard', 'Newark', 1),
  ('West Coast Fulfillment Center', 'WH-WEST', '780 Logistics Way', 'Reno', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), address = VALUES(address), city = VALUES(city);

INSERT INTO suppliers (name, contact_name, email, phone, address, is_active)
VALUES
  ('Apex Industrial Supply', 'Arthur Pendelton', 'orders@apextoolcorp.com', '+1-312-555-0140', '1200 Manufacturing Row, Detroit, MI', 1),
  ('VoltCore Electronics', 'Elena Rostova', 'sales@voltcore-systems.com', '+1-408-555-0192', '850 Semiconductor Drive, San Jose, CA', 1),
  ('Safeguard Safety Supplies', 'Marcus Vance', 'contracts@safeguard-ppe.com', '+1-713-555-0183', '3400 Energy Corridor Blvd, Houston, TX', 1),
  ('Pinnacle Chemical Corp', 'Dr. Diane Wu', 'orders@pinnacle-chem.com', '+1-614-555-0177', '500 Polymer Drive, Akron, OH', 1),
  ('Standard Packaging Co', 'Gregory Hayes', 'dispatch@standardpkg.com', '+1-901-555-0164', '210 Freight Line Avenue, Memphis, TN', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), contact_name = VALUES(contact_name);

INSERT INTO products (sku, name, description, category, unit_of_measure, cost_price, selling_price, reorder_level, supplier_id, is_active)
SELECT 'TOOL-DRILL-001', 'Heavy Duty Cordless Hammer Drill 20V', 'Brushless 2-speed cordless drill kit', 'Tools & Hardware', 'units', 85.00, 149.99, 15, id, 1
FROM suppliers WHERE email = 'orders@apextoolcorp.com' LIMIT 1
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO products (sku, name, description, category, unit_of_measure, cost_price, selling_price, reorder_level, supplier_id, is_active)
SELECT 'ELEC-MULT-001', 'Digital True RMS Industrial Multimeter', '6000-count auto-ranging multimeter', 'Electronics', 'units', 45.00, 89.99, 20, id, 1
FROM suppliers WHERE email = 'sales@voltcore-systems.com' LIMIT 1
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO products (sku, name, description, category, unit_of_measure, cost_price, selling_price, reorder_level, supplier_id, is_active)
SELECT 'SAFE-RESP-001', 'Half-Mask Multi-Gas Respirator Kit', 'NIOSH approved silicone half facepiece', 'Safety & PPE', 'units', 28.50, 54.99, 25, id, 1
FROM suppliers WHERE email = 'contracts@safeguard-ppe.com' LIMIT 1
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO products (sku, name, description, category, unit_of_measure, cost_price, selling_price, reorder_level, supplier_id, is_active)
SELECT 'CHEM-DEGR-001', 'Industrial Heavy-Duty Solvent Degreaser 5 Gal', 'High flash point precision degreaser pail', 'Industrial Chemicals', 'pails', 65.00, 119.99, 10, id, 1
FROM suppliers WHERE email = 'orders@pinnacle-chem.com' LIMIT 1
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO products (sku, name, description, category, unit_of_measure, cost_price, selling_price, reorder_level, supplier_id, is_active)
SELECT 'PACK-STRCH-001', 'Cast Stretch Film 80 Gauge 18in x 1500ft', 'High clarity pallet wrapping film case of 4 rolls', 'Packaging & Shipping', 'cases', 38.00, 68.50, 30, id, 1
FROM suppliers WHERE email = 'dispatch@standardpkg.com' LIMIT 1
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Initial inventory allocations
INSERT INTO inventory (product_id, warehouse_id, quantity)
SELECT p.id, w.id, 50
FROM products p, warehouses w
WHERE p.sku = 'TOOL-DRILL-001' AND w.code = 'WH-CENTRAL'
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity);

INSERT INTO inventory (product_id, warehouse_id, quantity)
SELECT p.id, w.id, 65
FROM products p, warehouses w
WHERE p.sku = 'ELEC-MULT-001' AND w.code = 'WH-CENTRAL'
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity);

INSERT INTO inventory (product_id, warehouse_id, quantity)
SELECT p.id, w.id, 80
FROM products p, warehouses w
WHERE p.sku = 'SAFE-RESP-001' AND w.code = 'WH-EAST'
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity);
`;

const USERS_TO_SEED = [
  {
    name: 'System Administrator',
    email: 'admin@mygodown.com',
    role: 'admin',
    password: adminPassword,
  },
  {
    name: 'Warehouse Manager',
    email: 'manager@mygodown.com',
    role: 'manager',
    password: managerPassword,
  },
  {
    name: 'Inventory Staff',
    email: 'staff@mygodown.com',
    role: 'staff',
    password: staffPassword,
  },
];

async function runSetup() {
  console.log('================================================================');
  console.log('🚀 RIMS Cloud Database Initializer & Migration Tool');
  console.log('================================================================');
  console.log(`Connecting to: ${dbConfig.host}:${dbConfig.port}`);
  console.log(`Target Database: ${dbConfig.database}`);
  console.log(`SSL Mode: ${useSsl ? 'ENABLED' : 'DISABLED'}`);
  console.log('----------------------------------------------------------------');

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connection established successfully.');

    // 1. Create Tables
    console.log('\n[1/4] Applying Relational Schema (10 tables)...');
    await connection.query(TABLES_DDL);
    console.log('✅ Schema applied: users, warehouses, suppliers, products, inventory,');
    console.log('   stock_movements, purchase_orders, purchase_order_items, sales_orders, sales_order_items.');

    // 2. Insert Seed Catalog Data
    console.log('\n[2/4] Seeding Warehouses, Suppliers, Catalog Products & Stock...');
    await connection.query(SEED_DATA_SQL);
    console.log('✅ Baseline operational data seeded.');

    // 3. Provision User Accounts
    console.log('\n[3/4] Provisioning Role-Gated User Accounts...');
    for (const user of USERS_TO_SEED) {
      const [existing] = await connection.execute(
        'SELECT id, email, role FROM users WHERE email = ?',
        [user.email]
      );

      if (existing.length > 0) {
        console.log(`   ℹ️ User ${user.email} already exists (${existing[0].role}).`);
      } else {
        const passwordHash = await bcrypt.hash(user.password, BCRYPT_ROUNDS);
        await connection.execute(
          'INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)',
          [user.name, user.email, passwordHash, user.role]
        );
        console.log(`   ✨ Created user: ${user.email} [${user.role}]`);
      }
    }

    // 4. Verify Final Database State
    console.log('\n[4/4] Verifying Target Database State...');
    const [tables] = await connection.query('SHOW TABLES');
    const tableNames = tables.map((r) => Object.values(r)[0]);
    console.log(`✅ Successfully verified ${tableNames.length} tables in '${dbConfig.database}':`);
    console.log(`   ${tableNames.join(', ')}`);

    const [userRows] = await connection.query('SELECT name, email, role, is_active FROM users');
    console.log('\n✅ Active system users:');
    userRows.forEach((u) => console.log(`   - ${u.email} (${u.role})`));

    console.log('\n================================================================');
    console.log('🎉 Cloud Database Setup Complete & Ready for Render / Vercel!');
    console.log('================================================================');
  } catch (error) {
    console.error('\n❌ [Setup Error]:', error.message);
    if (error.code === 'ER_BAD_DB_ERROR') {
      console.error(`\nHint: Database '${dbConfig.database}' does not exist on this MySQL host.`);
      console.error('Please verify that DB_NAME matches your Aiven database (default is "defaultdb").');
    } else if (error.code === 'HANDSHAKE_ERROR' || error.message.includes('secure transport')) {
      console.error('\nHint: SSL connection is required by your cloud provider.');
      console.error('Ensure DB_SSL=true in your environment variables.');
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runSetup();

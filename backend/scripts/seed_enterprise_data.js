/**
 * ============================================================================
 * File: backend/scripts/seed_enterprise_data.js
 * Purpose: Enterprise Data Generator & Seeder (100+ rows across all relevant tables).
 * Why it exists: Populates realistic enterprise-scale datasets for RIMS,
 * ensuring products, orders, stock levels, and movements exceed 100+ records.
 *
 * Fully idempotent: Safe to execute repeatedly against local dev and container DBs.
 * ============================================================================
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'inventory_db',
  multipleStatements: true,
};

const CATEGORIES = [
  'Power Tools',
  'Industrial Fasteners',
  'Safety & PPE',
  'Packaging Materials',
  'Electronics & Sensors',
  'Office & Facility',
  'Hydraulics & Pneumatics',
  'Lighting & Electrical',
];

const CITIES = [
  'Chicago', 'Newark', 'Reno', 'Dallas', 'Atlanta',
  'Seattle', 'Denver', 'Phoenix', 'Memphis', 'Detroit',
  'Mumbai', 'Bengaluru', 'Delhi', 'Pune', 'Hyderabad',
];

async function runSeeder() {
  console.log(`[Enterprise Seeder] Connecting to MySQL at ${DB_CONFIG.host}:${DB_CONFIG.port} / ${DB_CONFIG.database}...`);
  const conn = await mysql.createConnection(DB_CONFIG);

  try {
    // ------------------------------------------------------------------------
    // 1. Ensure Baseline Users Exist
    // ------------------------------------------------------------------------
    console.log('[1/7] Ensuring baseline users...');
    const usersSql = `
      INSERT INTO users (id, name, email, password_hash, role, is_active) VALUES
      (1, 'System Administrator', 'admin@rims.com', '$2b$10$zImGWrIP4TXaXyeCIyH45.5CXp28gtnitF9ziqOM6Ncfjcwi/MxYC', 'admin', 1),
      (2, 'Warehouse Manager', 'manager@rims.com', '$2b$10$zImGWrIP4TXaXyeCIyH45.5CXp28gtnitF9ziqOM6Ncfjcwi/MxYC', 'manager', 1),
      (3, 'Inventory Staff', 'staff@rims.com', '$2b$10$zImGWrIP4TXaXyeCIyH45.5CXp28gtnitF9ziqOM6Ncfjcwi/MxYC', 'staff', 1)
      ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role), is_active = VALUES(is_active);
    `;
    await conn.query(usersSql);

    const [userRows] = await conn.query('SELECT id FROM users WHERE is_active = 1 LIMIT 5;');
    const validUserId = userRows[0]?.id || 1;

    // ------------------------------------------------------------------------
    // 2. Seed Suppliers (Ensure >= 105 suppliers)
    // ------------------------------------------------------------------------
    console.log('[2/7] Seeding suppliers (Target: 105+)...');
    const [supplierCountRows] = await conn.query('SELECT COUNT(*) AS count FROM suppliers;');
    const currentSuppliers = parseInt(supplierCountRows[0].count, 10);

    if (currentSuppliers < 105) {
      const suppliersToInsert = [];
      for (let i = 1; i <= 110; i++) {
        const cat = CATEGORIES[i % CATEGORIES.length];
        suppliersToInsert.push([
          `Vendor Partner ${i} - ${cat}`,
          `Contact Agent ${i}`,
          `supplier_${i}@enterprise-rims.com`,
          `+1-555-01${String(i).padStart(2, '0')}`,
          `${100 + i} Industrial Corridor, Suite ${i}`,
          1,
        ]);
      }

      for (const s of suppliersToInsert) {
        await conn.query(
          `INSERT INTO suppliers (name, contact_name, email, phone, address, is_active)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE contact_name = VALUES(contact_name), address = VALUES(address);`,
          s
        );
      }
    }

    const [allSuppliers] = await conn.query('SELECT id FROM suppliers WHERE is_active = 1;');
    const supplierIds = allSuppliers.map((s) => s.id);

    // ------------------------------------------------------------------------
    // 3. Seed Warehouses (Ensure >= 25 warehouses)
    // ------------------------------------------------------------------------
    console.log('[3/7] Seeding warehouses (Target: 25+)...');
    const [warehouseCountRows] = await conn.query('SELECT COUNT(*) AS count FROM warehouses;');
    const currentWarehouses = parseInt(warehouseCountRows[0].count, 10);

    if (currentWarehouses < 25) {
      for (let i = 1; i <= 25; i++) {
        const city = CITIES[i % CITIES.length];
        const code = `WH-E${String(i).padStart(3, '0')}`;
        const name = `Regional Hub ${i} - ${city}`;
        const address = `${500 + i} Logistics Way`;
        await conn.query(
          `INSERT INTO warehouses (name, code, address, city, is_active)
           VALUES (?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE name = VALUES(name), address = VALUES(address), city = VALUES(city);`,
          [name, code, address, city]
        );
      }
    }

    const [allWarehouses] = await conn.query('SELECT id FROM warehouses WHERE is_active = 1;');
    const warehouseIds = allWarehouses.map((w) => w.id);

    // ------------------------------------------------------------------------
    // 4. Seed Products (Target: 150+ products)
    // ------------------------------------------------------------------------
    console.log('[4/7] Seeding catalog products (Target: 150+)...');
    const [productCountRows] = await conn.query('SELECT COUNT(*) AS count FROM products;');
    const currentProducts = parseInt(productCountRows[0].count, 10);

    if (currentProducts < 150) {
      for (let i = 1; i <= 150; i++) {
        const sku = `SKU-ENT-${String(i).padStart(4, '0')}`;
        const cat = CATEGORIES[i % CATEGORIES.length];
        const name = `Enterprise Product ${i} (${cat})`;
        const desc = `Commercial grade ${cat} item engineered for enterprise deployment. Batch serial ${i}.`;
        const unitPrice = parseFloat((15.0 + ((i * 7.25) % 250)).toFixed(2));
        const costPrice = parseFloat((unitPrice * 0.62).toFixed(2));
        const reorderLevel = 10 + (i % 25);
        const supplierId = supplierIds[i % supplierIds.length];

        await conn.query(
          `INSERT INTO products (sku, name, description, category, unit_price, cost_price, reorder_level, supplier_id, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE
             name = VALUES(name),
             description = VALUES(description),
             category = VALUES(category),
             unit_price = VALUES(unit_price),
             cost_price = VALUES(cost_price),
             reorder_level = VALUES(reorder_level);`,
          [sku, name, desc, cat, unitPrice, costPrice, reorderLevel, supplierId]
        );
      }
    }

    const [allProducts] = await conn.query('SELECT id, unit_price, cost_price, reorder_level FROM products WHERE is_active = 1;');

    // ------------------------------------------------------------------------
    // 5. Seed Stock Levels (Target: 250+ entries across warehouses)
    // ------------------------------------------------------------------------
    console.log('[5/7] Seeding stock levels (Target: 250+)...');
    for (let i = 0; i < allProducts.length; i++) {
      const prod = allProducts[i];
      // Place each product into 2 different warehouses
      const wh1 = warehouseIds[i % warehouseIds.length];
      const wh2 = warehouseIds[(i + 3) % warehouseIds.length];

      // Normal healthy quantity
      const healthyQty = 50 + ((i * 9) % 180);
      await conn.query(
        `INSERT INTO stock_levels (product_id, warehouse_id, quantity)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = VALUES(quantity);`,
        [prod.id, wh1, healthyQty]
      );

      // Warehouse 2 has occasional low-stock scenario for testing alerts
      const isLowStock = i % 5 === 0;
      const lowStockQty = isLowStock ? Math.max(1, prod.reorder_level - 3) : 30 + ((i * 5) % 90);
      await conn.query(
        `INSERT INTO stock_levels (product_id, warehouse_id, quantity)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = VALUES(quantity);`,
        [prod.id, wh2, lowStockQty]
      );
    }

    // ------------------------------------------------------------------------
    // 6. Seed Purchase Orders & Line Items (Target: 110+ POs, 250+ items)
    // ------------------------------------------------------------------------
    console.log('[6/7] Seeding purchase orders and sales orders (Target: 110+ POs, 110+ SOs)...');
    const [poCountRows] = await conn.query('SELECT COUNT(*) AS count FROM purchase_orders;');
    const currentPOs = parseInt(poCountRows[0].count, 10);

    if (currentPOs < 110) {
      const poStatuses = ['draft', 'ordered', 'received', 'cancelled'];
      for (let i = 1; i <= 115; i++) {
        const poNumber = `PO-ENT-2026-${String(i).padStart(4, '0')}`;
        const supplierId = supplierIds[i % supplierIds.length];
        const warehouseId = warehouseIds[i % warehouseIds.length];
        const status = poStatuses[i % poStatuses.length];
        const notes = `Enterprise replenishment procurement cycle #${i}`;

        // Select 2-3 distinct products for this PO
        const item1 = allProducts[(i * 2) % allProducts.length];
        const item2 = allProducts[(i * 2 + 1) % allProducts.length];
        const qty1 = 20 + (i % 30);
        const qty2 = 15 + (i % 25);
        const totalAmount = parseFloat((qty1 * item1.cost_price + qty2 * item2.cost_price).toFixed(2));

        const [poRes] = await conn.query(
          `INSERT INTO purchase_orders (po_number, supplier_id, warehouse_id, status, total_amount, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE total_amount = VALUES(total_amount), status = VALUES(status);`,
          [poNumber, supplierId, warehouseId, status, totalAmount, notes, validUserId]
        );

        const poId = poRes.insertId || (await conn.query('SELECT id FROM purchase_orders WHERE po_number = ?', [poNumber]))[0][0].id;

        // Line items
        await conn.query(
          `INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_cost)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit_cost = VALUES(unit_cost);`,
          [poId, item1.id, qty1, item1.cost_price]
        );

        await conn.query(
          `INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_cost)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit_cost = VALUES(unit_cost);`,
          [poId, item2.id, qty2, item2.cost_price]
        );
      }
    }

    // ------------------------------------------------------------------------
    // 7. Seed Sales Orders & Line Items (Target: 110+ SOs, 250+ items)
    // ------------------------------------------------------------------------
    const [soCountRows] = await conn.query('SELECT COUNT(*) AS count FROM sales_orders;');
    const currentSOs = parseInt(soCountRows[0].count, 10);

    if (currentSOs < 110) {
      const soStatuses = ['draft', 'confirmed', 'fulfilled', 'cancelled'];
      for (let i = 1; i <= 115; i++) {
        const soNumber = `SO-ENT-2026-${String(i).padStart(4, '0')}`;
        const customerName = `Corporate Client Alpha ${i} Ltd`;
        const warehouseId = warehouseIds[i % warehouseIds.length];
        const status = soStatuses[i % soStatuses.length];
        const notes = `Commercial dispatch schedule #${i}`;

        const item1 = allProducts[(i * 3) % allProducts.length];
        const item2 = allProducts[(i * 3 + 1) % allProducts.length];
        const qty1 = 5 + (i % 15);
        const qty2 = 10 + (i % 12);
        const totalAmount = parseFloat((qty1 * item1.unit_price + qty2 * item2.unit_price).toFixed(2));

        const [soRes] = await conn.query(
          `INSERT INTO sales_orders (so_number, customer_name, warehouse_id, status, total_amount, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE total_amount = VALUES(total_amount), status = VALUES(status);`,
          [soNumber, customerName, warehouseId, status, totalAmount, notes, validUserId]
        );

        const soId = soRes.insertId || (await conn.query('SELECT id FROM sales_orders WHERE so_number = ?', [soNumber]))[0][0].id;

        // Line items
        await conn.query(
          `INSERT INTO sales_order_items (sales_order_id, product_id, quantity, unit_price)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit_price = VALUES(unit_price);`,
          [soId, item1.id, qty1, item1.unit_price]
        );

        await conn.query(
          `INSERT INTO sales_order_items (sales_order_id, product_id, quantity, unit_price)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit_price = VALUES(unit_price);`,
          [soId, item2.id, qty2, item2.unit_price]
        );
      }
    }

    // ------------------------------------------------------------------------
    // 8. Seed Stock Movements (Target: 250+ audit rows)
    // ------------------------------------------------------------------------
    console.log('[7/7] Seeding stock movements (Target: 250+)...');
    const [smCountRows] = await conn.query('SELECT COUNT(*) AS count FROM stock_movements;');
    const currentSMs = parseInt(smCountRows[0].count, 10);

    if (currentSMs < 250) {
      const needed = 260 - currentSMs;
      const movementTypes = ['in', 'out', 'adjustment'];
      const refTypes = ['manual', 'purchase_order', 'sales_order', 'transfer'];

      for (let i = 1; i <= needed; i++) {
        const prod = allProducts[i % allProducts.length];
        const wh = warehouseIds[i % warehouseIds.length];
        const mType = movementTypes[i % movementTypes.length];
        const rType = refTypes[i % refTypes.length];
        const qty = 5 + (i % 30);
        const ref = `Enterprise Audit Entry #${currentSMs + i} (${rType.toUpperCase()})`;

        await conn.query(
          `INSERT INTO stock_movements (product_id, warehouse_id, user_id, movement_type, reference_type, reference_id, quantity, reference)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          [prod.id, wh, validUserId, mType, rType, i <= 100 ? i : null, qty, ref]
        );
      }
    }

    // ------------------------------------------------------------------------
    // FINAL AUDIT: Report Row Counts for All Tables
    // ------------------------------------------------------------------------
    console.log('\n============================================================');
    console.log(`DATABASE ROW COUNTS: [${DB_CONFIG.database}] @ ${DB_CONFIG.host}`);
    console.log('============================================================');

    const [tables] = await conn.query('SHOW TABLES;');
    const results = {};

    for (const t of tables) {
      const tableName = Object.values(t)[0];
      const [rows] = await conn.query(`SELECT COUNT(*) AS count FROM \`${tableName}\`;`);
      results[tableName] = parseInt(rows[0].count, 10);
      console.log(`  - ${tableName.padEnd(25)}: ${results[tableName]} rows`);
    }

    console.log('============================================================\n');
    return results;
  } finally {
    await conn.end();
  }
}

// Direct execution
runSeeder()
  .then(() => {
    console.log('[Enterprise Seeder] Seeding finished successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Enterprise Seeder Fatal Error]:', err);
    process.exit(1);
  });

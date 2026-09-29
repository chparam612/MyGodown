/**
 * ============================================================================
 * File: backend/scripts/auditDatabase.js
 * Purpose: Full fresh audit of inventory_db after all 8 modules of live testing.
 * ============================================================================
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { execute, pool } = await import('../src/config/db.js');

async function audit() {
  console.log('====================================================================');
  console.log(`[FULL AUDIT]: Target Database = ${process.env.DB_NAME || 'inventory_db'}`);
  console.log(`[EXECUTION DATE]: ${new Date().toISOString()}`);
  console.log('====================================================================\n');

  const tables = [
    'users',
    'products',
    'warehouses',
    'suppliers',
    'stock_levels',
    'stock_movements',
    'purchase_orders',
    'purchase_order_items',
    'sales_orders',
    'sales_order_items'
  ];

  console.log('--- 1. TABLE ROW COUNTS IN inventory_db ---');
  for (const t of tables) {
    const [res] = await execute(`SELECT COUNT(*) AS count FROM ${t};`);
    console.log(`${t.padEnd(24)} : ${res[0].count}`);
  }

  console.log('\n--- 2. USERS AUDIT ---');
  const [users] = await execute('SELECT id, name, email, role, is_active FROM users ORDER BY id ASC;');
  console.table(users);

  console.log('\n--- 3. PRODUCTS AUDIT (Seed vs LIVE- / Inactive) ---');
  const [prodCounts] = await execute(`
    SELECT 
      COUNT(*) AS total,
      SUM(CASE WHEN id <= 20 THEN 1 ELSE 0 END) AS seed_count,
      SUM(CASE WHEN id > 20 THEN 1 ELSE 0 END) AS live_count,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactive_count
    FROM products;
  `);
  console.table(prodCounts);

  const [activeLiveProducts] = await execute('SELECT id, sku, name, is_active FROM products WHERE id > 20 AND is_active = 1;');
  console.log('Active LIVE- products (MUST BE EMPTY):', activeLiveProducts);

  console.log('\n--- 4. WAREHOUSES AUDIT (Seed vs LIVE- / Inactive) ---');
  const [whCounts] = await execute(`
    SELECT 
      COUNT(*) AS total,
      SUM(CASE WHEN id <= 3 THEN 1 ELSE 0 END) AS seed_count,
      SUM(CASE WHEN id > 3 THEN 1 ELSE 0 END) AS live_count,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactive_count
    FROM warehouses;
  `);
  console.table(whCounts);

  const [activeLiveWarehouses] = await execute('SELECT id, code, name, is_active FROM warehouses WHERE id > 3 AND is_active = 1;');
  console.log('Active LIVE- warehouses (MUST BE EMPTY):', activeLiveWarehouses);

  console.log('\n--- 5. SUPPLIERS AUDIT (Seed vs LIVE- / Inactive) ---');
  const [supCounts] = await execute(`
    SELECT 
      COUNT(*) AS total,
      SUM(CASE WHEN id <= 5 THEN 1 ELSE 0 END) AS seed_count,
      SUM(CASE WHEN id > 5 THEN 1 ELSE 0 END) AS live_count,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactive_count
    FROM suppliers;
  `);
  console.table(supCounts);

  const [activeLiveSuppliers] = await execute('SELECT id, name, email, is_active FROM suppliers WHERE id > 5 AND is_active = 1;');
  console.log('Active LIVE- suppliers (MUST BE EMPTY):', activeLiveSuppliers);

  console.log('\n--- 6. PURCHASE ORDERS AUDIT (Status Terminal Check) ---');
  const [poList] = await execute('SELECT id, po_number, supplier_id, warehouse_id, status, total_amount, created_at FROM purchase_orders ORDER BY id ASC;');
  console.table(poList);
  const [openPOs] = await execute("SELECT id, po_number, status FROM purchase_orders WHERE status IN ('draft', 'ordered');");
  console.log('Open Purchase Orders (MUST BE EMPTY):', openPOs);

  console.log('\n--- 7. SALES ORDERS AUDIT (Status Terminal Check) ---');
  const [soList] = await execute('SELECT id, so_number, customer_name, warehouse_id, status, total_amount, created_at FROM sales_orders ORDER BY id ASC;');
  console.table(soList);
  const [openSOs] = await execute("SELECT id, so_number, status FROM sales_orders WHERE status IN ('draft', 'confirmed');");
  console.log('Open Sales Orders (MUST BE EMPTY):', openSOs);

  console.log('\n--- 8. STOCK BALANCES: SEEDED WAREHOUSES 1-3 BASELINE ---');
  const [seededStock] = await execute(`
    SELECT warehouse_id, SUM(quantity) AS total_units, COUNT(*) AS product_count 
    FROM stock_levels 
    WHERE warehouse_id IN (1, 2, 3) 
    GROUP BY warehouse_id 
    ORDER BY warehouse_id;
  `);
  console.table(seededStock);

  console.log('\n--- 9. NON-SEEDED INVENTORY RESIDUAL STOCK CHECK ---');
  const [residualStock] = await execute('SELECT * FROM stock_levels WHERE quantity > 0 AND warehouse_id NOT IN (1, 2, 3);');
  console.log('Residual non-zero stock outside seeded warehouses (MUST BE EMPTY):', residualStock);

  console.log('\n--- 10. STOCK MOVEMENTS TOTAL ---');
  const [movementsCount] = await execute('SELECT COUNT(*) AS total_movements FROM stock_movements;');
  console.log(`Total movements recorded in stock_movements: ${movementsCount[0].total_movements}`);

  await pool.end();
}

audit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});

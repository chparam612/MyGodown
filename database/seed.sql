-- ============================================================================
-- File: database/seed.sql
-- Purpose: Initial baseline seed data for inventory_db.
-- Why it exists: Populates 3 warehouses, 5 suppliers, 20 realistic catalog products
-- across 5 categories, and starting stock levels (including low-stock scenarios).
--
-- HARD RULES SATISFIED:
-- 1. NO users inserted here (users are provisioned via backend/scripts/seedUsers.js).
-- 2. Fully idempotent using INSERT ... ON DUPLICATE KEY UPDATE.
-- 3. Zero hardcoded auto-increment IDs; all FK relations resolved via subqueries.
-- 4. Low stock items present: initial quantities set below reorder_level in specific warehouses.
-- ============================================================================

USE inventory_db;

-- ----------------------------------------------------------------------------
-- 1. Warehouses (3 physical logistics facilities)
-- Unique key: code
-- ----------------------------------------------------------------------------
INSERT INTO warehouses (name, code, address, city, is_active)
VALUES
  ('Central Logistics Hub', 'WH-CENTRAL', '100 Industrial Parkway', 'Chicago', 1),
  ('East Coast Distribution Center', 'WH-EAST', '450 Harbor Boulevard', 'Newark', 1),
  ('West Coast Fulfillment Center', 'WH-WEST', '780 Logistics Way', 'Reno', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  address = VALUES(address),
  city = VALUES(city),
  is_active = VALUES(is_active);

-- ----------------------------------------------------------------------------
-- 2. Suppliers (5 verified industrial vendor partners)
-- Unique match via name
-- ----------------------------------------------------------------------------
INSERT INTO suppliers (id, name, contact_name, email, phone, address, is_active)
VALUES
  (1, 'Apex Industrial Tools', 'Arthur Pendelton', 'sales@apextools.com', '+1-312-555-0140', '1200 Manufacturing Row, Detroit, MI', 1),
  (2, 'VoltCore Electronics', 'Elena Rostova', 'orders@voltcore.com', '+1-408-555-0192', '850 Semiconductor Drive, San Jose, CA', 1),
  (3, 'Safeguard PPE Supplies', 'Marcus Vance', 'supply@safeguardppe.com', '+1-216-555-0177', '300 Safety Way, Cleveland, OH', 1),
  (4, 'PackMaster Logistics Goods', 'Sarah Jenkins', 'info@packmaster.com', '+1-901-555-0164', '620 Distribution Blvd, Memphis, TN', 1),
  (5, 'Precision Fasteners & Hardware', 'David Kim', 'contracts@precisionfasteners.com', '+1-414-555-0185', '410 Foundry Lane, Milwaukee, WI', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  contact_name = VALUES(contact_name),
  email = VALUES(email),
  phone = VALUES(phone),
  address = VALUES(address),
  is_active = VALUES(is_active);

-- ----------------------------------------------------------------------------
-- 3. Products (20 realistic catalog items across 5 categories)
-- Unique key: sku
-- supplier_id resolved dynamically via subquery
-- ----------------------------------------------------------------------------

-- Category: Power Tools (Supplier: Apex Industrial Tools)
INSERT INTO products (sku, name, description, category, unit_price, cost_price, reorder_level, supplier_id, is_active)
VALUES
  ('TOOL-DRL-001', 'Cordless Brushless Drill 18V', 'Heavy-duty brushless drill with 2 lithium batteries and charger', 'Power Tools', 129.99, 79.50, 15, (SELECT id FROM suppliers WHERE name = 'Apex Industrial Tools'), 1),
  ('TOOL-SAW-002', 'Circular Saw 7-1/4 Inch 15A', 'Electric circular saw with laser guide and carbide-tipped blade', 'Power Tools', 159.00, 98.00, 12, (SELECT id FROM suppliers WHERE name = 'Apex Industrial Tools'), 1),
  ('TOOL-IMP-003', 'Cordless Impact Driver 20V', 'High-torque compact impact driver with 1/4 inch quick-release hex', 'Power Tools', 119.50, 72.00, 15, (SELECT id FROM suppliers WHERE name = 'Apex Industrial Tools'), 1),
  ('TOOL-SND-004', 'Random Orbit Sander 5-Inch', 'Variable speed palm grip orbit sander with dust extraction canister', 'Power Tools', 68.00, 39.00, 10, (SELECT id FROM suppliers WHERE name = 'Apex Industrial Tools'), 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), description = VALUES(description), category = VALUES(category),
  unit_price = VALUES(unit_price), cost_price = VALUES(cost_price), reorder_level = VALUES(reorder_level),
  supplier_id = VALUES(supplier_id), is_active = VALUES(is_active);

-- Category: Hand Tools & Hardware (Supplier: Precision Fasteners & Hardware)
INSERT INTO products (sku, name, description, category, unit_price, cost_price, reorder_level, supplier_id, is_active)
VALUES
  ('HDW-SCW-005', 'Stainless Steel Hex Bolts M8 (Box of 100)', 'Grade 304 stainless steel partially threaded hex cap screws', 'Hardware', 24.50, 12.00, 40, (SELECT id FROM suppliers WHERE name = 'Precision Fasteners & Hardware'), 1),
  ('HDW-ANC-006', 'Concrete Wedge Anchors 3/8in (Box of 50)', 'Zinc-plated carbon steel anchors for solid concrete fastening', 'Hardware', 32.00, 16.50, 30, (SELECT id FROM suppliers WHERE name = 'Precision Fasteners & Hardware'), 1),
  ('HDW-WRN-007', 'Combination Wrench Set 16-Piece', 'Metric chrome vanadium steel wrenches 6mm to 24mm with organizer rack', 'Hardware', 49.99, 28.00, 20, (SELECT id FROM suppliers WHERE name = 'Precision Fasteners & Hardware'), 1),
  ('HDW-PLR-008', 'Heavy-Duty Pliers Set 3-Piece', 'Lineman pliers, diagonal cutting pliers, and long nose pliers', 'Hardware', 34.00, 18.00, 25, (SELECT id FROM suppliers WHERE name = 'Precision Fasteners & Hardware'), 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), description = VALUES(description), category = VALUES(category),
  unit_price = VALUES(unit_price), cost_price = VALUES(cost_price), reorder_level = VALUES(reorder_level),
  supplier_id = VALUES(supplier_id), is_active = VALUES(is_active);

-- Category: Electronics & Sensors (Supplier: VoltCore Electronics)
INSERT INTO products (sku, name, description, category, unit_price, cost_price, reorder_level, supplier_id, is_active)
VALUES
  ('ELEC-SMR-009', 'Industrial Motion Sensor 24V', 'PIR motion sensor with adjustable range and IP65 enclosure', 'Electronics', 45.00, 22.00, 25, (SELECT id FROM suppliers WHERE name = 'VoltCore Electronics'), 1),
  ('ELEC-TMP-010', 'Digital Temperature & Humidity Probe', 'RS485 Modbus environmental sensor for climate-controlled warehousing', 'Electronics', 58.50, 31.00, 20, (SELECT id FROM suppliers WHERE name = 'VoltCore Electronics'), 1),
  ('ELEC-RLY-011', 'Solid State Relay 40A DC-AC', 'Optically isolated SSR with aluminum heat sink and LED indicator', 'Electronics', 28.00, 14.00, 30, (SELECT id FROM suppliers WHERE name = 'VoltCore Electronics'), 1),
  ('ELEC-CAB-012', 'Shielded Cat6 Cable Reel 1000ft', 'Solid bare copper 23AWG CMR rated industrial Ethernet bulk spool', 'Electronics', 145.00, 88.00, 8, (SELECT id FROM suppliers WHERE name = 'VoltCore Electronics'), 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), description = VALUES(description), category = VALUES(category),
  unit_price = VALUES(unit_price), cost_price = VALUES(cost_price), reorder_level = VALUES(reorder_level),
  supplier_id = VALUES(supplier_id), is_active = VALUES(is_active);

-- Category: Safety Equipment (Supplier: Safeguard PPE Supplies)
INSERT INTO products (sku, name, description, category, unit_price, cost_price, reorder_level, supplier_id, is_active)
VALUES
  ('SAFE-GLV-013', 'Nitrile Cut-Resistant Gloves (Pack of 12)', 'Level A4 cut-resistant polyurethane coated palm work gloves', 'Safety', 38.00, 19.00, 50, (SELECT id FROM suppliers WHERE name = 'Safeguard PPE Supplies'), 1),
  ('SAFE-HLM-014', 'Industrial Hard Hat with Ratchet Suspension', 'ANSI Z89.1 Type 1 Class C vented hard hat with adjustable dial', 'Safety', 22.50, 11.00, 35, (SELECT id FROM suppliers WHERE name = 'Safeguard PPE Supplies'), 1),
  ('SAFE-EYE-015', 'Anti-Fog Protective Safety Goggles', 'Wrap-around UV protection impact-resistant polycarbonate safety glasses', 'Safety', 12.00, 5.50, 60, (SELECT id FROM suppliers WHERE name = 'Safeguard PPE Supplies'), 1),
  ('SAFE-EAR-016', 'Noise Cancelling Safety Earmuffs 30dB', 'Over-the-head hearing protection earmuffs with padded headband', 'Safety', 29.00, 14.50, 25, (SELECT id FROM suppliers WHERE name = 'Safeguard PPE Supplies'), 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), description = VALUES(description), category = VALUES(category),
  unit_price = VALUES(unit_price), cost_price = VALUES(cost_price), reorder_level = VALUES(reorder_level),
  supplier_id = VALUES(supplier_id), is_active = VALUES(is_active);

-- Category: Packaging & Storage (Supplier: PackMaster Logistics Goods)
INSERT INTO products (sku, name, description, category, unit_price, cost_price, reorder_level, supplier_id, is_active)
VALUES
  ('STOR-BIN-017', 'Stackable Plastic Parts Bins (Pack of 6)', 'Heavy-duty blue polypropylene hopper front organizer bins', 'Storage', 36.00, 18.00, 40, (SELECT id FROM suppliers WHERE name = 'PackMaster Logistics Goods'), 1),
  ('STOR-PLT-018', 'Heavy-Duty Euro Plastic Pallet 1200x800', 'Four-way entry rackable recycled HDPE export pallet', 'Storage', 75.00, 42.00, 15, (SELECT id FROM suppliers WHERE name = 'PackMaster Logistics Goods'), 1),
  ('STOR-TRK-019', 'Hydraulic Pallet Jack 5500lbs Capacity', 'Manual hand forklift with polyurethane steer wheels and overload valve', 'Storage', 349.00, 220.00, 4, (SELECT id FROM suppliers WHERE name = 'PackMaster Logistics Goods'), 1),
  ('STOR-STR-020', 'Heavy-Duty Stretch Wrap 80 Gauge (Case of 4)', '18 inch x 1500 ft clear cast film pallet packing wrap', 'Storage', 54.00, 29.00, 30, (SELECT id FROM suppliers WHERE name = 'PackMaster Logistics Goods'), 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), description = VALUES(description), category = VALUES(category),
  unit_price = VALUES(unit_price), cost_price = VALUES(cost_price), reorder_level = VALUES(reorder_level),
  supplier_id = VALUES(supplier_id), is_active = VALUES(is_active);

-- ----------------------------------------------------------------------------
-- 4. Stock Levels (Starting stock across the 3 warehouses)
-- Unique key: (product_id, warehouse_id)
-- Product and warehouse IDs resolved dynamically via subqueries
--
-- LOW-STOCK SCENARIOS FOR TESTING:
--   - ELEC-SMR-009 in WH-CENTRAL: 8 units (reorder_level is 25)  -> LOW STOCK
--   - TOOL-SAW-002 in WH-EAST:    3 units (reorder_level is 12)  -> LOW STOCK
--   - SAFE-GLV-013 in WH-EAST:    15 units (reorder_level is 50) -> LOW STOCK
--   - STOR-STR-020 in WH-WEST:    6 units (reorder_level is 30)  -> LOW STOCK
-- ----------------------------------------------------------------------------

-- Central Logistics Hub (WH-CENTRAL)
INSERT INTO stock_levels (product_id, warehouse_id, quantity) VALUES
  ((SELECT id FROM products WHERE sku = 'TOOL-DRL-001'), (SELECT id FROM warehouses WHERE code = 'WH-CENTRAL'), 45),
  ((SELECT id FROM products WHERE sku = 'TOOL-SAW-002'), (SELECT id FROM warehouses WHERE code = 'WH-CENTRAL'), 28),
  ((SELECT id FROM products WHERE sku = 'TOOL-IMP-003'), (SELECT id FROM warehouses WHERE code = 'WH-CENTRAL'), 35),
  ((SELECT id FROM products WHERE sku = 'TOOL-SND-004'), (SELECT id FROM warehouses WHERE code = 'WH-CENTRAL'), 22),
  ((SELECT id FROM products WHERE sku = 'HDW-SCW-005'), (SELECT id FROM warehouses WHERE code = 'WH-CENTRAL'), 120),
  ((SELECT id FROM products WHERE sku = 'HDW-ANC-006'), (SELECT id FROM warehouses WHERE code = 'WH-CENTRAL'), 85),
  ((SELECT id FROM products WHERE sku = 'HDW-WRN-007'), (SELECT id FROM warehouses WHERE code = 'WH-CENTRAL'), 50),
  ((SELECT id FROM products WHERE sku = 'HDW-PLR-008'), (SELECT id FROM warehouses WHERE code = 'WH-CENTRAL'), 65),
  ((SELECT id FROM products WHERE sku = 'ELEC-SMR-009'), (SELECT id FROM warehouses WHERE code = 'WH-CENTRAL'), 8),   -- LOW STOCK (8 <= 25)
  ((SELECT id FROM products WHERE sku = 'ELEC-TMP-010'), (SELECT id FROM warehouses WHERE code = 'WH-CENTRAL'), 40),
  ((SELECT id FROM products WHERE sku = 'ELEC-RLY-011'), (SELECT id FROM warehouses WHERE code = 'WH-CENTRAL'), 75),
  ((SELECT id FROM products WHERE sku = 'ELEC-CAB-012'), (SELECT id FROM warehouses WHERE code = 'WH-CENTRAL'), 18),
  ((SELECT id FROM products WHERE sku = 'SAFE-GLV-013'), (SELECT id FROM warehouses WHERE code = 'WH-CENTRAL'), 140),
  ((SELECT id FROM products WHERE sku = 'SAFE-HLM-014'), (SELECT id FROM warehouses WHERE code = 'WH-CENTRAL'), 90),
  ((SELECT id FROM products WHERE sku = 'SAFE-EYE-015'), (SELECT id FROM warehouses WHERE code = 'WH-CENTRAL'), 180),
  ((SELECT id FROM products WHERE sku = 'SAFE-EAR-016'), (SELECT id FROM warehouses WHERE code = 'WH-CENTRAL'), 70),
  ((SELECT id FROM products WHERE sku = 'STOR-BIN-017'), (SELECT id FROM warehouses WHERE code = 'WH-CENTRAL'), 110),
  ((SELECT id FROM products WHERE sku = 'STOR-PLT-018'), (SELECT id FROM warehouses WHERE code = 'WH-CENTRAL'), 35),
  ((SELECT id FROM products WHERE sku = 'STOR-TRK-019'), (SELECT id FROM warehouses WHERE code = 'WH-CENTRAL'), 8),
  ((SELECT id FROM products WHERE sku = 'STOR-STR-020'), (SELECT id FROM warehouses WHERE code = 'WH-CENTRAL'), 65)
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity);

-- East Coast Distribution Center (WH-EAST)
INSERT INTO stock_levels (product_id, warehouse_id, quantity) VALUES
  ((SELECT id FROM products WHERE sku = 'TOOL-DRL-001'), (SELECT id FROM warehouses WHERE code = 'WH-EAST'), 20),
  ((SELECT id FROM products WHERE sku = 'TOOL-SAW-002'), (SELECT id FROM warehouses WHERE code = 'WH-EAST'), 3),    -- LOW STOCK (3 <= 12)
  ((SELECT id FROM products WHERE sku = 'HDW-SCW-005'), (SELECT id FROM warehouses WHERE code = 'WH-EAST'), 80),
  ((SELECT id FROM products WHERE sku = 'HDW-WRN-007'), (SELECT id FROM warehouses WHERE code = 'WH-EAST'), 25),
  ((SELECT id FROM products WHERE sku = 'ELEC-SMR-009'), (SELECT id FROM warehouses WHERE code = 'WH-EAST'), 30),
  ((SELECT id FROM products WHERE sku = 'SAFE-GLV-013'), (SELECT id FROM warehouses WHERE code = 'WH-EAST'), 15),   -- LOW STOCK (15 <= 50)
  ((SELECT id FROM products WHERE sku = 'SAFE-HLM-014'), (SELECT id FROM warehouses WHERE code = 'WH-EAST'), 45),
  ((SELECT id FROM products WHERE sku = 'STOR-BIN-017'), (SELECT id FROM warehouses WHERE code = 'WH-EAST'), 60),
  ((SELECT id FROM products WHERE sku = 'STOR-STR-020'), (SELECT id FROM warehouses WHERE code = 'WH-EAST'), 40)
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity);

-- West Coast Fulfillment Center (WH-WEST)
INSERT INTO stock_levels (product_id, warehouse_id, quantity) VALUES
  ((SELECT id FROM products WHERE sku = 'TOOL-IMP-003'), (SELECT id FROM warehouses WHERE code = 'WH-WEST'), 25),
  ((SELECT id FROM products WHERE sku = 'TOOL-SND-004'), (SELECT id FROM warehouses WHERE code = 'WH-WEST'), 18),
  ((SELECT id FROM products WHERE sku = 'HDW-ANC-006'), (SELECT id FROM warehouses WHERE code = 'WH-WEST'), 50),
  ((SELECT id FROM products WHERE sku = 'ELEC-TMP-010'), (SELECT id FROM warehouses WHERE code = 'WH-WEST'), 24),
  ((SELECT id FROM products WHERE sku = 'ELEC-CAB-012'), (SELECT id FROM warehouses WHERE code = 'WH-WEST'), 12),
  ((SELECT id FROM products WHERE sku = 'SAFE-EYE-015'), (SELECT id FROM warehouses WHERE code = 'WH-WEST'), 95),
  ((SELECT id FROM products WHERE sku = 'SAFE-EAR-016'), (SELECT id FROM warehouses WHERE code = 'WH-WEST'), 35),
  ((SELECT id FROM products WHERE sku = 'STOR-PLT-018'), (SELECT id FROM warehouses WHERE code = 'WH-WEST'), 20),
  ((SELECT id FROM products WHERE sku = 'STOR-TRK-019'), (SELECT id FROM warehouses WHERE code = 'WH-WEST'), 5),
  ((SELECT id FROM products WHERE sku = 'STOR-STR-020'), (SELECT id FROM warehouses WHERE code = 'WH-WEST'), 6)     -- LOW STOCK (6 <= 30)
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity);

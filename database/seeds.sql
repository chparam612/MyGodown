-- ============================================================================
-- File: database/seeds.sql
-- Purpose: Initial seed data for Retail Inventory Management System (RIMS).
-- Why it exists: Provides baseline users across all 3 roles (admin, manager, staff),
-- warehouses, suppliers, products, and initial stock with audit movements.
-- Uses INSERT IGNORE so execution is completely safe and idempotent.
-- ============================================================================

USE inventory_db;

-- ----------------------------------------------------------------------------
-- 1. Seed: users
-- All default seed users share the initial demo password: Admin@123
-- Password hash: $2b$10$zImGWrIP4TXaXyeCIyH45.5CXp28gtnitF9ziqOM6Ncfjcwi/MxYC
-- ----------------------------------------------------------------------------
INSERT IGNORE INTO users (id, name, email, password_hash, role, is_active) VALUES
(1, 'System Administrator', 'admin@mygodown.com', '$2b$10$zImGWrIP4TXaXyeCIyH45.5CXp28gtnitF9ziqOM6Ncfjcwi/MxYC', 'admin', 1),
(2, 'Warehouse Manager', 'manager@mygodown.com', '$2b$10$zImGWrIP4TXaXyeCIyH45.5CXp28gtnitF9ziqOM6Ncfjcwi/MxYC', 'manager', 1),
(3, 'Sales Staff', 'staff@mygodown.com', '$2b$10$zImGWrIP4TXaXyeCIyH45.5CXp28gtnitF9ziqOM6Ncfjcwi/MxYC', 'staff', 1);

-- ----------------------------------------------------------------------------
-- 2. Seed: warehouses
-- Multi-warehouse support: Central Hub and Northern Distribution Center
-- ----------------------------------------------------------------------------
INSERT IGNORE INTO warehouses (id, name, location, is_active) VALUES
(1, 'Central Logistics Hub', 'Sector 62, Noida, Uttar Pradesh', 1),
(2, 'Northern Distribution Center', 'Okhla Phase III, New Delhi', 1);

-- ----------------------------------------------------------------------------
-- 3. Seed: suppliers
-- Verified vendor partners for purchase ordering
-- ----------------------------------------------------------------------------
INSERT IGNORE INTO suppliers (id, name, contact_person, email, phone, address, is_active) VALUES
(1, 'Apex Industrial Hardware', 'Rajesh Sharma', 'orders@apexhardware.in', '+91 98765 43210', 'Plot 45, Industrial Area, Ghaziabad', 1),
(2, 'Global Components & Tools', 'Anita Verma', 'sales@globalcomponents.com', '+91 98111 22334', 'Building 12, Cyber Park, Gurugram', 1),
(3, 'FastTrack Supplies Ltd', 'Vikram Singh', 'contact@fasttracksupplies.in', '+91 99222 33445', 'Unit 7, Transport Nagar, Delhi', 1);

-- ----------------------------------------------------------------------------
-- 4. Seed: products
-- Catalog items with distinct SKUs, prices, categories, and reorder levels
-- ----------------------------------------------------------------------------
INSERT IGNORE INTO products (id, sku, name, description, category, cost_price, selling_price, reorder_level, is_active) VALUES
(1, 'TOOL-DRL-001', 'Heavy Duty Cordless Drill 18V', 'Brushless cordless drill with two 2.0Ah lithium batteries', 'Tools', 3200.00, 4800.00, 10, 1),
(2, 'TOOL-SET-002', '120-Piece Socket & Wrench Set', 'Chrome vanadium steel mechanic tool set with carry case', 'Tools', 2100.00, 3450.00, 15, 1),
(3, 'ELEC-SMR-003', 'Industrial Motion Sensor 24V', 'Infrared proximity motion sensor for warehouse automation', 'Electronics', 850.00, 1400.00, 20, 1),
(4, 'SAFE-GLV-004', 'Reinforced Nitrile Work Gloves', 'Cut-resistant safety work gloves, pack of 10 pairs', 'Safety', 420.00, 750.00, 30, 1),
(5, 'SAFE-HLM-005', 'Hard Hat Safety Helmet', 'High-density polyethylene safety helmet with adjustable ratchet', 'Safety', 350.00, 620.00, 25, 1),
(6, 'STOR-BIN-006', 'Stackable Plastic Storage Bins', 'Heavy duty blue polypropylene parts bin, 300x200x150mm', 'Storage', 180.00, 320.00, 40, 1);

-- ----------------------------------------------------------------------------
-- 5. Seed: stock_levels
-- Initial quantities in warehouses (Warehouse 1 = Central Hub, Warehouse 2 = Northern DC)
-- ----------------------------------------------------------------------------
INSERT IGNORE INTO stock_levels (id, product_id, warehouse_id, quantity) VALUES
(1, 1, 1, 45),  -- Drill: 45 units in Central Hub
(2, 2, 1, 30),  -- Socket set: 30 units in Central Hub
(3, 3, 1, 8),   -- Motion Sensor: 8 units in Central Hub (Below reorder level 20 -> LOW STOCK)
(4, 4, 1, 100), -- Gloves: 100 units in Central Hub
(5, 5, 1, 50),  -- Helmet: 50 units in Central Hub
(6, 6, 1, 150), -- Storage Bins: 150 units in Central Hub
(7, 1, 2, 20),  -- Drill: 20 units in Northern DC
(8, 2, 2, 12),  -- Socket set: 12 units in Northern DC (Below reorder level 15 -> LOW STOCK)
(9, 4, 2, 60);  -- Gloves: 60 units in Northern DC

-- ----------------------------------------------------------------------------
-- 6. Seed: stock_movements
-- Immutable audit records matching the initial stock receipts
-- ----------------------------------------------------------------------------
INSERT IGNORE INTO stock_movements (id, product_id, warehouse_id, type, quantity_change, reference_type, reason, user_id) VALUES
(1, 1, 1, 'RECEIPT', 45, 'INITIAL_SEED', 'Initial system opening stock', 1),
(2, 2, 1, 'RECEIPT', 30, 'INITIAL_SEED', 'Initial system opening stock', 1),
(3, 3, 1, 'RECEIPT', 8,  'INITIAL_SEED', 'Initial system opening stock', 1),
(4, 4, 1, 'RECEIPT', 100,'INITIAL_SEED', 'Initial system opening stock', 1),
(5, 5, 1, 'RECEIPT', 50, 'INITIAL_SEED', 'Initial system opening stock', 1),
(6, 6, 1, 'RECEIPT', 150,'INITIAL_SEED', 'Initial system opening stock', 1),
(7, 1, 2, 'RECEIPT', 20, 'INITIAL_SEED', 'Initial system opening stock', 1),
(8, 2, 2, 'RECEIPT', 12, 'INITIAL_SEED', 'Initial system opening stock', 1),
(9, 4, 2, 'RECEIPT', 60, 'INITIAL_SEED', 'Initial system opening stock', 1);

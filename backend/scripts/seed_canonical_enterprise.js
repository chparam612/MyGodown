/**
 * ============================================================================
 * File: backend/scripts/seed_canonical_enterprise.js
 * Purpose: Canonical Enterprise Data Seeder for Retail Inventory Management System.
 * Why it exists: Establishes a realistic, professional, synchronized dataset:
 *   - Exactly 8 realistic industrial suppliers
 *   - Exactly 5 regional logistics warehouses
 *   - Exactly 3 canonical baseline user accounts (@mygodown.com)
 *   - 110+ realistic, properly formatted catalog products across 5 categories
 *   - 220+ warehouse stock level allocations (with intentional low-stock scenarios)
 *   - 115 purchase orders with 230+ line items across real suppliers
 *   - 115 sales orders with 230+ line items across 25 real corporate clients
 *   - 260 immutable stock movement audit records
 *
 * Idempotent & Deterministic: Produces the exact same canonical state on both
 * containerized database (rims_mysql) and local dev database (inventory_db).
 * ============================================================================
 */

import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'inventory_db',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  multipleStatements: true,
};

// ----------------------------------------------------------------------------
// 1. Exactly 8 Realistic Industrial Suppliers
// ----------------------------------------------------------------------------
const SUPPLIERS = [
  {
    name: 'Apex Industrial Tools & Machinery',
    contactName: 'Arthur Pendelton',
    email: 'orders@apextoolcorp.com',
    phone: '+1-312-555-0140',
    address: '1200 Manufacturing Row, Detroit, MI 48202',
  },
  {
    name: 'VoltCore Electronics & Sensor Systems',
    contactName: 'Elena Rostova',
    email: 'sales@voltcore-systems.com',
    phone: '+1-408-555-0192',
    address: '850 Semiconductor Drive, San Jose, CA 95134',
  },
  {
    name: 'Safeguard PPE & Safety Supplies LLC',
    contactName: 'Marcus Vance',
    email: 'contracts@safeguardppe.com',
    phone: '+1-216-555-0177',
    address: '300 Safety Way, Cleveland, OH 44114',
  },
  {
    name: 'PackMaster Logistics Goods Corp',
    contactName: 'Sarah Jenkins',
    email: 'procurement@packmastercorp.com',
    phone: '+1-901-555-0164',
    address: '620 Distribution Blvd, Memphis, TN 38118',
  },
  {
    name: 'Precision Fasteners & Industrial Hardware',
    contactName: 'David Kim',
    email: 'supply@precisionfasteners.com',
    phone: '+1-414-555-0185',
    address: '410 Foundry Lane, Milwaukee, WI 53204',
  },
  {
    name: 'Midwest Fluid Power & Hydraulics Co',
    contactName: 'Rachel Gallagher',
    email: 'orders@midwestfluidpower.com',
    phone: '+1-317-555-0131',
    address: '1840 Industrial Blvd, Indianapolis, IN 46241',
  },
  {
    name: 'Titan Facility Supplies & Equipment',
    contactName: 'Gregory Thorne',
    email: 'sales@titanfacility.com',
    phone: '+1-816-555-0158',
    address: '2500 Commerce Center Way, Kansas City, MO 64120',
  },
  {
    name: 'Benchmark Commercial Lighting & Electrical',
    contactName: 'Cynthia Boyd',
    email: 'commercial@benchmarklighting.com',
    phone: '+1-614-555-0199',
    address: '770 Electric Parkway, Columbus, OH 43219',
  },
];

// ----------------------------------------------------------------------------
// 2. Exactly 5 Regional Logistics Warehouses
// ----------------------------------------------------------------------------
const WAREHOUSES = [
  {
    name: 'Central Logistics Hub',
    code: 'WH-CENTRAL',
    address: '100 Industrial Parkway',
    city: 'Chicago',
  },
  {
    name: 'East Coast Distribution Center',
    code: 'WH-EAST',
    address: '450 Harbor Boulevard',
    city: 'Newark',
  },
  {
    name: 'West Coast Fulfillment Center',
    code: 'WH-WEST',
    address: '780 Logistics Way',
    city: 'Reno',
  },
  {
    name: 'Southern Regional Depot',
    code: 'WH-SOUTH',
    address: '1200 Interstate Commerce Park',
    city: 'Dallas',
  },
  {
    name: 'Pacific Northwest Transit Facility',
    code: 'WH-PNW',
    address: '310 Freight Terminal Way',
    city: 'Seattle',
  },
];

// ----------------------------------------------------------------------------
// 3. Real Product Catalog Definitions (112 Specific Products)
// ----------------------------------------------------------------------------
const PRODUCT_TEMPLATES = [
  // Category: Power Tools (Supplier 0: Apex Industrial Tools)
  {
    cat: 'Power Tools',
    supIdx: 0,
    prefix: 'TOOL',
    items: [
      { name: '18V Brushless Cordless Drill Kit (2 Batteries)', unitPrice: 149.99, costPrice: 89.50, reorder: 15 },
      { name: 'Heavy-Duty 7-1/4 Inch Circular Saw 15A', unitPrice: 169.00, costPrice: 105.00, reorder: 12 },
      { name: 'Variable-Speed Reciprocating Saw 12A', unitPrice: 129.50, costPrice: 78.00, reorder: 10 },
      { name: 'Compact 20V Max Impact Driver Bare Tool', unitPrice: 119.00, costPrice: 72.00, reorder: 18 },
      { name: '10-Inch Portable Jobsite Table Saw with Stand', unitPrice: 429.00, costPrice: 285.00, reorder: 6 },
      { name: '4-1/2-Inch Small Angle Grinder 11A Paddle Switch', unitPrice: 89.99, costPrice: 52.00, reorder: 20 },
      { name: 'Oscillating Multi-Tool Kit with 30 Accessories', unitPrice: 139.00, costPrice: 84.00, reorder: 10 },
      { name: 'Pneumatic 1/2-Inch Drive Air Impact Wrench 800 ft-lb', unitPrice: 189.50, costPrice: 115.00, reorder: 8 },
      { name: '12-Inch Dual-Bevel Sliding Compound Miter Saw', unitPrice: 499.00, costPrice: 330.00, reorder: 5 },
      { name: 'Heavy-Duty Rotary Hammer Drill SDS-Plus 1-Inch', unitPrice: 229.00, costPrice: 148.00, reorder: 8 },
      { name: '8-Inch Benchtop Grinder 3/4 HP with LED Worklights', unitPrice: 159.00, costPrice: 98.00, reorder: 7 },
      { name: 'Cordless 5-Inch Random Orbit Sander 20V', unitPrice: 99.00, costPrice: 58.00, reorder: 15 },
      { name: 'Deep-Cut Portable Electric Band Saw 10A', unitPrice: 319.00, costPrice: 210.00, reorder: 6 },
      { name: 'Heavy-Duty Heat Gun 1500W Dual Temperature', unitPrice: 49.99, costPrice: 28.50, reorder: 25 },
      { name: 'Electric Drywall Screwdriver 6.5A 0-4000 RPM', unitPrice: 109.00, costPrice: 65.00, reorder: 10 },
      { name: 'Compact 3-Gallon Wet/Dry Vacuum 18V', unitPrice: 119.00, costPrice: 74.00, reorder: 12 },
      { name: 'Precision Biscuit Joiner Kit with Carbide Blade', unitPrice: 179.00, costPrice: 112.00, reorder: 6 },
      { name: 'Industrial Router 2-1/4 HP Variable Speed Plunge Base', unitPrice: 249.00, costPrice: 160.00, reorder: 7 },
      { name: 'Cordless 16-Gauge Straight Finish Nailer 18V', unitPrice: 279.00, costPrice: 185.00, reorder: 8 },
      { name: 'Pneumatic Framing Nailer 21-Degree Full Round Head', unitPrice: 239.00, costPrice: 155.00, reorder: 8 },
      { name: 'Electric Metal Shear 14-Gauge Swivel Head', unitPrice: 199.00, costPrice: 128.00, reorder: 6 },
      { name: 'High-Torque 1/2-Inch Cordless Impact Wrench 18V', unitPrice: 289.00, costPrice: 190.00, reorder: 10 },
      { name: '16-Inch Variable Speed Scroll Saw with Cast Iron Base', unitPrice: 219.00, costPrice: 142.00, reorder: 5 },
    ],
  },
  // Category: Industrial Fasteners (Supplier 4: Precision Fasteners)
  {
    cat: 'Industrial Fasteners',
    supIdx: 4,
    prefix: 'FAST',
    items: [
      { name: '304 Stainless Steel Hex Bolts 1/4-20 x 1" (Box of 100)', unitPrice: 24.50, costPrice: 14.20, reorder: 30 },
      { name: 'Grade 8 Zinc-Plated Hex Cap Screws 3/8-16 x 1-1/2" (Box of 50)', unitPrice: 32.00, costPrice: 18.50, reorder: 25 },
      { name: 'Self-Drilling Tek Screws #10 x 3/4" Hex Washer (Box of 500)', unitPrice: 28.90, costPrice: 16.00, reorder: 40 },
      { name: 'Nylon-Insert Lock Nuts 1/4-20 Zinc-Plated (Pack of 100)', unitPrice: 14.50, costPrice: 7.80, reorder: 50 },
      { name: 'Drop-In Concrete Anchors 3/8-16 Zinc (Box of 50)', unitPrice: 38.00, costPrice: 22.00, reorder: 20 },
      { name: 'Split-Lock Washers 3/8" Galvanized (Pack of 200)', unitPrice: 16.20, costPrice: 8.90, reorder: 40 },
      { name: 'Alloy Steel Socket Head Cap Screws M8-1.25 x 30mm (Box of 50)', unitPrice: 22.00, costPrice: 12.50, reorder: 25 },
      { name: 'Heavy-Duty Wedge Anchors 1/2 x 4-1/4" Zinc (Box of 25)', unitPrice: 44.50, costPrice: 26.00, reorder: 18 },
      { name: 'Carriage Bolts Grade 5 Galvanized 5/16-18 x 2" (Pack of 50)', unitPrice: 19.80, costPrice: 11.20, reorder: 30 },
      { name: '304 Stainless Steel Threaded Rod 3/8-16 x 36" (Each)', unitPrice: 12.50, costPrice: 6.90, reorder: 25 },
      { name: 'All-Aluminum Blind Pop Rivets 3/16 x 1/2" (Box of 500)', unitPrice: 26.00, costPrice: 14.50, reorder: 35 },
      { name: 'Spring Steel External Retaining Rings 1-Inch (Pack of 100)', unitPrice: 18.40, costPrice: 9.80, reorder: 30 },
      { name: 'Machine Screws Pan Head Phillips 10-32 x 1/2" (Pack of 100)', unitPrice: 13.90, costPrice: 7.40, reorder: 40 },
      { name: 'Zinc-Plated Cotter Pins Assortment 1/8 x 1-1/2" (Box of 150)', unitPrice: 15.60, costPrice: 8.20, reorder: 30 },
      { name: 'Heavy Hex Jam Nuts Grade 2H 1/2-13 (Pack of 50)', unitPrice: 21.00, costPrice: 12.00, reorder: 25 },
      { name: 'Flange Lock Nuts Serrated 5/16-18 Case Hardened (Pack of 100)', unitPrice: 17.50, costPrice: 9.50, reorder: 35 },
      { name: 'Flat Washers USS Pattern 1/2" Hot-Dip Galvanized (Pack of 100)', unitPrice: 22.50, costPrice: 13.00, reorder: 30 },
      { name: 'Drywall Screws Coarse Thread Bugle Head #6 x 1-1/4" (Tub of 1000)', unitPrice: 29.99, costPrice: 16.50, reorder: 35 },
      { name: 'Hex Lag Screws 3/8 x 3" Zinc-Plated Steel (Pack of 50)', unitPrice: 25.00, costPrice: 14.00, reorder: 25 },
      { name: 'Socket Set Screws Cup Point 1/4-20 x 3/8" (Pack of 100)', unitPrice: 16.80, costPrice: 9.10, reorder: 30 },
      { name: 'Hanger Bolts Steel Plain 1/4-20 x 2" (Pack of 50)', unitPrice: 15.20, costPrice: 8.50, reorder: 25 },
      { name: 'Structural Hex Bolts A325 Heavy Hex 3/4-10 x 2-1/2" (Box of 25)', unitPrice: 58.00, costPrice: 35.00, reorder: 15 },
    ],
  },
  // Category: Safety & PPE (Supplier 2: Safeguard PPE)
  {
    cat: 'Safety & PPE',
    supIdx: 2,
    prefix: 'SAFE',
    items: [
      { name: 'ANSI Class 2 High-Visibility Safety Vest with Pockets, XL', unitPrice: 18.50, costPrice: 9.80, reorder: 40 },
      { name: 'Polycarbonate Anti-Fog Clear Safety Glasses (Box of 12)', unitPrice: 34.00, costPrice: 18.20, reorder: 30 },
      { name: 'Heavy-Duty Nitrile Coated Work Gloves (Pack of 12 Pairs)', unitPrice: 28.00, costPrice: 15.00, reorder: 45 },
      { name: 'N95 Particulate Respirator with Exhalation Valve (Box of 20)', unitPrice: 32.50, costPrice: 17.50, reorder: 35 },
      { name: 'Vented Hard Hat with 4-Point Ratchet Suspension, White', unitPrice: 22.00, costPrice: 11.50, reorder: 30 },
      { name: 'Industrial Ear Protection Earmuffs 28dB NRR Adjustable', unitPrice: 24.99, costPrice: 13.00, reorder: 25 },
      { name: 'Powder-Free Disposable Nitrile Gloves 5-Mil, L (Box of 100)', unitPrice: 16.50, costPrice: 8.50, reorder: 60 },
      { name: 'Full Body Fall Protection Safety Harness with 6ft Lanyard', unitPrice: 129.00, costPrice: 75.00, reorder: 12 },
      { name: 'Chemical Resistant PVC Gauntlet Gloves 14-Inch (Pair)', unitPrice: 14.80, costPrice: 7.90, reorder: 25 },
      { name: 'Heavy-Duty Ergonomic Gel Knee Pads for Tile & Flooring (Pair)', unitPrice: 29.90, costPrice: 16.00, reorder: 20 },
      { name: 'Emergency Gravity-Fed Eyewash Station 16-Gallon Portable', unitPrice: 219.00, costPrice: 135.00, reorder: 5 },
      { name: 'Steel-Toe Puncture-Resistant Waterproof Work Boots, Size 10.5', unitPrice: 115.00, costPrice: 68.00, reorder: 15 },
      { name: 'Cut-Resistant Level 5 Kevlar Protective Sleeves 18" (Pair)', unitPrice: 19.50, costPrice: 10.50, reorder: 25 },
      { name: 'Fire-Retardant Split Cowhide Welding Jacket, XL', unitPrice: 85.00, costPrice: 48.00, reorder: 10 },
      { name: 'Auto-Darkening Welding Helmet Variable Shade 9-13', unitPrice: 94.00, costPrice: 54.00, reorder: 12 },
      { name: 'Industrial Lockout Tagout Station with 10 Padlocks & Hasps', unitPrice: 145.00, costPrice: 85.00, reorder: 8 },
      { name: 'High-Visibility Waterproof Parka 3-in-1 ANSI Class 3, L', unitPrice: 89.00, costPrice: 52.00, reorder: 15 },
      { name: 'Disposable Polypropylene Protective Coveralls, XL (Case of 25)', unitPrice: 68.00, costPrice: 38.00, reorder: 20 },
      { name: 'Half-Face Reusable Respirator Mask with P100 Filter Pair', unitPrice: 46.00, costPrice: 25.50, reorder: 20 },
      { name: 'Arc Flash Face Shield with Hard Hat Bracket Cal/cm2 Rated', unitPrice: 110.00, costPrice: 65.00, reorder: 8 },
      { name: 'First Aid Emergency Responder Cabinet 4-Shelf Industrial', unitPrice: 165.00, costPrice: 98.00, reorder: 6 },
      { name: 'Anti-Slip Fiberglass Tread Covers 36x9" Safety Yellow (Each)', unitPrice: 38.00, costPrice: 21.00, reorder: 15 },
    ],
  },
  // Category: Packaging Materials (Supplier 3: PackMaster Logistics)
  {
    cat: 'Packaging Materials',
    supIdx: 3,
    prefix: 'PACK',
    items: [
      { name: 'Heavy-Duty Corrugated Boxes 18x14x12 (Bundle of 25)', unitPrice: 42.50, costPrice: 24.00, reorder: 35 },
      { name: 'Cast Industrial Stretch Film 18" x 1500ft 80-Gauge (Roll)', unitPrice: 21.00, costPrice: 11.80, reorder: 50 },
      { name: 'Industrial Packing Tape with Dispenser 2" x 55yd (Pack of 6)', unitPrice: 18.90, costPrice: 9.80, reorder: 45 },
      { name: 'Perforated Bubble Cushioning Wrap 12" x 175ft Roll', unitPrice: 26.50, costPrice: 14.50, reorder: 40 },
      { name: 'Polypropylene Strapping Banding Roll 1/2" x 9000ft', unitPrice: 78.00, costPrice: 44.00, reorder: 15 },
      { name: 'Kraft Void-Fill Packing Paper Roll 30" x 1200ft', unitPrice: 48.00, costPrice: 27.00, reorder: 20 },
      { name: 'Self-Sealing Bubble Mailers #5 10.5x16" (Box of 50)', unitPrice: 32.00, costPrice: 17.50, reorder: 30 },
      { name: 'Pre-Stretched Hand Film Wrap 15" x 1476ft 37-Gauge (Roll)', unitPrice: 19.50, costPrice: 10.80, reorder: 40 },
      { name: 'Heavy-Duty Steel Strapping Tensioner & Sealer Tool Set', unitPrice: 95.00, costPrice: 56.00, reorder: 8 },
      { name: 'Reclosable Clear Poly Bags 4-Mil 9x12" (Pack of 500)', unitPrice: 29.50, costPrice: 16.00, reorder: 30 },
      { name: 'Rigid Corner Edge Protectors 2x2x36" 160-Mil (Bundle of 50)', unitPrice: 36.00, costPrice: 20.00, reorder: 25 },
      { name: 'Thermal Transfer Shipping Labels 4x6" (Roll of 1000)', unitPrice: 22.00, costPrice: 11.50, reorder: 50 },
      { name: 'Moisture Barrier Desiccant Packs 5-Gram (Tub of 200)', unitPrice: 17.80, costPrice: 9.20, reorder: 35 },
      { name: 'Grip-Seal Gusseted Poly Tubing 12" x 1000ft Roll', unitPrice: 64.00, costPrice: 36.00, reorder: 15 },
      { name: 'Heavy-Duty Double-Wall Shipping Boxes 24x24x24 (Bundle of 15)', unitPrice: 65.00, costPrice: 38.00, reorder: 20 },
      { name: 'Fiber-Reinforced Gummed Paper Tape 3" x 450ft (Pack of 4)', unitPrice: 38.00, costPrice: 21.50, reorder: 25 },
      { name: 'Styrofoam Packing Peanuts Anti-Static 15 Cu Ft Bag', unitPrice: 45.00, costPrice: 24.00, reorder: 15 },
      { name: 'Corrugated Mailer Boxes White 9x6x3" (Bundle of 50)', unitPrice: 34.50, costPrice: 18.50, reorder: 30 },
      { name: 'Heavy-Duty Hand Truck / Pallet Shrink Wrap Turntable Dispenser', unitPrice: 85.00, costPrice: 50.00, reorder: 6 },
      { name: 'Custom Printed Packing List Envelopes 4.5x5.5" (Pack of 1000)', unitPrice: 27.00, costPrice: 14.00, reorder: 35 },
      { name: 'Anti-Static Pink Poly Bags 4-Mil 12x18" (Pack of 250)', unitPrice: 42.00, costPrice: 23.50, reorder: 20 },
      { name: 'Chipboard Divider Sheets 40x48" for Pallet Stacking (Bundle of 50)', unitPrice: 52.00, costPrice: 29.00, reorder: 18 },
    ],
  },
  // Category: Electronics & Sensors (Supplier 1: VoltCore Electronics)
  {
    cat: 'Electronics & Sensors',
    supIdx: 1,
    prefix: 'ELEC',
    items: [
      { name: 'Industrial Thermocouple Sensor Probe K-Type 1/4" NPT', unitPrice: 45.00, costPrice: 26.00, reorder: 25 },
      { name: 'Photoelectric Retroreflective Beam Sensor NPN 12-24V DC', unitPrice: 58.00, costPrice: 34.00, reorder: 20 },
      { name: 'Dual Display Digital Panel Voltmeter & Ammeter 100A Shunt', unitPrice: 38.50, costPrice: 21.00, reorder: 25 },
      { name: 'Proximity Sensor Inductive M18 Shielded 5mm NPN NO', unitPrice: 29.00, costPrice: 16.50, reorder: 30 },
      { name: 'Solid State Relay 40A 24-380V AC with Aluminum Heat Sink', unitPrice: 32.00, costPrice: 18.00, reorder: 25 },
      { name: 'Incremental Optical Rotary Encoder 600 P/R 5-24V DC Shaft', unitPrice: 65.00, costPrice: 38.00, reorder: 15 },
      { name: 'DIN-Rail Switching Power Supply 24V DC 10A 240W Industrial', unitPrice: 79.00, costPrice: 46.00, reorder: 18 },
      { name: 'Industrial Ultrasonic Distance Sensor 20-400cm 4-20mA Output', unitPrice: 115.00, costPrice: 68.00, reorder: 10 },
      { name: 'Split-Core Current Transducer 0-100A AC to 4-20mA Loop Powered', unitPrice: 54.00, costPrice: 31.00, reorder: 20 },
      { name: 'Programmable Multi-Function Digital Timer Relay 24V AC/DC', unitPrice: 42.00, costPrice: 24.00, reorder: 22 },
      { name: 'High-Precision 6-Inch Digital Caliper Stainless Steel with Case', unitPrice: 39.99, costPrice: 22.00, reorder: 25 },
      { name: 'Pressure Transmitter 0-100 PSI 4-20mA Output 1/4" NPT Male', unitPrice: 92.00, costPrice: 54.00, reorder: 12 },
      { name: 'Industrial Non-Contact Infrared Thermometer -50C to 850C', unitPrice: 68.00, costPrice: 39.00, reorder: 18 },
      { name: 'True-RMS AC/DC Digital Clamp Multimeter 600V with Leads', unitPrice: 85.00, costPrice: 50.00, reorder: 15 },
      { name: 'Capacitive Proximity Sensor M30 Non-Flush 15mm PNP NO', unitPrice: 36.00, costPrice: 20.50, reorder: 20 },
      { name: 'Digital Temperature Controller PID Autotuning 1/16 DIN Relay Out', unitPrice: 48.00, costPrice: 27.50, reorder: 20 },
      { name: 'Laser Distance Measure 165ft Rechargeable IP54 Rated', unitPrice: 62.00, costPrice: 36.00, reorder: 15 },
      { name: 'Hall Effect Current Sensor Module Bi-Directional 50A', unitPrice: 24.50, costPrice: 13.80, reorder: 30 },
      { name: 'Vibration Acceleration Sensor Transmitter 4-20mA 0-20mm/s', unitPrice: 145.00, costPrice: 88.00, reorder: 8 },
      { name: 'Safety Light Curtain Transmitter & Receiver Set 300mm Protected', unitPrice: 389.00, costPrice: 245.00, reorder: 4 },
      { name: 'Thermistor NTC Temperature Probe 10k Waterproof 3-Meter Cable', unitPrice: 16.50, costPrice: 8.80, reorder: 35 },
      { name: 'Industrial Humidity & Temperature Transmitter RS485 Modbus', unitPrice: 78.00, costPrice: 44.00, reorder: 14 },
    ],
  },
];

// ----------------------------------------------------------------------------
// 4. Exactly 25 Real Commercial Corporate Clients
// ----------------------------------------------------------------------------
const CLIENTS = [
  'Summit Ridge Construction Group',
  'BlueStar Precision Manufacturing Corp',
  'Apex Fleet & Heavy Equipment Repair',
  'Pioneer Mechanical Contracting Services',
  'Kodiak Industrial Fabricators LLC',
  'Metro Transit Engineering & Maintenance',
  'Cascade Commercial Builders Inc',
  'Horizon Facilities Management Corp',
  'Beacon Energy & Solar Systems',
  'Titan Civil Infrastructure Partners',
  'Silverline Interior Fitters & Contractors',
  'Omega Precision Tool & Die Inc',
  'Granite State Logistics & Warehousing',
  'Tri-State Electrical Contractors Inc',
  'Ironwood Millwork & Commercial Fixtures',
  'NorthStar Facility Maintenance Group',
  'Liberty Industrial Packaging & Crating',
  'Valley Regional Hospital Operations',
  'Redwood Packaging & Distribution Solutions',
  'Keystone Aggregate & Masonry Supplies',
  'Vanguard Aerospace Subcontractors',
  'Highland Automated Systems Group',
  'Pacific Coast Marine Engineering LLC',
  'Centennial HVAC & Refrigeration Service',
  'Frontier Structural Steel Erectors',
];

async function seedCanonical() {
  console.log(`\n============================================================`);
  console.log(`CANONICAL SEEDER STARTING: [${DB_CONFIG.database}] @ ${DB_CONFIG.host}:${DB_CONFIG.port}`);
  console.log(`============================================================\n`);

  const conn = await mysql.createConnection(DB_CONFIG);

  try {
    // ------------------------------------------------------------------------
    // Step 1: Baseline User Provisioning (@mygodown.com)
    // ------------------------------------------------------------------------
    console.log('[Step 1/8] Verifying baseline user accounts (@mygodown.com)...');
    const adminHash = await bcrypt.hash('AdminPassword123!', 10);
    const managerHash = await bcrypt.hash('ManagerPassword123!', 10);
    const staffHash = await bcrypt.hash('StaffPassword123!', 10);

    const userSeedSql = `
      INSERT INTO users (id, name, email, password_hash, role, is_active) VALUES
      (1, 'System Administrator', 'admin@mygodown.com', ?, 'admin', 1),
      (2, 'Warehouse Manager', 'manager@mygodown.com', ?, 'manager', 1),
      (3, 'Inventory Staff', 'staff@mygodown.com', ?, 'staff', 1)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        password_hash = VALUES(password_hash),
        role = VALUES(role),
        is_active = 1;
    `;
    await conn.query(userSeedSql, [adminHash, managerHash, staffHash]);

    // ------------------------------------------------------------------------
    // Step 2: Exactly 8 Real Suppliers
    // ------------------------------------------------------------------------
    console.log('[Step 2/8] Seeding exactly 8 industrial suppliers...');
    for (let i = 0; i < SUPPLIERS.length; i++) {
      const s = SUPPLIERS[i];
      await conn.query(
        `INSERT INTO suppliers (id, name, contact_name, email, phone, address, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           contact_name = VALUES(contact_name),
           phone = VALUES(phone),
           address = VALUES(address),
           is_active = 1;`,
        [i + 1, s.name, s.contactName, s.email, s.phone, s.address]
      );
    }
    // Clean any placeholder suppliers above 8 that don't have FK blocks
    try {
      await conn.query(`UPDATE products SET supplier_id = ((supplier_id % 8) + 1) WHERE supplier_id > 8;`);
      await conn.query(`UPDATE purchase_orders SET supplier_id = ((supplier_id % 8) + 1) WHERE supplier_id > 8;`);
      await conn.query(`DELETE FROM suppliers WHERE id > 8;`);
    } catch (e) {
      console.log('Note on supplier pruning:', e.message);
    }

    // ------------------------------------------------------------------------
    // Step 3: Exactly 5 Regional Warehouses
    // ------------------------------------------------------------------------
    console.log('[Step 3/8] Seeding exactly 5 regional warehouses...');
    for (let i = 0; i < WAREHOUSES.length; i++) {
      const w = WAREHOUSES[i];
      await conn.query(
        `INSERT INTO warehouses (id, name, code, address, city, is_active)
         VALUES (?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           code = VALUES(code),
           address = VALUES(address),
           city = VALUES(city),
           is_active = 1;`,
        [i + 1, w.name, w.code, w.address, w.city]
      );
    }
    // Re-route any historical orders/stock away from warehouses > 5
    try {
      await conn.query(`UPDATE stock_levels SET warehouse_id = ((warehouse_id % 5) + 1) WHERE warehouse_id > 5;`);
      await conn.query(`UPDATE purchase_orders SET warehouse_id = ((warehouse_id % 5) + 1) WHERE warehouse_id > 5;`);
      await conn.query(`UPDATE sales_orders SET warehouse_id = ((warehouse_id % 5) + 1) WHERE warehouse_id > 5;`);
      await conn.query(`UPDATE stock_movements SET warehouse_id = ((warehouse_id % 5) + 1) WHERE warehouse_id > 5;`);
      await conn.query(`DELETE FROM warehouses WHERE id > 5;`);
    } catch (e) {
      console.log('Note on warehouse pruning:', e.message);
    }

    // ------------------------------------------------------------------------
    // Step 4: 110+ Real Catalog Products
    // ------------------------------------------------------------------------
    console.log('[Step 4/8] Seeding 110+ realistic catalog products...');
    let skuCounter = 1;
    const insertedProductIds = [];

    for (const group of PRODUCT_TEMPLATES) {
      for (const item of group.items) {
        const sku = `${group.prefix}-${String(skuCounter).padStart(4, '0')}`;
        const supplierId = group.supIdx + 1; // 1 to 8
        const desc = `${item.name}. Certified commercial quality for industrial inventory operations.`;

        await conn.query(
          `INSERT INTO products (sku, name, description, category, unit_price, cost_price, reorder_level, supplier_id, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE
             name = VALUES(name),
             description = VALUES(description),
             category = VALUES(category),
             unit_price = VALUES(unit_price),
             cost_price = VALUES(cost_price),
             reorder_level = VALUES(reorder_level),
             supplier_id = VALUES(supplier_id),
             is_active = 1;`,
          [sku, item.name, desc, group.cat, item.unitPrice, item.costPrice, item.reorder, supplierId]
        );

        const [pRow] = await conn.query('SELECT id, unit_price, cost_price, reorder_level FROM products WHERE sku = ?;', [sku]);
        if (pRow[0]) {
          insertedProductIds.push(pRow[0]);
        }
        skuCounter++;
      }
    }

    // Clean any old placeholder products like 'Enterprise Product %'
    try {
      await conn.query(`DELETE FROM stock_levels WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'Enterprise Product %');`);
      await conn.query(`DELETE FROM purchase_order_items WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'Enterprise Product %');`);
      await conn.query(`DELETE FROM sales_order_items WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'Enterprise Product %');`);
      await conn.query(`DELETE FROM stock_movements WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'Enterprise Product %');`);
      await conn.query(`DELETE FROM products WHERE name LIKE 'Enterprise Product %';`);
    } catch (_) {}

    const [allProducts] = await conn.query('SELECT id, name, unit_price, cost_price, reorder_level FROM products WHERE is_active = 1;');
    console.log(`  -> Total active products seeded: ${allProducts.length}`);

    // ------------------------------------------------------------------------
    // Step 5: Stock Levels (220+ rows distributed across 5 warehouses)
    // ------------------------------------------------------------------------
    console.log('[Step 5/8] Seeding stock levels across 5 warehouses...');
    for (let i = 0; i < allProducts.length; i++) {
      const prod = allProducts[i];
      // Distribute each product into 2 distinct warehouses (wh 1..5)
      const wh1 = (i % 5) + 1;
      const wh2 = ((i + 2) % 5) + 1;

      // Normal healthy quantity (40 to 180 units)
      const normalQty = 40 + ((i * 7) % 140);
      await conn.query(
        `INSERT INTO stock_levels (product_id, warehouse_id, quantity)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = VALUES(quantity);`,
        [prod.id, wh1, normalQty]
      );

      // 10 products intentionally trigger low-stock alerts for live testing
      const isLowStock = i % 11 === 0;
      const secondQty = isLowStock ? Math.max(1, prod.reorder_level - 4) : 35 + ((i * 3) % 85);
      await conn.query(
        `INSERT INTO stock_levels (product_id, warehouse_id, quantity)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = VALUES(quantity);`,
        [prod.id, wh2, secondQty]
      );
    }

    // ------------------------------------------------------------------------
    // Step 6: 115 Realistic Purchase Orders & 230+ Line Items
    // ------------------------------------------------------------------------
    console.log('[Step 6/8] Seeding 115 purchase orders & line items...');
    const poStatuses = ['ordered', 'received', 'draft', 'ordered', 'received'];

    for (let i = 1; i <= 115; i++) {
      const poNumber = `PO-2026-${String(i).padStart(4, '0')}`;
      const supplierId = (i % 8) + 1; // 1 to 8
      const warehouseId = (i % 5) + 1; // 1 to 5
      const status = poStatuses[i % poStatuses.length];
      const notes = `Scheduled quarterly procurement replenishment for facility WH-0${warehouseId}`;

      const prod1 = allProducts[(i * 3) % allProducts.length];
      const prod2 = allProducts[(i * 3 + 1) % allProducts.length];
      const qty1 = 15 + (i % 35);
      const qty2 = 10 + (i % 25);
      const totalAmount = parseFloat((qty1 * prod1.cost_price + qty2 * prod2.cost_price).toFixed(2));

      await conn.query(
        `INSERT INTO purchase_orders (po_number, supplier_id, warehouse_id, status, total_amount, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           supplier_id = VALUES(supplier_id),
           warehouse_id = VALUES(warehouse_id),
           status = VALUES(status),
           total_amount = VALUES(total_amount);`,
        [poNumber, supplierId, warehouseId, status, totalAmount, notes]
      );

      const [poRow] = await conn.query('SELECT id FROM purchase_orders WHERE po_number = ?;', [poNumber]);
      const poId = poRow[0].id;

      await conn.query(
        `INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_cost)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit_cost = VALUES(unit_cost);`,
        [poId, prod1.id, qty1, prod1.cost_price]
      );

      await conn.query(
        `INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_cost)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit_cost = VALUES(unit_cost);`,
        [poId, prod2.id, qty2, prod2.cost_price]
      );
    }

    // ------------------------------------------------------------------------
    // Step 7: 115 Realistic Sales Orders & 230+ Line Items (Real Corporate Clients)
    // ------------------------------------------------------------------------
    console.log('[Step 7/8] Seeding 115 sales orders across 25 real corporate clients...');
    const soStatuses = ['confirmed', 'fulfilled', 'draft', 'confirmed', 'fulfilled'];

    for (let i = 1; i <= 115; i++) {
      const soNumber = `SO-2026-${String(i).padStart(4, '0')}`;
      const customerName = CLIENTS[i % CLIENTS.length];
      const warehouseId = (i % 5) + 1; // 1 to 5
      const status = soStatuses[i % soStatuses.length];
      const notes = `Commercial purchase agreement terms Net 30 - Shipment Priority B`;

      const prod1 = allProducts[(i * 4) % allProducts.length];
      const prod2 = allProducts[(i * 4 + 1) % allProducts.length];
      const qty1 = 4 + (i % 12);
      const qty2 = 6 + (i % 16);
      const totalAmount = parseFloat((qty1 * prod1.unit_price + qty2 * prod2.unit_price).toFixed(2));

      await conn.query(
        `INSERT INTO sales_orders (so_number, customer_name, warehouse_id, status, total_amount, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           customer_name = VALUES(customer_name),
           warehouse_id = VALUES(warehouse_id),
           status = VALUES(status),
           total_amount = VALUES(total_amount);`,
        [soNumber, customerName, warehouseId, status, totalAmount, notes]
      );

      const [soRow] = await conn.query('SELECT id FROM sales_orders WHERE so_number = ?;', [soNumber]);
      const soId = soRow[0].id;

      await conn.query(
        `INSERT INTO sales_order_items (sales_order_id, product_id, quantity, unit_price)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit_price = VALUES(unit_price);`,
        [soId, prod1.id, qty1, prod1.unit_price]
      );

      await conn.query(
        `INSERT INTO sales_order_items (sales_order_id, product_id, quantity, unit_price)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit_price = VALUES(unit_price);`,
        [soId, prod2.id, qty2, prod2.unit_price]
      );
    }

    // ------------------------------------------------------------------------
    // Step 8: 260 Stock Movements (Audit Ledger)
    // ------------------------------------------------------------------------
    console.log('[Step 8/8] Seeding 260 stock movement audit ledger rows...');
    const [smCount] = await conn.query('SELECT COUNT(*) AS count FROM stock_movements;');
    const currentSmCount = parseInt(smCount[0].count, 10);

    if (currentSmCount < 260) {
      const needed = 260 - currentSmCount;
      const mTypes = ['in', 'out', 'adjustment'];
      const rTypes = ['manual', 'purchase_order', 'sales_order', 'transfer'];

      for (let i = 1; i <= needed; i++) {
        const prod = allProducts[i % allProducts.length];
        const wh = (i % 5) + 1;
        const mType = mTypes[i % mTypes.length];
        const rType = rTypes[i % rTypes.length];
        const qty = 5 + (i % 25);
        const ref = `Inventory Cycle Reconciliation Event #${currentSmCount + i}`;

        await conn.query(
          `INSERT INTO stock_movements (product_id, warehouse_id, user_id, movement_type, reference_type, reference_id, quantity, reference)
           VALUES (?, ?, 1, ?, ?, ?, ?, ?);`,
          [prod.id, wh, mType, rType, i <= 100 ? i : null, qty, ref]
        );
      }
    }

    // ------------------------------------------------------------------------
    // Canonical Row Count Audit Report
    // ------------------------------------------------------------------------
    console.log('\n============================================================');
    console.log(`CANONICAL ROW COUNTS AUDIT: [${DB_CONFIG.database}] @ ${DB_CONFIG.host}`);
    console.log('============================================================');

    const [tables] = await conn.query('SHOW TABLES;');
    const counts = {};

    for (const t of tables) {
      const tableName = Object.values(t)[0];
      const [rows] = await conn.query(`SELECT COUNT(*) AS count FROM \`${tableName}\`;`);
      counts[tableName] = parseInt(rows[0].count, 10);
      console.log(`  - ${tableName.padEnd(25)}: ${counts[tableName]} rows`);
    }

    console.log('============================================================\n');
    return counts;
  } finally {
    await conn.end();
  }
}

seedCanonical()
  .then(() => {
    console.log('[Canonical Seeder] Success: Database fully synchronized.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Canonical Seeder Fatal Error]:', err);
    process.exit(1);
  });

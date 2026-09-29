<!--
  File: docs/viva/phase-1-database.md
  Purpose: Viva preparation guide and walkthrough for Phase 1 (Database Architecture & Setup).
  Explains DDL schema design, idempotent seed strategy, end-to-end transaction tracing, and mentor Q&A.
-->

# Phase 1 — Database Architecture & Setup Viva Guide

## 1. File-by-File Walkthrough

| File | What it does | Why it exists |
|---|---|---|
| `database/schema.sql` | DDL script defining the 6 core tables in `inventory_db` with InnoDB engine and UTF8MB4 charset. | Implements system scope, relational foreign keys, soft delete flags (`is_active`), named non-negative `CHECK` constraints, and performance indexes. |
| `database/seed.sql` | Idempotent DML script inserting 3 warehouses, 5 suppliers, 20 products, and initial stock levels. | Populates baseline inventory with dynamic subquery FK resolution and low-stock test scenarios without hardcoded IDs. |
| `backend/scripts/seedUsers.js` | Automated user provisioning script using `bcryptjs`. | Seeds `admin`, `manager`, and `staff` accounts reading passwords from env vars with zero plaintext logging. |
| `docs/er-diagram.mmd` | Mermaid entity-relationship diagram. | Documents entity relationships, cardinalities, PK/FK/UK constraints, and column attributes. |

---

## 2. End-to-End Database Transaction Trace: Stock Movement & Adjustment

Every inventory modification must satisfy Business Rule **BR-06** (simultaneous update of stock level and immutable movement ledger inside an ACID transaction):

```
1. Client issues stock adjustment (e.g., +10 units of TOOL-DRL-001 in Central Hub)
   │
   ▼
2. API Service opens InnoDB transaction:
   `START TRANSACTION;`
   │
   ▼
3. Acquire pessimistic row lock on product inventory record:
   `SELECT quantity FROM stock_levels WHERE product_id = 1 AND warehouse_id = 1 FOR UPDATE;`
   │
   ├── Current quantity: 45
   ├── Adjustment change: +10
   └── Projected quantity: 55 (validated >= 0)
   │
   ▼
4. Update live stock level:
   `UPDATE stock_levels SET quantity = 55 WHERE product_id = 1 AND warehouse_id = 1;`
   │
   ▼
5. Insert audit ledger entry into immutable stock_movements table:
   `INSERT INTO stock_movements (product_id, warehouse_id, type, quantity_change, reference_type, reason, user_id)`
   `VALUES (1, 1, 'ADJUSTMENT', 10, 'MANUAL_ADJUSTMENT', 'Found extra units during cycle count', 2);`
   │
   ▼
6. Commit transaction:
   `COMMIT;`
   (If any step fails or network disconnects, `ROLLBACK;` automatically fires, ensuring zero corrupt states)
```

---

## 3. Likely Mentor Questions & Model Answers

### Question 1: Why did you choose `DECIMAL(10, 2)` instead of `FLOAT` or `DOUBLE` for monetary values?
**Answer:** `FLOAT` and `DOUBLE` use IEEE 754 binary floating-point representation, which introduces rounding errors in decimal arithmetic (for example, `0.1 + 0.2 = 0.30000000000000004`). In financial and inventory calculations, even fractional cent discrepancies lead to reconciliation failures. `DECIMAL(10, 2)` is an exact numeric type stored as packed binary integers, guaranteeing exact two-decimal precision.

### Question 2: What is the purpose of `CHECK (quantity >= 0)` on `stock_levels` in MySQL?
**Answer:** While application-level validation checks stock availability prior to deduction, concurrent requests or software bugs could attempt an over-deduction. The database-level `CHECK (quantity >= 0)` constraint serves as an absolute safeguard: the MySQL storage engine will reject any `UPDATE` or `INSERT` that violates the constraint with error `3819 (HY000): Check constraint 'chk_stock_quantity' is violated`, preventing negative inventory.

### Question 3: Why is `multipleStatements: true` used only in `database/init.js` and strictly forbidden in the application API connection pool?
**Answer:** `multipleStatements: true` permits executing multiple SQL commands delimited by semicolons in a single database round-trip. This is convenient for bootstrapping schemas from `.sql` files. However, enabling it in an API server connection pool creates severe SQL injection risks; an attacker injecting `'; DROP TABLE users; --` could execute stacked queries. Therefore, our API connection pool keeps `multipleStatements: false` and uses parameterized statements exclusively.

### Question 4: Why does `stock_levels` enforce a composite `UNIQUE (product_id, warehouse_id)` constraint?
**Answer:** A single product in a specific warehouse must have exactly one authoritative stock record. Without this constraint, race conditions during initial receipt could insert duplicate rows for the same product-warehouse pair. The unique constraint guarantees single-row lookup efficiency and enables deterministic row locking (`FOR UPDATE`).

### Question 5: Why do `po_items` and `order_items` use `ON DELETE CASCADE` pointing to their parent orders, while `product_id` uses `ON UPDATE CASCADE` without cascade delete?
**Answer:** Line items (`po_items`, `order_items`) are weak entities that have no independent lifecycle outside their parent order header (`purchase_orders`, `sales_orders`). Conversely, products are primary master data entities. If a product could be deleted with cascade, it would inadvertently erase all historical financial line items and receipts. Instead, products use soft deletion (`is_active = 0`), preserving all historical transaction line items intact.

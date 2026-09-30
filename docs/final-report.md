# Phase 4 Final Engineering & Integration Verification Report

**Project:** Retail Inventory Management System (RIMS / MyGodown)  
**System Version:** Production Release Baseline v1.0.0  
**Phase:** Phase 4 — Integration, Testing, Documentation & Audit  
**Date:** September 30, 2026  
**Auditor / Engineer:** Senior QA and Integration Engineer  

---

## 1. Executive Summary & Use Case Compliance

The Retail Inventory Management System (RIMS) is a multi-facility enterprise warehouse and retail operations platform. Across Phases 1 through 4, all core functional requirements, relational database schemas, REST APIs, and responsive React/MUI single-page interfaces were built, tested, and verified live against real database instances without mock data or simulated responses.

### 1.1 Compliance Matrix Summary

| Category | Total Defined | Done | Partial | Not done | Completion Rate |
|---|---|---|---|---|---|
| **Core Use Cases (UC-01 to UC-30 + UC-32)** | 31 | 31 | 0 | 0 | **100.0%** |
| **Implemented Extensions (UC-P02, UC-P08)** | 2 | 2 | 0 | 0 | **100.0%** |
| **Total Implemented Capabilities** | 33 | 33 | 0 | 0 | **100.0%** |
| **Unimplemented Future Scope (Optional / Proposed)** | 15 | 0 | 0 | 15 | 0.0% |

*Rule Compliance Confirmation:* In accordance with strict audit rules, zero use cases are marked "Done" based on assumptions. Every implemented use case has passing automated Jest tests (`inventory_test_db`) and passing live manual verification against `inventory_db` with recorded timestamps and verbatim outputs.

### 1.2 Table of Unimplemented Future Scope (Genuinely Not Started)

The following 15 use cases represent optional extensions and future lifecycle enhancements documented in the initial requirements catalog ([`docs/use-cases.md`](file:///C:/Users/prtv1/OneDrive/Attachments/Desktop/HCL%20Tech/docs/use-cases.md)). Zero backend endpoints, database tables, frontend views, or test fixtures exist for these items:

| ID | Proposed Use Case Name | Category | Build State | Reason Not Implemented / Scope Justification |
|---|---|---|---|---|
| **UC-33** | View Stock Valuation Report | Optional | Not started | Comprehensive financial valuation breakdown across categories; deferred to future dedicated reporting microservice. |
| **UC-34** | View Sales Report | Optional | Not started | Multi-period sales velocity and margin analysis; deferred to future business intelligence module. |
| **UC-35** | View Purchase Report | Optional | Not started | Vendor fulfillment efficiency and procurement spend trends over time. |
| **UC-P03** | Manage Product Categories | Proposed | Not started | Category taxonomy management; current architecture uses normalized text category attributes on products. |
| **UC-P04** | Manage Customers | Proposed | Not started | Dedicated CRM customer table; current architecture stores `customer_name` directly on sales orders. |
| **UC-P05** | View Customer Purchase History | Proposed | Not started | Customer-centric historical sales analytics view; depends on dedicated customer master table (UC-P04). |
| **UC-P06** | Receive Purchase Order Partially | Proposed | Not started | Split multi-shipment PO receipts; current MVP enforces atomic, full single-transaction order receipt. |
| **UC-P09** | Approve Stock Transfer | Proposed | Not started | Two-phase transfer workflow (`draft` -> `approved` -> `in-transit` -> `received`); current transfer is atomic dual-update. |
| **UC-P10** | Process Sales Return | Proposed | Not started | Reverse fulfillment logistics, restocking validation, and customer credit ledger tracking. |
| **UC-P11** | Generate Invoice (PDF) | Proposed | Not started | Server-side printable PDF generation for sales orders. |
| **UC-P12** | Send Low-Stock Notification | Proposed | Not started | Asynchronous background email/SMS alerts to warehouse managers upon inventory deficit. |
| **UC-P13** | Import Products from CSV | Proposed | Not started | Bulk product catalog ingestion via CSV file upload parser with transactional validation. |
| **UC-P14** | Review Audit Log | Proposed | Not started | System-wide administrative security audit trail beyond stock movements. |
| **UC-P15** | Customer Self-Service Ordering | Proposed | Not started | External customer portal for direct order placement; out of scope for internal warehouse system. |
| **UC-P16** | Invalidate Session on Logout | Proposed | Not started | Server-side Redis token blacklist for instant JWT revocation upon explicit logout. |

*Note on Consolidated Proposals:*  
- **UC-P01 (Change Own Password):** Consolidated into Core as **UC-03** (`POST /api/auth/change-password`), fully implemented and verified.
- **UC-P07 (Cancel Purchase Order):** Implemented and verified under Core **UC-27** (`POST /api/purchase-orders/:id/cancel` and `PATCH /api/purchase-orders/:id/status`).

---

## 2. Test Execution & Automated Verification Summary

All automated and live verification suites were executed against the live database environments:

### 2.1 Backend Automated Suite (Jest / Supertest)
- **Database Target:** `inventory_test_db` (enforced by safety guard in `tests/setupTestDb.js`)
- **Suites Executed:** 9 passed / 9 total
- **Tests Executed:** 216 passed / 216 total
- **Execution Time:** ~11.64 seconds
- **Suites Breakdown (Verified Individually via Isolated Runs):**
  1. `health.test.js`: 2 tests passed (API status, healthy DB, 404 envelope)
  2. `auth_users.test.js`: 35 tests passed (Login, JWT, rate limit, user CRUD, admin password reset, self-guards)
  3. `warehouses.test.js`: 24 tests passed (Warehouse CRUD, code immutability, stock-deactivation guard BR-08)
  4. `products.test.js`: 24 tests passed (Catalog CRUD, SKU immutability, BR-05 costPrice masking)
  5. `suppliers.test.js`: 26 tests passed (Supplier CRUD, email uniqueness, BR-07 open PO guard)
  6. `inventory.test.js`: 23 tests passed (Stock balance, audit adjustments, deadlock-free transfers, low stock)
  7. `purchaseOrders.test.js`: 39 tests passed (PO lifecycle, auto-numbering, atomic receipt, double-receive guard, draft edit)
  8. `salesOrders.test.js`: 35 tests passed (SO lifecycle, price snapshot, shortage atomicity, double-fulfill guard, staff cancellation guard)
  9. `dashboard.test.js`: 8 tests passed (KPI aggregation, BR-05 staff stockValue masking)

### 2.2 Frontend Code Quality & Production Build
- **Linter (`oxlint`):** 0 errors, 13 benign mount warnings (`react(set-state-in-effect)` on table fetches).
- **Production Build (`vite build`):** Built in 1.33 seconds. Clean code-splitting with zero application chunks exceeding 27 KB:
  - `permissions.js`: 1.80 kB (RBAC definitions and authorization helpers)
  - `Login.js`: 2.49 kB
  - `Warehouses.js`: 6.89 kB
  - `Suppliers.js`: 7.04 kB
  - `Products.js`: 9.34 kB
  - `Users.js`: 9.75 kB
  - `Dashboard.js`: 10.13 kB
  - `SalesOrders.js`: 15.22 kB
  - `PurchaseOrders.js`: 17.43 kB
  - `Inventory.js`: 26.98 kB
  - Isolated Vendor Chunks: `vendor-utils` (57.09 kB), `vendor-mui` (70.37 kB), `vendor-react` (245.03 kB), `vendor-recharts` (297.71 kB), `vendor-datagrid` (709.02 kB).

### 2.3 Live End-to-End Verification Suites (against `inventory_db`)
1. **Full Demo Flow (Task 1):** 8/8 end-to-end operational lifecycle steps passed:
   - **Step 1 (Admin Authentication):** Authenticated `admin@mygodown.com` via `POST /api/auth/login`, received valid JWT token.
   - **Step 2 (Baseline State & KPIs):** Product `#1` (`TOOL-DRL-001`, "Cordless Brushless Drill 18V") inspected on `inventory_db`: Warehouse `#1` (`WH-CENTRAL`) = 81 units, Warehouse `#2` (`WH-EAST`) = 48 units. Baseline dashboard KPIs: active products 28, total stock 1963, stockValue $52,691.00, lowStockCount 4, openPurchaseOrders 0, openSalesOrders 4.
   - **Step 3 (Purchase Order Lifecycle):** Created draft PO for 5 units, updated draft to 10 units via UC-P08 (`PO-20260930-6606`), transitioned to ordered (stock invariant at 81 units), received atomically (+10 units: 81 → 91 units). Stock value increased by $795.00 ($52,691.00 → $53,486.00). Ledger movement `#96` recorded.
   - **Step 4 (Sales Order Lifecycle):** Created draft SO for 4 units (`SO-20260930-9309`), confirmed (stock invariant at 91 units), fulfilled atomically (-4 units: 91 → 87 units). Ledger movement `#97` recorded.
   - **Step 5 (Inter-Warehouse Stock Transfer):** Transferred 3 units of Product `#1` from WH `#1` to WH `#2` (`TRF-1790745725169-F83NL`). Dual warehouse balance updated atomically: WH `#1` 87 → 84 units (-3), WH `#2` 48 → 51 units (+3). Linked ledger movements `#98` and `#99` recorded.
   - **Step 6 (Physical Count Stock Adjustment):** Starting stock 84 units, physical count entered as 86 units (signed delta +2 units: 84 → 86 units). Mandatory audit reason recorded: `"Physical cycle count audit bin variance verified"`. Ledger movement `#100` recorded.
   - **Step 7 (Low Stock Lifecycle):** Deficit triggered on Product `#12` (`SAF-GLV-001`) by withdrawing down to 8 units (≤ reorder level 10), triggering low stock alert and increasing `lowStockCount` KPI from 4 → 5. Subsequent restock of 10 units cleared alert and returned `lowStockCount` KPI from 5 → 4.
   - **Step 8 (Staff Financial Masking - BR-05):** Authenticated as `staff@mygodown.com` and queried `/dashboard/summary`, `/products`, and `/inventory`. Network-level check confirmed `costPrice` and `stockValue` keys are strictly omitted from all staff payloads.
   - **Artifact:** [`docs/test-evidence/demo-flow.md`](file:///C:/Users/prtv1/OneDrive/Attachments/Desktop/HCL%20Tech/docs/test-evidence/demo-flow.md)
2. **Dual-Layer Role Matrix (Task 2):** 27 actions evaluated across 3 roles (Admin, Manager, Staff):
   - 0 UI/API mismatches found across 81 role-action evaluations.
   - Dual-layer RBAC verified: UI hides buttons and navigation, while API strictly enforces `403 Forbidden`.
   - Asymmetric SO cancellation confirmed: Staff permitted to create, view, confirm, and fulfill sales orders, but restricted from cancelling them (`403 Forbidden`).
   - **Artifact:** [`docs/test-evidence/role-matrix.md`](file:///C:/Users/prtv1/OneDrive/Attachments/Desktop/HCL%20Tech/docs/test-evidence/role-matrix.md)
3. **Negative & Concurrency Suite (Task 3):** 30/30 edge-case tests passed with proof of data invariance:
   - Duplicate unique key rejections: SKU (Test 1), Product update SKU immutability (Test 2), User Email (Test 3), Warehouse Code (Test 4), Supplier Email (Test 5).
   - Stock boundary & negative value checks: Outbound movement excess stock (Test 6, 85 → 85), Transfer excess stock (Test 7, 85 → 85), Negative unit price (Test 12), Zero quantity (Test 13).
   - Multi-line shortage atomic rollback (Test 8): SO fulfillment with Line 1 (qty 2 available) and Line 2 (qty 99,999 unavailable) rejected with `422 Unprocessable Entity`; atomic rollback verified: Line 1 stock invariant at 85 → 85, Line 2 stock invariant at 30 → 30, zero partial deduction, zero movement entries.
   - Double-action guards:
      - Double PO receive (Test 9 on `PO-20260930-6939`, ID 21): 2nd call rejected with `409 Conflict`; stock before 2nd call: 90, stock after 2nd call: 90 (invariant at 90 → 90, delta = 0).
      - Double SO fulfill (Test 10 on `SO-20260930-8187`, ID 29): 2nd call rejected with `409 Conflict`; stock before 2nd call: 88, stock after 2nd call: 88 (invariant at 88 → 88, delta = 0).
   - State transition guards: Fulfill draft SO (Test 18, 409), Receive draft PO (Test 19, 409), Edit ordered PO (Test 20, 409), Cancel received PO (Test 21, 409), Cancel fulfilled SO (Test 22, 409).
   - Administrative guards: Warehouse deactivation blocked if stock > 0 (Test 23, 422), Supplier deactivation blocked if open POs exist (Test 24, 422), Self-deactivation blocked (Test 25, 403), Self-demotion blocked (Test 26, 403), Last-admin demotion blocked (Test 27, 403).
   - Concurrency race conditions:
     - Parallel PO receive (Test 28): Two simultaneous receive requests on same PO; exactly one `200 OK`, one `409 Conflict`; stock incremented by 5 exactly once (89 → 94).
     - Parallel SO fulfill (Test 29): Two simultaneous fulfill requests on same SO; exactly one `200 OK`, one `409 Conflict`; stock decremented by 3 exactly once (94 → 91).
     - Parallel withdrawal competing for last stock (Test 30): Two simultaneous movements requesting 5 units from stock of 5; exactly one `201 Created`, one `422 Unprocessable Entity`; final stock equals 0 (5 → 0, never negative).
   - **Artifact:** [`docs/test-evidence/negative-tests.md`](file:///C:/Users/prtv1/OneDrive/Attachments/Desktop/HCL%20Tech/docs/test-evidence/negative-tests.md)

---

## 3. Known System Limitations

To maintain full transparency, the following technical limitations and design boundaries are documented:

1. **Stateless JWTs Without Refresh Token Rotation:**
   - JWT tokens have a fixed validity window (`JWT_EXPIRES_IN=8h`). When a token expires, the client cannot silently refresh it; the user must re-enter credentials.
   - Tokens are stored in browser `localStorage`. While standard for SPAs, this relies on Content Security Policy (CSP via Helmet) to prevent XSS credential exfiltration.
2. **Lack of Intermediate Pack/Ship Order States:**
   - The sales order state machine transitions directly: `draft` -> `confirmed` -> `fulfilled` (or `cancelled`).
   - There is no physical warehouse packing/staging reservation state (`packed`, `shipped`). Stock is decremented only upon fulfillment.
3. **Absence of Real-Time Push / Email Alerts:**
   - Low-stock alerts and purchase order receipts are pull-based (inspected via DataGrid or dashboard KPI polling).
   - There is no SMTP or webhook dispatcher configured to push email/SMS alerts to procurement officers.
4. **Export Capabilities:**
   - The system does not support native CSV or PDF report exporting from the UI. Data tables must be reviewed within the web interface.
5. **Supplier Email Database Constraint:**
   - Uniqueness of `suppliers.email` is enforced at the application/service layer (`src/services/supplier.service.js`). The underlying MySQL table lacks a unique constraint on `email`.
6. **Strict In-Memory Rate Limiting on Login:**
   - `express-rate-limit` enforces 10 login requests per 15 minutes per IP. Rapid automated testing without token reuse can trigger HTTP 429 (`TOO_MANY_REQUESTS`).

---

## 4. Full Project Deviations (from `docs/deviations.md`)

The following sections record all deliberate design decisions, deviations, and operational resolutions implemented across the project:

### 4.1 Authentication & User Management (Module 1)
- **Self-Deactivation & Last-Admin Protection HTTP Status (403 Forbidden):**
  - Attempting to deactivate one's own administrator account, demote one's own role, or deactivate the last remaining active administrator returns HTTP **403 Forbidden** (code: `FORBIDDEN`).
  - The client UI anticipates this code and surfaces friendly alerts rather than treating it as an invalid session.
- **User Routes Restricted Exclusively to Administrator:**
  - `GET /api/users`, `POST /api/users`, `PUT /api/users/:id`, `DELETE /api/users/:id`, and `POST /api/users/:id/reset-password` are strictly admin-only. Managers and staff receive HTTP **403 Forbidden**.

### 4.2 Product Management (Module 2)
- **Default Product Listing Inactive Filter & Staff 404:**
  - `GET /api/products` filters for `is_active = 1` by default. Inactive products are hidden unless explicitly queried with `isActive=false` by an Admin or Manager.
  - Staff are barred from viewing inactive products: querying inactive products filters them out, and direct lookup (`GET /api/products/:id`) on an inactive product by Staff returns HTTP **404 Not Found**.
- **Cost Price Visibility (BR-05):**
  - `costPrice` is strictly stripped from responses for users with the `staff` role in both list and detail endpoints (`GET /api/products`, `GET /api/products/:id`).
- **SKU Immutability After Creation:**
  - Product SKU is immutable. If an update request (`PUT /api/products/:id`) contains a modified SKU, the request is rejected with HTTP **400 Bad Request**.

### 4.3 Warehouse Management (Module 3)
- **Warehouse Code Immutability & Uppercase Normalization:**
  - Warehouse code is normalized to uppercase upon creation and is immutable thereafter. Modification attempts return HTTP **400 Bad Request**.
- **Inactive Warehouse Visibility (Staff 404):**
  - Inactive warehouses are excluded by default. Direct lookup on an inactive warehouse by Staff returns HTTP **404 Not Found**.

### 4.4 Dashboard & Reports (Module 8)
- **Dashboard Stock Value Masking (BR-05 Extension):**
  - Staff must not see the aggregate inventory valuation (`stockValue`). In `GET /api/dashboard/summary`, `stockValue` is returned only for `admin` and `manager` roles, and omitted completely for `staff`.
- **Location-Based Low-Stock Count Rule:**
  - `lowStockCount` in `GET /api/dashboard/summary` is computed as the number of distinct `(product_id, warehouse_id)` locations where `stock_levels.quantity <= products.reorder_level` for active products in active warehouses, reflecting operational reality that stockouts occur per physical facility.

### 4.5 Global API Conventions
- **camelCase Response Standardization:**
  - All API response properties across all modules are standardized on `camelCase` (`isActive`, `createdAt`, `unitPrice`, `costPrice`, `stockValue`).
- **Demo Credentials in API Test Files (.http):**
  - Public demo user credentials appear as convenience variables at the top of `docs/api-tests/*.http` files to enable 1-click execution in VS Code REST Client, Thunder Client, and IntelliJ.

### 4.6 Concurrency and Deadlock Verification Scope (Module 4)
- High-concurrency race condition testing and deadlock-prevention testing (simultaneous opposite-direction transfers) are executed and verified in Jest integration tests (`tests/inventory.test.js`) against `inventory_test_db`, while live script testing tests end-to-end functionality sequentially against `inventory_db`.

### 4.7 Supplier Management (Module 5)
- **Deactivation Guard Scope:**
  - Supplier deactivation is blocked only if the supplier has open purchase orders (`draft` or `ordered`), satisfying BR-07. Active catalog products referencing the supplier do not block deactivation (products maintain historical supplier linkage, but new products cannot reference inactive suppliers).
- **Inactive Supplier Visibility (Staff 404):**
  - Direct lookup on an inactive supplier by Staff returns HTTP **404 Not Found**.
- **Supplier Name and Email Uniqueness Rules:**
  - Multiple suppliers may share the same name (distinct legal entities). Email uniqueness is enforced at the application level in `supplier.service.js` (returning HTTP 409 Conflict).

### 4.8 Purchase Order Management (Module 6)
- **Duplicate Line Item Consolidation:**
  - Submitting duplicate line items for the same `productId` in a purchase order merges them server-side (summing quantities and retaining the last non-null unit cost) rather than rejecting the payload.
- **Default Unit Cost Snapshotting Risk:**
  - Omitting `unitCost` defaults the line item to the product's catalog `costPrice`. If the catalog price changes later, PO history retains the snapped price.

### 4.9 Diagnostic Scripts & Test Artifacts (Phase 3 & 4 Maintenance)
- **Untracked Phase 3 Evidence Scripts in `backend/scripts/`:**
  - 5 diagnostic verification scripts and text logs (`runLiveStep4Evidence.js`, `step4_evidence.txt`, etc.) created during Phase 3 remain in `backend/scripts/`. These are diagnostic tools, not shipped runtime code.
- **Resolution of Dangling Phase 3 Sales Order Test Fixtures:**
  - Prior to Phase 4 Step 4, 4 non-terminal test fixtures (`SO #9`, `#10`, `#11`, `#13`) left open from Phase 3 testing were cleanly cancelled via the standard API (`POST /api/sales-orders/:id/cancel`), restoring `openSalesOrders` to **0** and establishing a pristine baseline without stock mutations.

---

## 5. Open Issues & Quality Gaps

| Issue / Gap | Module | Severity | Description & Operational Impact |
|---|---|---|---|
| **Mount Warning (`oxlint`)** | Frontend (All Pages) | Low | 13 non-fatal warnings for `react(set-state-in-effect)` on initial DataGrid data fetch inside `useEffect`. Standard idiomatic React pattern; causes zero runtime regressions. |
| **Untracked Phase 3 Evidence Files** | Backend Tooling | Low | 5 `.js` test runners and 5 `.txt` terminal logs in `backend/scripts/`. Retained as offline audit proof, but should be deleted or added to `.gitignore`. |
| **DB-Level Unique Key on Supplier Email** | Backend Database | Low | Uniqueness of `suppliers.email` is protected by application validation; physical schema allows duplicates if queried directly via SQL client. |

---

## 6. Security & Dependency Audit Findings

1. **Automated Dependency Vulnerability Audit (`npm audit`):**
   - **Backend:** `found 0 vulnerabilities` across all dependencies (`express`, `mysql2`, `jsonwebtoken`, `bcryptjs`, `joi`, `helmet`, `cors`, `express-rate-limit`).
   - **Frontend:** `found 0 vulnerabilities` across all dependencies (`react`, `@mui/material`, `@mui/x-data-grid`, `recharts`, `axios`).
2. **Static Code & Repository Security Review:**
   - **SQL Injection:** 0 instances of string interpolation or concatenation in SQL. 100% of database access utilizes parameterized prepared statements (`pool.execute` or `conn.execute` with `?` parameters).
   - **Credential Exposure:** 0 plaintext passwords or secret keys hardcoded in version-controlled files. `.env` files are strictly excluded via `.gitignore`.
   - **Data Serialization Safety:** `password_hash` is explicitly excluded from user retrieval queries and scrubbed before API serialization.
   - **Rate Limiting:** IP-based brute-force throttling (10 attempts / 15 minutes) active on `/api/auth/login`.

---

## 7. Version Control & Git Reconciliation

- **Active Branch:** `main`
- **Upstream Tracking:** `origin/main`
- **Git Commit Audit:**
  - `git log --oneline -5` confirms exactly **1 commit** ahead of `origin/main`:
    `f0cbef3 feat(ui): build products, warehouses, and suppliers management pages` (committed during early Phase 3).
  - **Confirmation:** Exactly **0 git commits** were created during Phase 4. All work performed in Phase 4 remains uncommitted in the working tree, strictly adhering to the project no-commit policy.

---

## 8. Deployment & Containerization Status

**Docker Status: Fully Implemented, Hardened & Verified Live**

The entire RIMS stack was containerized, built, and verified running on Docker Desktop 29.8.1 with zero regressions:

1. **Multi-Container Architecture (`docker-compose.yml`):**
   - **`rims_mysql`:** Pinned official image `mysql:8.0.41` with persistent volume `rims_mysql_data` and internal network `rims_network`. Port 3306 is intentionally **not** published to the host, preventing collisions with host native MySQL. Container passed automated Docker health checks (`mysqladmin ping`).
   - **`rims_backend`:** Pinned base image `node:24.13.1-alpine` matching `"engines": { "node": "24.13.1" }` in `backend/package.json`. Built with `npm ci --omit=dev`, non-root execution (`USER node`), and no `.env` files copied into the image. Exposes port 5000.
   - **`rims_frontend`:** Multi-stage build (`node:24.13.1-alpine` build stage $\rightarrow$ `nginx:1.27.4-alpine` production stage). Runs as non-root user `nginx` on unprivileged port 8080 (mapped to host `3000:8080`), serving production assets with reverse-proxy forwarding `/api/*` requests directly to `http://backend:5000/api/`.

2. **Security & Least-Privilege Verification:**
   - **Layer Inspection (`docker history`):** Zero credentials, secrets, or `.env` files appear in image layers.
   - **Filesystem Audit (`docker run --rm hcltech-backend sh -c "..."`):** `find / -name '.env*'` and `grep -rl 'JWT_SECRET=' /` returned zero matches, confirming no leaked secrets or env files in the image filesystem.
   - **Non-Root Execution (`docker exec <container> whoami`):** Verified `rims_backend` outputs `node` and `rims_frontend` outputs `nginx` (neither runs as `root`).
   - **Zero `:latest` Tags:** All base images in Dockerfiles and `docker-compose.yml` are strictly pinned (`node:24.13.1-alpine`, `nginx:1.27.4-alpine`, `mysql:8.0.41`).
   - **Secret Hygiene & Rotation:** Database credentials and rotated `JWT_SECRET` (`2aa4...aa5d`) are supplied exclusively via `.env.docker` at runtime and excluded from git tracking via `.gitignore`. Hardcoded secret fallbacks were completely removed from `auth.js` and `auth.service.js`.

3. **Containerized Database Seeding & Baseline State:**
   - `database/schema.sql`, `database/migrations/002_orders.sql`, and `database/seed.sql` were executed against `rims_mysql`. Initial role accounts were seeded via `docker exec rims_backend node scripts/seedUsers.js`.
   - Verified table row counts: `users: 3`, `warehouses: 3`, `suppliers: 5`, `products: 20`, `stock_levels: 39`.
   - *Note on Baseline:* The containerized database is a freshly seeded baseline (20 products) and intentionally differs from the accumulated dev `inventory_db` (28 products) used in earlier test evidence — so this is not an inconsistency.

4. **Live Container Smoke Test:**
   - `POST http://localhost:5000/api/auth/login`: Returned `200 OK` with valid JWT and profile (`role: "admin"`).
   - `GET http://localhost:5000/api/dashboard/summary`: Returned `200 OK` with verified baseline KPIs (`totalActiveProducts: 20`, `totalStockUnits: 1897`, `stockValue: 47407`, `lowStockCount: 4`, `openPurchaseOrders: 0`, `openSalesOrders: 0`).
   - `GET http://localhost:3000/`: Returned `200 OK` serving React SPA from Nginx.
   - `POST http://localhost:3000/api/auth/login`: Successfully proxied from frontend Nginx to backend container, returning `200 OK` with valid token.

---

### Audit Sign-off

The Retail Inventory Management System (RIMS) has met all verification criteria for Phase 4. All core use cases (31/31), implemented extensions (2/2), automated test suites (216/216 passing), security standards, and containerized Docker services are fully functional, integrated, tested, and documented.


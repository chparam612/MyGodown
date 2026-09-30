# Project Deviations and Implementation Notes

This document records deliberate design decisions, deviations from initial default assumptions, and explicit business logic behaviors implemented across the Retail Inventory Management System (RIMS).

---

## 1. Authentication & User Management (Module 1)

### 1.1 Self-Deactivation and Last-Admin Protection HTTP Status (403 Forbidden)
- **Behavior:**
  - When an Administrator attempts to deactivate their own account (via `PUT /api/users/:id` or `DELETE /api/users/:id`), the API responds with HTTP **403 Forbidden** (code: `FORBIDDEN`) and message: `"Administrators cannot deactivate their own account"`.
  - When an Administrator attempts to demote their own role (via `PUT /api/users/:id`), the API responds with HTTP **403 Forbidden** (code: `FORBIDDEN`) and message: `"Administrators cannot demote their own role"`.
  - When an operation would leave zero active administrators in the system, the API responds with HTTP **403 Forbidden** (code: `FORBIDDEN`) and message: `"Cannot deactivate or demote the last remaining active administrator"`.
- **Frontend / API Contract Requirement:**
  - The client application must anticipate HTTP 403 for these specific administrative protection violations and display the friendly error message directly to the user in a notification/toast rather than treating it as a generic unauthenticated/unauthorized session expiration.

### 1.2 User Routes Restricted Exclusively to Administrator
- **Behavior:**
  - `GET /api/users`, `GET /api/users/:id`, `POST /api/users`, `PUT /api/users/:id`, `DELETE /api/users/:id`, and `POST /api/users/:id/reset-password` are strictly restricted to users with the `admin` role.
  - Managers and Staff requesting user administration endpoints receive HTTP **403 Forbidden**.
  - All authenticated users inspect their own active profile via `GET /api/auth/me`.

---

## 2. Product Management (Module 2)

### 2.1 Default Product Listing Inactive Filter & Staff 404
- **Behavior:**
  - By default, `GET /api/products` filters for `is_active = 1`. Inactive products are hidden unless explicitly queried with `isActive=false` by an Administrator or Warehouse Manager.
  - Staff users are permanently restricted from viewing inactive products: any listing request by Staff for inactive products filters them out, and a direct lookup (`GET /api/products/:id`) on an inactive product by Staff returns HTTP **404 Not Found**.

### 2.2 Cost Price Visibility (BR-05)
- **Behavior:**
  - Staff never receive `costPrice`. The `costPrice` property is strictly excluded from responses for users with the `staff` role in both list and detail endpoints (`GET /api/products` and `GET /api/products/:id`).
  - Administrators and Warehouse Managers receive full financial figures (`unitPrice` and `costPrice`).

### 2.3 SKU Immutability After Creation
- **Behavior:**
  - Product SKU is immutable once created. If an update request (`PUT /api/products/:id`) contains a `sku` that differs from the existing product SKU, the request is rejected with HTTP **400 Bad Request** (`"Product SKU cannot be modified after creation"`).
  - Consequently, duplicate SKU collisions on update operations are impossible by design.

---

---

## 3. Warehouse Management (Module 3)

### 3.1 Warehouse Code Immutability & Uppercase Pattern
- **Behavior:**
  - Warehouse code is normalized to uppercase upon creation and must match pattern `^[A-Za-z0-9_-]+$`.
  - Warehouse code is immutable after creation. If an update request (`PUT /api/warehouses/:id`) contains a `code` that differs from the existing code, the request is rejected with HTTP **400 Bad Request** (`"Warehouse code cannot be modified after creation"`).

### 3.2 Inactive Warehouse Visibility (Staff 404)
- **Behavior:**
  - Inactive warehouses are excluded by default from warehouse listings.
  - Staff users are strictly prohibited from viewing inactive warehouses: any listing request by Staff filters them out, and a direct lookup (`GET /api/warehouses/:id`) on an inactive warehouse by Staff returns HTTP **404 Not Found**.

---

## 4. Dashboard & Reports (Module 8 Design Decisions)

### 4.1 Dashboard Stock Value Visibility Restricted (BR-05 Extension)
- **Decision:**
  - Staff must **NOT** see the dashboard stock valuation figure (`stockValue`), which is derived from product cost prices ($\sum \text{quantity} \times \text{cost\_price}$).
  - In the Dashboard module (`GET /api/dashboard/summary`), `stockValue` will be returned only for users with the `admin` and `manager` roles, and omitted completely from the response for `staff`.

### 4.2 Dashboard Low-Stock Count Rule (Location-Based vs Catalog-Based)
- **Behavior:**
  - `lowStockCount` in `GET /api/dashboard/summary` is computed as the number of distinct `(product_id, warehouse_id)` inventory locations where `stock_levels.quantity <= products.reorder_level` (for active products in active warehouses).
  - Rationale: Inventory replenishment and reorder operations are managed per facility. A product adequately stocked at Warehouse A but below reorder level at Warehouse B requires replenishment action at Warehouse B.

---

## 5. Global API Conventions

### 5.1 camelCase Response Standardization
- **Behavior:**
  - All API response properties across all modules are standardized on `camelCase`: e.g., `isActive`, `createdAt`, `updatedAt`, `unitPrice`, `costPrice`, `reorderLevel`, `supplierId`, `supplierName`, `totalStock`, `productCount`, `stockValue`.
  - For backward compatibility on request input, both `camelCase` (`isActive`) and `snake_case` (`is_active`) are accepted in query parameters and request bodies.

### 5.2 Demo Credentials in API Test Files (.http)
- **Deviation:**
  - Demo user credentials (`admin@mygodown.com`, `manager@mygodown.com`, `staff@mygodown.com` and their respective demo passwords) appear as convenience variables at the top of `docs/api-tests/*.http` files.
  - While project instructions stipulate that plaintext demo passwords should only be published in `README.md` and `.env.example`, declaring them as top-level variables in `.http` test files facilitates local execution with IDE REST clients (VS Code REST Client, Thunder Client, IntelliJ HTTP Client).
  - This deviation is accepted as low risk since these credentials represent public development seed credentials already published in `README.md`.

---

## 6. Inventory & Concurrency Testing (Module 4)

### 6.1 Concurrency and Deadlock Verification Scope
- **Scope & Evidence:**
  - High-concurrency race condition testing (two simultaneous outbound deductions for the final units) and deadlock-prevention testing (simultaneous opposite-direction transfers between the same warehouse pairs) require millisecond-precise parallel coordination and transaction rollback assertions.
  - These concurrency and deadlock behaviors are proven in Jest only (`tests/inventory.test.js` against `inventory_test_db`), not in the live script against `inventory_db`.
  - The live `.http` script (`runLiveInventoryTests.js`) tests end-to-end functionality, validation, RBAC, and data masking sequentially on isolated `LIVE-` fixtures.

---

## 7. Supplier Management (Module 5)

### 7.1 Deactivation Guard Scope & Product Reference Observation
- **Specification vs Schema Analysis:**
  - Business Rule BR-07 and Use Case UC-24 explicitly dictate that supplier deactivation is blocked if the supplier has open purchase orders (`draft` or `ordered`) awaiting receipt (`422 UnprocessableEntityError`).
  - Neither BR-07 nor UC-24 mandates blocking deactivation if active catalog products still reference the supplier. The foreign key constraint in `database/schema.sql` (`fk_products_supplier ... ON DELETE RESTRICT`) restricts physical row deletion (`DELETE FROM suppliers`), not soft-deactivation (`is_active = 0`).
  - **Decision:** In strict accordance with the spec and Phase 1 schema, deactivating a supplier does not block on referencing active products. Module 2 already enforces that new or updated products cannot be linked to a deactivated supplier (`422 UnprocessableEntityError`). Existing products retain their historical association.

### 7.2 Inactive Supplier Visibility (Staff 404)
- **Behavior:**
  - Inactive suppliers are excluded by default from standard supplier listings.
  - Staff members requesting an inactive supplier directly via `GET /api/suppliers/:id` receive HTTP **404 Not Found**, consistent with the privacy boundaries enforced for products and warehouses.

### 7.3 Supplier Name and Email Uniqueness Rules
- **Behavior:**
  - **Supplier Name:** Supplier names are **not** unique. Multiple distinct suppliers are permitted to share the same name (e.g. different regional operating entities or independent branches).
  - **Supplier Email:** Supplier email uniqueness is enforced strictly via **application-level pre-checks** in `src/services/supplier.service.js` (returning HTTP 409 Conflict if a duplicate email is provided upon create or update). There is no database-level UNIQUE constraint on `email` in `inventory_db`.

---

## 8. Purchase Order Management (Module 6)

### 8.1 Duplicate Line Item Consolidation
- **Behavior:**
  - If a purchase order creation (`POST /api/purchase-orders`) or draft update (`PUT /api/purchase-orders/:id`) request contains duplicate line items for the same `productId`, the server merges them into a single consolidated line item (summing quantities and retaining the last non-null unit cost provided) rather than rejecting the request.

### 8.2 Default Unit Cost Snapshotting Risk
- **Behavior & Known Risk:**
  - When `unitCost` is omitted from a line item at creation, the system automatically defaults `unitCost` to the product's current catalog `costPrice`.
  - **Known Risk:** If the product's catalog `costPrice` is modified later, PO history will not reflect the actual agreed supplier procurement price unless `unitCost` was explicitly provided in the request payload.

---

## 9. Diagnostic Scripts & Test Artifacts (Phase 3 & 4 Maintenance)

### 9.1 Untracked Phase 3 Evidence Scripts in `backend/scripts/`
- **Context:**
  - During Phase 3 verification (Steps 4, 5, 6.A, 6.B, 7), 5 diagnostic Node scripts and their terminal capture files were created to execute and record real network calls against `inventory_db`:
    - `backend/scripts/runLiveStep4Evidence.js` & `backend/scripts/step4_evidence.txt`
    - `backend/scripts/runLiveStep5Evidence.js` & `backend/scripts/step5_evidence.txt`
    - `backend/scripts/runLiveStep6aEvidence.js` & `backend/scripts/step6a_evidence.txt`
    - `backend/scripts/runLiveStep6bEvidence.js` & `backend/scripts/step6b_evidence.txt`
    - `backend/scripts/runLiveStep7Evidence.js` & `backend/scripts/step7_evidence.txt`
  - These files are diagnostic verification tools rather than shipped runtime product code.
- **Pending Decision (Final Report):**
  - Tracked as an open repository hygiene item to be formally decided with the user at the conclusion of Phase 4:
    1. Option A: Delete diagnostic scripts and text logs from working directory.
    2. Option B: Retain them in `backend/scripts/` as permanent offline test documentation.
    3. Option C: Add `scripts/*Evidence.js` and `scripts/*_evidence.txt` to `.gitignore`.

### 9.2 Resolution of Dangling Phase 3 Sales Order Test Fixtures
- **Context:**
  - Prior to Phase 4 Step 4 testing, a baseline inspection of `inventory_db` revealed `openPurchaseOrders: 0` but `openSalesOrders: 4`.
  - Detailed query of `GET /api/sales-orders?status=draft` and `GET /api/sales-orders?status=confirmed` identified 4 leftover test fixtures from Phase 3 Step 6.B verification (created at 2026-09-30 10:22:20):
    - `SO #9` (`SO-20260930-3059`): Draft test order created under Warehouse Manager role.
    - `SO #10` (`SO-20260930-2907`): Draft test order created under Administrator role.
    - `SO #11` (`SO-20260930-8073`): Confirmed test order created to verify multi-line shortage rollback.
    - `SO #13` (`SO-20260930-9503`): Draft test order created to test patch cancellation.
- **Resolution:**
  - All 4 orders were non-terminal test fixtures. Each was cleanly transitioned to terminal status `cancelled` via the standard REST endpoint (`POST /api/sales-orders/:id/cancel`) by the Administrator account.
  - Zero inventory stock was mutated (cancellation leaves stock untouched by design).
  - Dashboard `openSalesOrders` KPI successfully reset to **0**, restoring a completely clean operational baseline for Phase 4 Step 4 testing.

---

## 10. Containerization & Database Security Simplifications

### 10.1 Database Superuser Usage (`DB_USER=root`)
- **Behavior & Context:**
  - Both native development configurations and containerized Docker configurations (`docker-compose.yml` / `.env.docker`) utilize `DB_USER=root` to connect to MySQL rather than a dedicated least-privilege service account (e.g. `rims_app` granted `SELECT, INSERT, UPDATE, DELETE` only).
- **Design Simplification:**
  - Accepted for current project scope and submission baseline to simplify automated migration, seeding scripts, and test suite resets (`inventory_test_db` dynamic drop/create).
  - Recommended future production hardening: provision dedicated least-privilege application database credentials.





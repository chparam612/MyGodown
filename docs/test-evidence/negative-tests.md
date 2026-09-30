# Phase 4 — Task 3: Negative & Concurrency Testing Evidence

**Execution Date:** 2026-09-30  
**Environment:** Local Development Stack (`http://localhost:5000/api`, Vite dev proxy on `http://localhost:5173`)  
**Database:** `inventory_db` (Live MySQL 9.7.1)  
**Raw Evidence JSON:** [`docs/test-evidence/negative_tests_raw.json`](file:///C:/Users/prtv1/OneDrive/Attachments/Desktop/HCL%20Tech/docs/test-evidence/negative_tests_raw.json)  

---

## 1. Summary of Negative & Concurrency Testing

A battery of 30 negative, edge-case, and high-concurrency race condition tests was executed directly against the live backend API and database. Every test verified three fundamental guarantees:
1. **Accurate HTTP Status & Error Code:** Standard REST status code (`400`, `403`, `409`, `422`) with structured error envelope.
2. **Clear Error Message:** Descriptive, non-leaking error description detailing the rule violation.
3. **Strict Data Invariance:** Verified via before-and-after database queries proving zero unintended records or stock mutations occurred.

---

## 2. Complete Negative & Concurrency Test Results

| Test # | Test Name | Request & Endpoint | Expected Response | Actual Response | Pass / Fail | Data Unchanged? (Yes/No with Proof) |
|---|---|---|---|---|---|---|
| **1** | Duplicate Product SKU on Create | `POST /api/products with existing sku 'TOOL-DRL-001'` | `409 Conflict` (`CONFLICT`) | `409 Conflict` (`CONFLICT`) | **PASS** | **Yes**: No new product created with sku 'TOOL-DRL-001'. |
| **2** | Immutable SKU Modification on Update | `PUT /api/products/1 with modified sku` | `400 Bad Request` (`VALIDATION_ERROR`) | `400 Bad Request` (`VALIDATION_ERROR`) | **PASS** | **Yes**: SKU remained 'TOOL-DRL-001' in database. |
| **3** | Duplicate User Email on Create | `POST /api/users with existing email 'admin@mygodown.com'` | `409 Conflict` (`CONFLICT`) | `409 Conflict` (`CONFLICT`) | **PASS** | **Yes**: User creation rejected; total users invariant. |
| **4** | Duplicate Warehouse Code on Create | `POST /api/warehouses with existing code 'WH-CENTRAL'` | `409 Conflict` (`CONFLICT`) | `409 Conflict` (`CONFLICT`) | **PASS** | **Yes**: Warehouse creation rejected; warehouse records invariant. |
| **5** | Duplicate Supplier Email on Create | `POST /api/suppliers with existing email 'sales@apextools.com'` | `409 Conflict` (`CONFLICT`) | `409 Conflict` (`CONFLICT`) | **PASS** | **Yes**: Supplier creation rejected; supplier list invariant. |
| **6** | Insufficient Stock: Movement Out | `POST /api/inventory/movements with quantity 5085 (stock: 85)` | `422 Unprocessable Entity` (`INSUFFICIENT_STOCK`) | `422 Unprocessable Entity` (`INSUFFICIENT_STOCK`) | **PASS** | **Yes**: Stock remained exactly 85 (85 -> 85). |
| **7** | Insufficient Stock: Inter-Warehouse Transfer | `POST /api/inventory/transfer with quantity 5085` | `422 Unprocessable Entity` (`INSUFFICIENT_STOCK`) | `422 Unprocessable Entity` (`INSUFFICIENT_STOCK`) | **PASS** | **Yes**: Source stock remained exactly 85. |
| **8** | Sales Order Shortage: Multi-Line Atomic Rollback | `POST /api/sales-orders/28/fulfill (Line 1 qty 2 has stock, Line 2 qty 99999 lacks stock)` | `422 Unprocessable Entity` (`INSUFFICIENT_STOCK`) | `422 Unprocessable Entity` (`INSUFFICIENT_STOCK`) | **PASS** | **Yes**: Line 1 stock unchanged (85 -> 85), Line 2 stock unchanged (30 -> 30). |
| **9** | Double-Receive Guard: Purchase Order | `Second POST /api/purchase-orders/21/receive` | `409 Conflict` (`CONFLICT`) | `409 Conflict` (`CONFLICT`) | **PASS** | **Yes**: Stock before 2nd receive: 90, stock after 2nd receive: 90 (delta = 0). |
| **10** | Double-Fulfillment Guard: Sales Order | `Second POST /api/sales-orders/29/fulfill` | `409 Conflict` (`CONFLICT`) | `409 Conflict` (`CONFLICT`) | **PASS** | **Yes**: Stock before 2nd fulfill: 88, stock after 2nd fulfill: 88 (delta = 0). |
| **11** | Validation: Missing Required Fields | `POST /api/products without sku/category/costPrice` | `400 Bad Request` (`VALIDATION_ERROR`) | `400 Bad Request` (`VALIDATION_ERROR`) | **PASS** | **Yes**: Rejected with validation details; no product created. |
| **12** | Validation: Negative Price | `POST /api/products with unitPrice: -10` | `400 Bad Request` (`VALIDATION_ERROR`) | `400 Bad Request` (`VALIDATION_ERROR`) | **PASS** | **Yes**: Rejected with validation error; no product created. |
| **13** | Validation: Zero Quantity | `POST /api/inventory/movements with quantity: 0` | `400 Bad Request` (`VALIDATION_ERROR`) | `400 Bad Request` (`VALIDATION_ERROR`) | **PASS** | **Yes**: Rejected with validation error; no movement created. |
| **14** | Validation: Weak Password | `POST /api/users with password: "weak"` | `400 Bad Request` (`VALIDATION_ERROR`) | `400 Bad Request` (`VALIDATION_ERROR`) | **PASS** | **Yes**: Rejected by complexity regex; no user created. |
| **15** | Validation: Invalid Email Format | `POST /api/users with email: "notanemail"` | `400 Bad Request` (`VALIDATION_ERROR`) | `400 Bad Request` (`VALIDATION_ERROR`) | **PASS** | **Yes**: Rejected by email validator; no user created. |
| **16** | Validation: Unknown Enum Value ("shipped") | `PATCH /api/sales-orders/17/status with status: "shipped"` | `400 Bad Request` (`VALIDATION_ERROR`) | `400 Bad Request` (`VALIDATION_ERROR`) | **PASS** | **Yes**: Rejected because status must be confirmed, fulfilled, or cancelled. |
| **17** | Security: SQL Injection in Search Parameter | `GET /api/products?search=' OR '1'='1; DROP TABLE products; --` | `200 OK` | `200 OK` | **PASS** | **Yes**: Parameterized query safely handled input as literal search string; database completely unharmed. |
| **18** | Illegal State: Fulfill a Draft SO | `POST /api/sales-orders/30/fulfill (status is draft)` | `409 Conflict` (`CONFLICT`) | `409 Conflict` (`CONFLICT`) | **PASS** | **Yes**: Rejected; SO must be confirmed before fulfillment. |
| **19** | Illegal State: Receive a Draft PO | `POST /api/purchase-orders/22/receive (status is draft)` | `409 Conflict` (`CONFLICT`) | `409 Conflict` (`CONFLICT`) | **PASS** | **Yes**: Rejected; PO must be ordered before receiving. |
| **20** | Illegal State: Edit a Non-Draft (Ordered) PO (UC-P08) | `PUT /api/purchase-orders/22 (status is ordered)` | `409 Conflict` (`CONFLICT`) | `409 Conflict` (`CONFLICT`) | **PASS** | **Yes**: Rejected; only draft purchase orders can be modified. |
| **21** | Illegal State: Cancel a Received PO | `POST /api/purchase-orders/22/cancel (status is received)` | `409 Conflict` (`CONFLICT`) | `409 Conflict` (`CONFLICT`) | **PASS** | **Yes**: Rejected; received purchase orders cannot be cancelled. |
| **22** | Illegal State: Cancel a Fulfilled SO | `POST /api/sales-orders/29/cancel (status is fulfilled)` | `409 Conflict` (`CONFLICT`) | `409 Conflict` (`CONFLICT`) | **PASS** | **Yes**: Rejected; fulfilled sales orders cannot be cancelled. |
| **23** | Deactivation Guard: Warehouse Holding Stock (BR-08) | `DELETE /api/warehouses/1 (holding active inventory)` | `422 Unprocessable Entity` (`UNPROCESSABLE_ENTITY`) | `422 Unprocessable Entity` (`UNPROCESSABLE_ENTITY`) | **PASS** | **Yes**: Warehouse 1 isActive remained true. |
| **24** | Deactivation Guard: Supplier with Open POs (BR-07) | `DELETE /api/suppliers/1 (has active ordered PO)` | `422 Unprocessable Entity` (`UNPROCESSABLE_ENTITY`) | `422 Unprocessable Entity` (`UNPROCESSABLE_ENTITY`) | **PASS** | **Yes**: Supplier 1 isActive remained true. |
| **25** | Administrative Guard: Self-Deactivation Block | `DELETE /api/users/22 using own session token` | `403 Forbidden` (`FORBIDDEN`) | `403 Forbidden` (`FORBIDDEN`) | **PASS** | **Yes**: Admin self-deactivation blocked; account remains active. |
| **26** | Administrative Guard: Self-Demotion Block | `PUT /api/users/22 with role: "staff" using own token` | `403 Forbidden` (`FORBIDDEN`) | `403 Forbidden` (`FORBIDDEN`) | **PASS** | **Yes**: Admin self-demotion blocked; role remains admin. |
| **27** | Administrative Guard: Last Active Admin Demotion Block | `PUT /api/users/1 to demote the sole remaining active administrator` | `403 Forbidden` (`FORBIDDEN`) | `403 Forbidden` (`FORBIDDEN`) | **PASS** | **Yes**: Sole administrator cannot be demoted or deactivated. |
| **28** | Concurrency Race: Simultaneous PO Receive Calls | `Two parallel POST /api/purchase-orders/24/receive calls` | `200 & 409` | Returned `200 & 409` | **PASS** | **Yes**: Stock incremented exactly once by 5 (89 -> 94). |
| **29** | Concurrency Race: Simultaneous SO Fulfill Calls | `Two parallel POST /api/sales-orders/31/fulfill calls` | `200 & 409` | Returned `200 & 409` | **PASS** | **Yes**: Stock decremented exactly once by 3 (94 -> 91). |
| **30** | Concurrency Race: Competing for Last Available Stock | `Two parallel POST /api/inventory/movements requesting 5 units from stock of 5` | `201 & 422` | Returned `201 & 422` | **PASS** | **Yes**: Final stock equals 0 (never negative); exactly one 201 Created and one 422 INSUFFICIENT_STOCK. |

---

## 3. Concurrency & Atomicity Analysis

### 3.1 Pessimistic Row Locking (`SELECT ... FOR UPDATE`)
All critical operations (PO receiving, SO fulfillment, stock transfers, and manual stock movements) execute within explicit database transactions (`withTransaction`) that acquire row-level locks on both order rows and `stock_levels` rows:
- In PO receiving (`purchaseOrder.service.js`), the PO row is locked with `lockPoForUpdate()`. The status transition `draft -> received` or `ordered -> received` executes an affected-rows check (`affectedRows === 1`). The second concurrent request encounters a row lock, waits for transaction commit, reads the committed status `received`, and immediately throws `ConflictError(409)` without mutating stock.
- In SO fulfillment (`salesOrder.service.js`), the SO row is locked with `lockSoForUpdate()`. The guarded UPDATE `WHERE status = 'confirmed'` ensures only the winning thread proceeds to call `deductStockForSalesOrder()`. The losing concurrent thread aborts with `ConflictError(409)`.
- In manual movements and stock deductions (`inventory.service.js`), stock level rows are locked via `lockStockLevelForUpdate()`. Available quantity is evaluated within the lock; any request where `quantity > stock` throws `InsufficientStockError(422)`. This guarantees that negative stock is mathematically impossible even under high-frequency parallel requests.

### 3.2 Multi-Line Sales Order Shortage Atomicity
- Test `#8` verified a multi-line sales order where Line 1 (Product 1, qty 2) had sufficient stock, but Line 2 (Product 2, qty 99,999) exceeded available inventory.
- Upon attempting fulfillment, Line 2 threw `InsufficientStockError(422)`.
- The `withTransaction` ACID wrapper caught the exception and executed a full transaction `ROLLBACK`.
- Live query inspection proved that **zero units** were deducted from Line 1. The entire order remained in `confirmed` status with zero ledger movements created.

---

## 4. Conclusion

All 30 negative and concurrency tests passed with 100% adherence to API contracts, business invariants, and security specifications. Zero dangling test fixtures remain, and the live dashboard displays `openPurchaseOrders: 0` and `openSalesOrders: 0`.

# Phase 4 — Task 1: Full Demo Flow Verification Evidence

**Execution Date:** 2026-09-30  
**Target Environment:** Local Development Stack (`http://localhost:5000/api`, Vite dev proxy on `http://localhost:5173`)  
**Database:** `inventory_db` (Live MySQL 9.7.1)  
**Execution Method:** Real HTTP Client driving the live API backend endpoints (authoritative server backend mirroring Vite UI proxy). Browser automation tools were not available in the runtime environment; therefore, real HTTP transactions were executed with full request/response recording and network-level payload assertions.

---

## Executive Summary

| Step # | Step Name | Primary Use Cases | Method Used | HTTP Status | Business Rule / Invariance Verified | Result |
|---|---|---|---|---|---|---|
| **1** | Admin Authentication | UC-01, UC-02 | REST API (`POST /auth/login`) | `200 OK` | Valid JWT token, role `admin` | **PASS** |
| **2** | Initial State & KPIs | UC-14, UC-32 | REST API (`GET /dashboard/summary`, `GET /inventory`) | `200 OK` | Baseline KPIs & stock levels recorded | **PASS** |
| **3** | Purchase Order Flow | UC-25, UC-P08, UC-27 | REST API (`POST`, `PUT`, `PATCH`, `POST /receive`) | `200 OK` | Draft edit (5 $\rightarrow$ 10 units), atomic receipt, stock $+10$, PO ledger movement | **PASS** |
| **4** | Sales Order Flow | UC-28, UC-30 | REST API (`POST`, `POST /confirm`, `POST /fulfill`) | `200 OK` | Confirm invariant (delta 0), fulfill terminal action, stock $-4$, SO ledger movement | **PASS** |
| **5** | Stock Transfer | UC-18, UC-19 | REST API (`POST /inventory/transfer`) | `200 OK` | Atomic dual warehouse updates ($-3$ / $+3$), linked ledger movements | **PASS** |
| **6** | Stock Adjustment | UC-17, UC-19 | REST API (`POST /inventory/adjust`) | `200 OK` | Counted physical stock, signed delta movement ($+2$), mandatory reason | **PASS** |
| **7** | Low Stock Lifecycle | UC-20, UC-32 | REST API (`/inventory/low-stock`, `/dashboard/summary`) | `200 OK` | Deficit triggers alert & KPI ($4 \rightarrow 5$); restock clears alert & KPI ($5 \rightarrow 4$) | **PASS** |
| **8** | Staff Financial Masking | UC-08, UC-14, UC-32 (BR-05) | REST API (`GET /dashboard/summary`, `/products`, `/inventory`) | `200 OK` | `stockValue` & `costPrice` strictly omitted at JSON key level (`Object.keys`) | **PASS** |

**Total Steps Executed:** 8  
**Total Steps Passed:** 8 (100%)  
**Total Steps Failed:** 0 (0%)  

---

## Detailed Step-by-Step Evidence

### Step 1: Admin Authentication
- **Action:** `POST /api/auth/login`
- **Method Used:** HTTP Client (Real API)
- **Request Payload:**
  ```json
  {
    "email": "admin@mygodown.com",
    "password": "AdminPassword123!"
  }
  ```
- **Expected:** HTTP `200 OK`, valid JWT token returned, user profile with `role: "admin"`.
- **Actual Status:** HTTP `200 OK`
- **Response Payload (Verbatim):**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": 1,
        "name": "System Administrator",
        "email": "admin@mygodown.com",
        "role": "admin",
        "isActive": true
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```
- **Pass/Fail:** **PASS**

---

### Step 2: Starting State & Dashboard KPIs Inspection
- **Action:** `GET /api/dashboard/summary`, `GET /api/warehouses`, `GET /api/products`, `GET /api/inventory`
- **Method Used:** HTTP Client with Admin Bearer Token
- **Selected Fixtures:**
  - **Product:** `#1` (`TOOL-DRL-001`, *"Cordless Brushless Drill 18V"*, `costPrice: 79.50`, `unitPrice: 129.99`, `reorderLevel: 15`, `supplierId: 1`)
  - **Warehouse 1 (Source):** `#1` (`WH-CENTRAL`, *"Central Logistics Hub"*)
  - **Warehouse 2 (Destination):** `#2` (`WH-EAST`, *"East Coast Distribution Center"*)
- **Baseline Values Recorded:**
  - Initial Stock in Warehouse 1: **81 units**
  - Initial Stock in Warehouse 2: **48 units**
  - Starting Dashboard KPIs:
    ```json
    {
      "totalActiveProducts": 28,
      "totalStockUnits": 1963,
      "stockValue": 52691.00,
      "lowStockCount": 4,
      "openPurchaseOrders": 0,
      "openSalesOrders": 4
    }
    ```
- **Pass/Fail:** **PASS**

---

### Step 3: Purchase Order Lifecycle & Stock Receipt
- **Action:** Full PO Lifecycle (Create Draft $\rightarrow$ Edit Draft via UC-P08 $\rightarrow$ Status Ordered $\rightarrow$ Atomic Receive)
- **Method Used:** HTTP Client with Admin Bearer Token
- **Sub-Steps & Requests:**
  1. **Create Draft PO (`POST /api/purchase-orders`):**
     - Request: `{ "supplierId": 1, "warehouseId": 1, "notes": "Demo PO Lifecycle", "items": [{ "productId": 1, "quantity": 5, "unitCost": 79.50 }] }`
     - Response: HTTP `201 Created`, `poNumber: "PO-20260930-6606"`, `status: "draft"`, `totalAmount: 397.50`.
  2. **Edit Draft PO (UC-P08) (`PUT /api/purchase-orders/16`):**
     - Request: `{ "supplierId": 1, "warehouseId": 1, "notes": "Demo PO - Qty updated to 10", "items": [{ "productId": 1, "quantity": 10, "unitCost": 79.50 }] }`
     - Response: HTTP `200 OK`, `items[0].quantity: 10`, `totalAmount: 795.00`.
  3. **Transition to Ordered (`PATCH /api/purchase-orders/16/status`):**
     - Request: `{ "status": "ordered" }`
     - Response: HTTP `200 OK`, `status: "ordered"`.
     - **Invariance Check:** Stock in Warehouse 1 queried immediately: **81 units** (Delta = 0).
  4. **Atomic Stock Receipt (`POST /api/purchase-orders/16/receive`):**
     - Response: HTTP `200 OK`, `status: "received"`.
- **Post-Receipt Stock Verification:**
  - Stock in Warehouse 1 queried: **91 units** ($81 + 10 = 91$, exact $+10$ delta).
- **Ledger Movement Verification (`GET /api/inventory/movements`):**
  - Movement Record:
    ```json
    {
      "id": 96,
      "productId": 1,
      "warehouseId": 1,
      "movementType": "in",
      "referenceType": "purchase_order",
      "referenceId": 16,
      "quantity": 10,
      "reference": "PO Receipt: PO-20260930-6606"
    }
    ```
- **Dashboard KPI Impact:**
  - `stockValue` before: `$52,691.00`
  - `stockValue` after: `$53,486.00` ($+10 \times \$79.50 = +\$795.00$)
- **Pass/Fail:** **PASS**

---

### Step 4: Sales Order Lifecycle & Atomic Fulfillment
- **Action:** Full SO Lifecycle (Create Draft $\rightarrow$ Confirm $\rightarrow$ Fulfil)
- **Method Used:** HTTP Client with Admin Bearer Token
- **Sub-Steps & Requests:**
  1. **Create Draft SO (`POST /api/sales-orders`):**
     - Request: `{ "customerName": "Enterprise Client Acme Corp", "warehouseId": 1, "notes": "Demo SO 4 units", "items": [{ "productId": 1, "quantity": 4, "unitPrice": 129.99 }] }`
     - Response: HTTP `201 Created`, `soNumber: "SO-20260930-9309"`, `status: "draft"`, `totalAmount: 519.96`.
  2. **Confirm SO (`POST /api/sales-orders/17/confirm`):**
     - Response: HTTP `200 OK`, `status: "confirmed"`.
     - **Invariance Check:** Stock in Warehouse 1 queried immediately: **91 units** (Delta = 0; confirming an order NEVER decrements stock).
  3. **Fulfill SO (`POST /api/sales-orders/17/fulfill`):**
     - Response: HTTP `200 OK`, `status: "fulfilled"`.
- **Post-Fulfillment Stock Verification:**
  - Stock in Warehouse 1 queried: **87 units** ($91 - 4 = 87$, exact $-4$ delta).
- **Ledger Movement Verification (`GET /api/inventory/movements`):**
  - Movement Record:
    ```json
    {
      "id": 97,
      "productId": 1,
      "warehouseId": 1,
      "movementType": "out",
      "referenceType": "sales_order",
      "referenceId": 17,
      "quantity": 4,
      "reference": "SO Fulfilment: SO-20260930-9309"
    }
    ```
- **Dashboard Impact:** Open SO count updated; total stock units decremented by 4.
- **Pass/Fail:** **PASS**

---

### Step 5: Inter-Warehouse Stock Transfer
- **Action:** Transfer 3 units of Product `#1` from Warehouse `#1` to Warehouse `#2`
- **Method Used:** HTTP Client (`POST /api/inventory/transfer`)
- **Request Payload:**
  ```json
  {
    "productId": 1,
    "sourceWarehouseId": 1,
    "destinationWarehouseId": 2,
    "quantity": 3,
    "notes": "Demo Inter-Warehouse Transfer Verification"
  }
  ```
- **Response Payload:** HTTP `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "productId": 1,
      "sourceWarehouseId": 1,
      "destinationWarehouseId": 2,
      "quantity": 3,
      "transferReference": "TRF-1790745725169-F83NL",
      "sourceRemainingStock": 84,
      "destinationNewStock": 51,
      "sourceMovementId": 98,
      "destinationMovementId": 99
    }
  }
  ```
- **Dual Stock Verification:**
  - Source Warehouse `#1`: **$87 \rightarrow 84$** ($-3$ delta)
  - Destination Warehouse `#2`: **$48 \rightarrow 51$** ($+3$ delta)
- **Linked Movements Verification:**
  - Movement `98`: `movementType: "out"`, `warehouseId: 1`, `referenceType: "transfer"`, `referenceId: 98`, `reference: "TRF-1790745725169-F83NL (Transfer to WH 2)"`
  - Movement `99`: `movementType: "in"`, `warehouseId: 2`, `referenceType: "transfer"`, `referenceId: 98`, `reference: "TRF-1790745725169-F83NL (Transfer from WH 1)"`
- **Pass/Fail:** **PASS**

---

### Step 6: Stock Adjustment with Physical Count & Reason
- **Action:** Physical inventory audit adjustment on Product `#1` in Warehouse `#1`
- **Method Used:** HTTP Client (`POST /api/inventory/adjust`)
- **Starting Stock:** 84 units
- **Counted Quantity:** 86 units (Delta = $+2$)
- **Adjustment Reason:** `"Physical cycle count audit bin variance verified"` (46 characters, satisfies $\ge 3$ char rule)
- **Request Payload:**
  ```json
  {
    "productId": 1,
    "warehouseId": 1,
    "countedQuantity": 86,
    "reason": "Physical cycle count audit bin variance verified"
  }
  ```
- **Response Payload:** HTTP `200 OK`
- **Post-Adjustment Verification:**
  - Stock in Warehouse 1 queried: **86 units** (Exact match with physical count).
  - Movement Record (`id: 100`):
    ```json
    {
      "id": 100,
      "productId": 1,
      "warehouseId": 1,
      "movementType": "adjustment",
      "referenceType": "adjustment",
      "quantity": 2,
      "reference": "Physical cycle count audit bin variance verified"
    }
    ```
- **Pass/Fail:** **PASS**

---

### Step 7: Low Stock Lifecycle (Trigger, Alert, and Clearance)
- **Action:** Create isolated test fixture product `#97` (`DEMO-LS-1790745725244`) with `reorderLevel: 25`, stock 30 $\rightarrow$ drop to 15 (trigger) $\rightarrow$ restock to 40 (clear) $\rightarrow$ soft-deactivate fixture.
- **Method Used:** HTTP Client (`POST /products`, `POST /inventory/adjust`, `GET /inventory/low-stock`, `GET /dashboard/summary`)
- **Phase A — Baseline:**
  - Starting `lowStockCount` in Dashboard: **4**
- **Phase B — Deficit Trigger (Stock = 15, Reorder Level = 25):**
  - Stock adjusted to 15 units.
  - Query `GET /api/inventory/low-stock`: Product `#97` in Warehouse `#1` returned in low-stock items (`inList: true`, deficit = 10 units).
  - Query `GET /api/dashboard/summary`: `lowStockCount` incremented to **5** ($+1$).
- **Phase C — Restock Clearance (Stock = 40, Reorder Level = 25):**
  - Stock adjusted to 40 units ($40 > 25$).
  - Query `GET /api/inventory/low-stock`: Product `#97` no longer returned (`inList: false`).
  - Query `GET /api/dashboard/summary`: `lowStockCount` decremented back to **4** ($-1$).
- **Cleanup:** Product `#97` soft-deactivated via `DELETE /api/products/97`.
- **Pass/Fail:** **PASS**

---

### Step 8: Staff Role Financial Data Masking Network Audit (BR-05)
- **Action:** Log in as `staff@mygodown.com` and inspect raw JSON response keys across Dashboard, Products, and Inventory endpoints.
- **Method Used:** HTTP Client (Staff Token vs Admin Token), verified via `Object.keys()` property assertions.
- **Network Level Findings:**

| Endpoint | Staff Role Keys Present | Admin Role Keys Present | BR-05 Masking Compliance |
|---|---|---|---|
| **`GET /api/dashboard/summary`** | `["totalActiveProducts", "totalStockUnits", "lowStockCount", "openPurchaseOrders", "openSalesOrders", "stockByWarehouse", "recentMovements"]` (7 keys) | `[..., "stockValue", ...]` (8 keys) | **`'stockValue' in staffData === false`** (100% omitted) |
| **`GET /api/products` (List)** | `costPrice` is absent from all items | `costPrice` is present on all items | **`costPrice` absent from list items** |
| **`GET /api/products/:id` (Detail)** | `["id", "sku", "name", "description", "category", "unitPrice", "reorderLevel", "supplierId", "supplierName", "isActive", "totalStock", "createdAt", "updatedAt"]` (13 keys) | `[..., "costPrice", ...]` (14 keys) | **`'costPrice' in staffProduct === false`** |
| **`GET /api/inventory` (List)** | `["id", "productId", "sku", "productName", "category", "unitPrice", "reorderLevel", "warehouseId", "warehouseName", "warehouseCode", "quantity", "updatedAt"]` (12 keys) | `[..., "costPrice", ...]` (13 keys) | **`'costPrice' in staffInventory === false`** |

- **Conclusion:** Sensitive financial figures (`stockValue`, `costPrice`) are not masked client-side by CSS or display filters; they are strictly stripped at the serialization/service layer on the backend before the response body leaves the server.
- **Pass/Fail:** **PASS**

---

## Conclusion

All 8 steps of Task 1 have completed with passing results against the real MySQL database (`inventory_db`) and real backend REST services. Zero mock data, zero simulated responses, and zero destructive database modifications occurred. Raw evidence JSON is persisted at `docs/test-evidence/demo_flow_raw_evidence.json`.

# Retail Inventory Management System (RIMS) - API Contract

This document provides the definitive specification and operational contract for the RIMS REST API. It serves as the primary technical interface for frontend development, automated testing, and third-party integrations.

---

## 1. Global Architecture & Protocols

### 1.1 Base URL
```
http://localhost:5000/api
```
All routes are prefixed with `/api`. Cross-Origin Resource Sharing (CORS) is enabled with support for credentials.

### 1.2 Authentication & Session Flow
- **Mechanism:** Stateless JSON Web Tokens (JWT) passed via the standard HTTP `Authorization` header:
  ```http
  Authorization: Bearer <jwt-token>
  ```
- **Login Endpoint:** `POST /api/auth/login` returns a signed JWT valid for 8 hours along with the authenticated user profile.
- **Login Rate Limiting (BR-01):** Maximum 10 login attempts per 15-minute window per IP address. Exceeding this limit returns HTTP `429 Too Many Requests`.
- **Session Termination (Logout):** The client discards the stored JWT from browser storage (localStorage / memory). Subsequent calls verify the user's active status via `GET /api/auth/me`.

### 1.3 Standard Response Envelope
All API endpoints adhere strictly to standardized JSON response envelopes.

#### Success Envelope
```json
{
  "success": true,
  "data": { ... }
}
```

#### Paginated Success Envelope
```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 56,
    "totalPages": 3
  }
}
```

#### Error Envelope
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable error description",
    "details": [
      {
        "target": "body",
        "field": "quantity",
        "message": "Quantity must be greater than 0"
      }
    ]
  }
}
```

### 1.4 Standard HTTP Status Codes
| Code | Name | Usage |
|---|---|---|
| `200` | OK | Successful retrieval, update, or soft-deletion. |
| `201` | Created | Successful entity creation. |
| `400` | Bad Request | Joi validation failure, missing required fields, or illegal immutable updates (e.g. altering SKU). |
| `401` | Unauthorized | Missing, invalid, or expired JWT token; bad credentials; deactivated account. |
| `403` | Forbidden | Insufficient role permissions (RBAC); last-admin protection; self-deactivation attempt. |
| `404` | Not Found | Resource does not exist; inactive resource requested by Staff. |
| `409` | Conflict | Duplicate unique key collision (email, code); illegal state machine transition; double-receive / double-fulfill guard. |
| `422` | Unprocessable Entity | Business rule violation (e.g. insufficient physical stock, referencing inactive supplier/warehouse). |
| `429` | Too Many Requests | Rate limit threshold exceeded. |
| `500` | Internal Server Error | Unhandled server exception. |

---

## 2. Enums and Global Data Types

### 2.1 User Roles (`role`)
- `admin`: Full system access, user administration, warehouse management, system configuration.
- `manager`: Operational management, products, warehouses (read-only), suppliers, purchase orders, sales orders, stock movements.
- `staff`: Frontline inventory operations, viewing active catalog, checking availability, creating draft sales orders, confirming and fulfilling sales orders. Cannot view product cost prices (`costPrice`) or dashboard stock valuation (`stockValue`).

### 2.2 Movement Types (`movement_type`)
- `in`: Inbound physical stock receipt (e.g., PO receipt, manual inward).
- `out`: Outbound stock dispatch (e.g., sales order fulfillment, scrap).
- `transfer`: Inter-warehouse stock redistribution.
- `adjustment`: Reconciliation delta resulting from cycle counts or physical stock audits.

### 2.3 Reference Types (`reference_type`)
- `po`: Linked to Purchase Order.
- `so`: Linked to Sales Order.
- `adjustment`: Stock count adjustment.
- `transfer`: Warehouse stock transfer.

### 2.4 Purchase Order Statuses (`status`)
- `draft`: Initial order editable by Admin/Manager. No stock affected.
- `ordered`: Order committed with supplier. Awaiting receipt.
- `received`: Inventory physically received and posted to warehouse stock. Terminal state.
- `cancelled`: Order cancelled. No stock affected. Terminal state.

### 2.5 Sales Order Statuses (`status`)
- `draft`: Initial customer order. Created by any role. No stock affected.
- `confirmed`: Order verified and allocated. Awaiting dispatch.
- `fulfilled`: Goods physically dispatched; stock atomically decremented. Terminal state.
- `cancelled`: Order cancelled (Admin/Manager only). No stock affected. Terminal state.

---

## 3. Order State Machines

### 3.1 Purchase Order Lifecycle
```
[draft] ------ (PUT /api/purchase-orders/:id) -------> [draft] (Items/Supplier/Warehouse modified)
   |
   +---------- (PATCH /api/purchase-orders/:id/status { status: 'ordered' }) --------> [ordered]
   |                                                                                      |
   +---------- (POST /api/purchase-orders/:id/cancel) --------> [cancelled]              |
                                                                   ^                      |
                                                                   |                      |
                                                                   +-- (cancel) ----------+
                                                                                          |
                                                                                          v
                                                              (POST /:id/receive) -> [received] (Stock +)
```

| Current Status | Target Status | Endpoint | Allowed Roles | Stock Effect | Guard / Failure Case |
|---|---|---|---|---|---|
| `draft` | `ordered` | `PATCH /api/purchase-orders/:id/status` | admin, manager | None | Returns 409 if already ordered/received/cancelled |
| `ordered` | `received` | `POST /api/purchase-orders/:id/receive` | admin, manager | Increments `stock_levels.quantity` | Returns 409 if not in `ordered` status; atomic transaction rollback |
| `draft` | `cancelled` | `POST /api/purchase-orders/:id/cancel` | admin, manager | None | Returns 409 if received |
| `ordered` | `cancelled` | `POST /api/purchase-orders/:id/cancel` | admin, manager | None | Returns 409 if received |
| `received` | *any* | *any* | - | Blocked | Terminal state. Returns 409 Conflict |
| `cancelled` | *any* | *any* | - | Blocked | Terminal state. Returns 409 Conflict |

### 3.2 Sales Order Lifecycle
```
[draft] ------ (POST /api/sales-orders/:id/confirm) -------> [confirmed]
   |                                                             |
   +---------- (POST /api/sales-orders/:id/cancel) ----+         |
                                                       |         |
                                                       v         v
                                                  [cancelled]  (POST /:id/fulfill) -> [fulfilled] (Stock -)
```

| Current Status | Target Status | Endpoint | Allowed Roles | Stock Effect | Guard / Failure Case |
|---|---|---|---|---|---|
| `draft` | `confirmed` | `POST /api/sales-orders/:id/confirm` | admin, manager, staff | None | Returns 409 if already confirmed/fulfilled/cancelled |
| `confirmed` | `fulfilled` | `POST /api/sales-orders/:id/fulfill` | admin, manager, staff | Decrements `stock_levels.quantity` | Returns 422 if insufficient stock; 409 on double-fulfill |
| `draft` | `cancelled` | `POST /api/sales-orders/:id/cancel` | admin, manager | None | Staff receive 403 Forbidden; 409 if fulfilled |
| `confirmed` | `cancelled` | `POST /api/sales-orders/:id/cancel` | admin, manager | None | Staff receive 403 Forbidden; 409 if fulfilled |
| `fulfilled` | *any* | *any* | - | Blocked | Terminal state. Returns 409 Conflict |
| `cancelled` | *any* | *any* | - | Blocked | Terminal state. Returns 409 Conflict |

---

## 4. Module & Endpoint Specifications

### Module 0: Foundation & Health
#### `GET /api/health`
- **Roles:** Public
- **Description:** Verifies database connectivity and server uptime.
- **Success Response (200):**
  ```json
  {
    "success": true,
    "data": {
      "status": "UP",
      "database": "CONNECTED",
      "environment": "development"
    }
  }
  ```

---

### Module 1: Authentication & User Management
#### `POST /api/auth/login` (UC-01)
- **Roles:** Public (Rate limited: 10/15min)
- **Body:** `{ "email": string, "password": string }`
- **Success Response (200):**
  ```json
  {
    "success": true,
    "data": {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "user": {
        "id": 1,
        "name": "System Administrator",
        "email": "admin@mygodown.com",
        "role": "admin",
        "isActive": true
      }
    }
  }
  ```
- **Error Cases:** 400 Validation Error, 401 Invalid Credentials, 401 Account Deactivated, 429 Rate Limit Exceeded.

#### `GET /api/auth/me` (UC-02)
- **Roles:** Authenticated (admin, manager, staff)
- **Success Response (200):** Returns current user's profile object without password.

#### `POST /api/auth/change-password` (UC-03)
- **Roles:** Authenticated (admin, manager, staff)
- **Body:** `{ "currentPassword": string, "newPassword": string }`
- **Validation:** `newPassword` minimum 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character.
- **Success Response (200):** `{ "success": true, "data": { "message": "Password updated successfully" } }`

#### `POST /api/users` (UC-04)
- **Roles:** `admin` only
- **Body:** `{ "name": string, "email": string, "password": string, "role": "admin"|"manager"|"staff" }`
- **Success Response (201):** Created user profile without password hash.

#### `GET /api/users` (UC-05)
- **Roles:** `admin` only
- **Query:** `page`, `limit`, `role`, `isActive`, `search`
- **Success Response (200):** Paginated array of user objects.

#### `GET /api/users/:id` (UC-05)
- **Roles:** `admin` only
- **Success Response (200):** Single user object. 404 if not found.

#### `PUT /api/users/:id` (UC-06)
- **Roles:** `admin` only
- **Body:** `{ "name"?: string, "role"?: string, "isActive"?: boolean }`
- **Guards:** Cannot deactivate own account (403); cannot demote own role (403); cannot deactivate or demote the last remaining active admin (403).

#### `DELETE /api/users/:id` (UC-06)
- **Roles:** `admin` only
- **Description:** Soft-deactivates user (`is_active = 0`). Cannot delete self or last admin (403).

#### `POST /api/users/:id/reset-password` (UC-P02)
- **Roles:** `admin` only
- **Body:** `{ "password": string }`
- **Success Response (200):** `{ "success": true, "data": { "message": "Password reset successfully" } }`

---

### Module 2: Product Management
#### `POST /api/products` (UC-07)
- **Roles:** `admin`, `manager`
- **Body:** `{ "name": string, "sku": string, "category": string, "unitPrice": number, "costPrice": number, "reorderLevel"?: number, "supplierId"?: number }`
- **Guards:** SKU unique across system (409 Conflict); supplier must be active (422).

#### `GET /api/products` (UC-08)
- **Roles:** `admin`, `manager`, `staff`
- **Query:** `page`, `limit`, `search`, `category`, `supplierId`, `isActive`
- **BR-05 Data Masking:** `costPrice` is omitted from every product item if requester is `staff`.
- **Visibility:** Inactive products hidden from `staff`.

#### `GET /api/products/:id` (UC-08)
- **Roles:** `admin`, `manager`, `staff`
- **BR-05 Data Masking:** `costPrice` omitted for `staff`. Inactive product returns 404 for `staff`.

#### `PUT /api/products/:id` (UC-09)
- **Roles:** `admin`, `manager`
- **Guards:** Product `sku` is strictly immutable. If `sku` differs from existing SKU, returns 400 Bad Request.

#### `DELETE /api/products/:id` (UC-10)
- **Roles:** `admin`, `manager`
- **Description:** Soft-deactivates product (`isActive = false`). Remaining inventory stock balance is returned in the response for operational notice.

---

### Module 3: Warehouse Management
#### `POST /api/warehouses` (UC-11)
- **Roles:** `admin` only
- **Body:** `{ "name": string, "code": string, "city": string, "address"?: string }`
- **Validation:** `code` pattern `^[A-Za-z0-9_-]+$`, stored uppercase. Unique (409).

#### `GET /api/warehouses` (UC-12)
- **Roles:** `admin`, `manager`, `staff`
- **Query:** `page`, `limit`, `search`, `city`, `isActive`
- **Returns:** Includes computed `totalStock` units and `productCount` distinct products. Inactive warehouses hidden from `staff`.

#### `GET /api/warehouses/:id` (UC-12)
- **Roles:** `admin`, `manager`, `staff`
- **Returns:** Warehouse details with `stockSummary` breakdown. Inactive warehouse returns 404 for `staff`.

#### `PUT /api/warehouses/:id` (UC-13)
- **Roles:** `admin` only
- **Guards:** Warehouse `code` is immutable after creation. Changing code returns 400 Bad Request.

#### `DELETE /api/warehouses/:id` (UC-13)
- **Roles:** `admin` only
- **BR-08 Stock Guard:** Deactivation is rejected with HTTP `422 Unprocessable Entity` if warehouse holds any physical inventory (`totalStock > 0`).

---

### Module 4: Inventory & Stock Movements
#### `GET /api/inventory` (UC-14)
- **Roles:** `admin`, `manager`, `staff`
- **Query:** `page`, `limit`, `warehouseId`, `productId`, `category`, `search`
- **BR-05 Masking:** `costPrice` omitted for `staff`.

#### `GET /api/inventory/availability` (UC-15)
- **Roles:** `admin`, `manager`, `staff`
- **Query:** `productId` (required), `warehouseId` (optional), `quantity` (optional)
- **Returns:** Total available units across warehouses, warehouse breakdown, and boolean `isAvailable` if `quantity` was specified.

#### `POST /api/inventory/movements` (UC-16)
- **Roles:** `admin`, `manager`
- **Body:** `{ "productId": number, "warehouseId": number, "movementType": "in"|"out", "quantity": number, "reference"?: string }`
- **Guards:** Cannot reduce stock below 0 (422 Insufficient Stock).

#### `POST /api/inventory/adjust` (UC-17)
- **Roles:** `admin`, `manager`
- **Body:** `{ "productId": number, "warehouseId": number, "countedQuantity": number, "reason": string }`
- **Description:** Reconciles physical count. Records signed delta as `adjustment` movement. `reason` is required (400 if missing).

#### `POST /api/inventory/transfer` (UC-18)
- **Roles:** `admin`, `manager`
- **Body:** `{ "productId": number, "fromWarehouseId": number, "toWarehouseId": number, "quantity": number, "reason"?: string }`
- **Guards:** Source and destination cannot be identical (400). Both warehouses must be active (422). Atomic row locks ordered by ID to eliminate deadlocks.

#### `GET /api/inventory/movements` (UC-19)
- **Roles:** `admin`, `manager`, `staff`
- **Query:** `page`, `limit`, `productId`, `warehouseId`, `type`, `startDate`, `endDate`, `search`
- **Returns:** Paginated historical movement ledger ordered newest first (`createdAt DESC, id DESC`).

#### `GET /api/inventory/low-stock` (UC-20)
- **Roles:** `admin`, `manager`, `staff`
- **Description:** Lists all `(product, warehouse)` instances where `quantity <= reorderLevel`. Returns `deficit`. Cost price hidden from `staff`.

---

### Module 5: Supplier Management
#### `POST /api/suppliers` (UC-21)
- **Roles:** `admin`, `manager`
- **Body:** `{ "name": string, "contactName"?: string, "email": string, "phone"?: string, "address"?: string }`
- **Rules:** Duplicate supplier names allowed. Email uniqueness enforced at application level (409).

#### `GET /api/suppliers` (UC-22)
- **Roles:** `admin`, `manager`, `staff`
- **Query:** `page`, `limit`, `search`, `isActive`
- **Returns:** Includes `productCount`. Inactive suppliers hidden from `staff`.

#### `GET /api/suppliers/:id` (UC-22)
- **Roles:** `admin`, `manager`, `staff`
- **Returns:** Supplier details with `productCount`. Inactive supplier returns 404 for `staff`.

#### `PUT /api/suppliers/:id` (UC-23)
- **Roles:** `admin`, `manager`
- **Guards:** Email uniqueness checked against other suppliers (409).

#### `DELETE /api/suppliers/:id` (UC-24)
- **Roles:** `admin`, `manager`
- **BR-07 Open PO Guard:** Deactivation is rejected with HTTP `422 Unprocessable Entity` if supplier has any open purchase orders (`draft` or `ordered`).

---

### Module 6: Purchase Order Management
#### `POST /api/purchase-orders` (UC-25)
- **Roles:** `admin`, `manager`
- **Body:**
  ```json
  {
    "supplierId": 1,
    "warehouseId": 1,
    "expectedDeliveryDate": "2026-10-15",
    "notes": "Q4 restocking",
    "items": [
      { "productId": 1, "quantity": 10, "unitCost": 25.50 },
      { "productId": 2, "quantity": 5 }
    ]
  }
  ```
- **Rules:**
  - Auto-generates collision-safe `poNumber` (pattern: `PO-YYYYMMDD-XXXX`).
  - `unitCost` defaults to product's catalog `costPrice` if omitted.
  - Duplicate line items for same `productId` are merged by summing quantities.
  - Server auto-calculates `totalAmount`.
  - Rejects inactive supplier, warehouse, or products (422).

#### `GET /api/purchase-orders` (UC-26)
- **Roles:** `admin`, `manager` (Staff forbidden: 403)
- **Query:** `page`, `limit`, `status`, `warehouseId`, `supplierId`, `search`
- **Returns:** Paginated PO list with resolved supplier and warehouse names.

#### `GET /api/purchase-orders/:id` (UC-26)
- **Roles:** `admin`, `manager` (Staff forbidden: 403)
- **Returns:** Full PO record with line items, unit costs, and calculated line subtotals.

#### `PUT /api/purchase-orders/:id` (UC-P08)
- **Roles:** `admin`, `manager` (Staff forbidden: 403)
- **Body:** `{ "supplierId"?: number, "warehouseId"?: number, "expectedDeliveryDate"?: string, "notes"?: string, "items"?: array }`
- **Guards:** Only allowed when `status = 'draft'`. Any other status returns HTTP `409 Conflict`. Recalculates total and re-merges duplicate items.

#### `PATCH /api/purchase-orders/:id/status` (UC-27)
- **Roles:** `admin`, `manager`
- **Body:** `{ "status": "ordered" }`
- **Guards:** Transitions `draft` -> `ordered`. Returns 409 Conflict on invalid transitions.

#### `POST /api/purchase-orders/:id/receive` (UC-27)
- **Roles:** `admin`, `manager`
- **Guards:** PO must be in `ordered` status (409 Conflict if `draft`, `received`, or `cancelled`).
- **Atomicity:** In ONE ACID database transaction: updates PO status to `received`, increments physical warehouse stock for all items, and records `in` stock movements with `reference_type = 'po'`. Double-receive is impossible.

#### `POST /api/purchase-orders/:id/cancel` (UC-27)
- **Roles:** `admin`, `manager`
- **Guards:** Cannot cancel an already `received` PO (409 Conflict). Leaves stock untouched.

---

### Module 7: Sales Order Management
#### `POST /api/sales-orders` (UC-28)
- **Roles:** `admin`, `manager`, `staff`
- **Body:**
  ```json
  {
    "customerName": "Acme Retail Chain",
    "warehouseId": 1,
    "notes": "Expedited dispatch",
    "items": [
      { "productId": 1, "quantity": 5, "unitPrice": 35.00 },
      { "productId": 2, "quantity": 2 }
    ]
  }
  ```
- **Rules:**
  - Auto-generates collision-safe `soNumber` (pattern: `SO-YYYYMMDD-XXXX`).
  - `unitPrice` defaults to product's catalog `unitPrice` (selling price) if omitted.
  - Duplicate line items for same `productId` are merged by summing quantities.
  - Server auto-calculates `totalAmount`.
  - Rejects inactive warehouse or products (422).

#### `GET /api/sales-orders` (UC-29)
- **Roles:** `admin`, `manager`, `staff`
- **Query:** `page`, `limit`, `status`, `warehouseId`, `customerName`, `search`
- **Returns:** Paginated SO list with warehouse names and item counts.

#### `GET /api/sales-orders/:id` (UC-29)
- **Roles:** `admin`, `manager`, `staff`
- **Returns:** Full SO record with line items, unit prices, and line subtotals.

#### `POST /api/sales-orders/:id/confirm` (UC-30)
- **Roles:** `admin`, `manager`, `staff`
- **Guards:** Transitions `draft` -> `confirmed`. Returns 409 Conflict if already confirmed/fulfilled/cancelled. Stock remains untouched.

#### `POST /api/sales-orders/:id/fulfill` (UC-30)
- **Roles:** `admin`, `manager`, `staff`
- **Guards:** SO must be in `confirmed` status (409 Conflict if `draft`, `fulfilled`, or `cancelled`).
- **Shortage Atomicity Guard:** If ANY item lacks sufficient physical stock in the warehouse, the entire operation is rejected with HTTP `422 Unprocessable Entity` (`InsufficientStockError`), rolling back completely with ZERO partial deductions.
- **Atomicity:** In ONE transaction: updates SO status to `fulfilled`, decrements physical stock for all items, and writes `out` movements. Double-fulfillment is blocked.

#### `POST /api/sales-orders/:id/cancel` (UC-30)
- **Roles:** `admin`, `manager` only (**Staff receives 403 Forbidden**)
- **Guards:** Cannot cancel an already `fulfilled` SO (409 Conflict). Leaves stock untouched.

---

### Module 8: Dashboard Summary
#### `GET /api/dashboard/summary` (UC-32)
- **Roles:** `admin`, `manager`, `staff`
- **Description:** Aggregates operational KPIs and real-time inventory metrics across the enterprise.
- **BR-05 Financial Masking:**
  - `admin` and `manager` receive full metrics including `stockValue`.
  - `staff` users have `stockValue` **STRICTLY OMITTED** from the JSON response object (the key does not exist).
- **Returned Metrics:**
  - `totalActiveProducts` (number)
  - `totalStockUnits` (number)
  - `stockValue` (number, admin/manager only)
  - `lowStockCount` (number, locations at or below reorder level)
  - `openPurchaseOrders` (number, status in `draft`, `ordered`)
  - `openSalesOrders` (number, status in `draft`, `confirmed`)
  - `stockByWarehouse` (array of `{ warehouseId, warehouseName, warehouseCode, totalUnits }`)
  - `recentMovements` (latest 10 movements ordered newest first)

---

## 5. Frontend Integration Notes & Practical Guidelines

1. **Role-Based UI Rendering & Data Masking:**
   - **Financial Visibility (BR-05):** Always inspect `user.role` from auth state. Hide stock value cards, product cost price columns, and PO line unit costs when `role === 'staff'`. The backend strips these fields, so frontend code must never assume `stockValue` or `costPrice` are present.
   - **Sales Order Cancellation:** Hide the "Cancel Order" button for Staff users, as attempting cancellation returns HTTP `403 Forbidden`.
   - **Purchase Orders:** Staff users have zero access to `/api/purchase-orders` (HTTP 403). The navigation menu for PO management must be hidden for staff.

2. **Confirmation Dialogs Required:**
   The frontend should require explicit user confirmation modals before triggering:
   - Soft-deactivating any user, product, warehouse, or supplier.
   - Cancelling a Purchase Order or Sales Order.
   - Fulfilling a Sales Order (irreversible stock deduction).
   - Receiving a Purchase Order (irreversible stock addition).
   - Stock adjustments (modifies perpetual ledger balance).

3. **Server-Computed Fields (Do Not Calculate on Client):**
   - **Order Totals:** Do not compute or submit `totalAmount`. The server computes `totalAmount = SUM(quantity * price)` directly from verified line items.
   - **Order Numbers:** Do not supply `poNumber` or `soNumber`. The server auto-generates sequential, collision-safe identifiers.
   - **Line Subtotals:** `subtotal` is returned by the server on single order lookups.

4. **Immutable Fields:**
   - Product `sku` is immutable upon creation. Render SKU as read-only / disabled in product edit forms.
   - Warehouse `code` is immutable upon creation. Render Code as read-only in warehouse edit forms.

5. **Optimistic Locking & Concurrency Feedback:**
   - If an order has already been received or fulfilled, the backend responds with HTTP `409 Conflict`. Catch 409 responses and notify the user with a toast: *"This order has already been updated by another user. Refreshing current state..."*

---

## 6. Live-Verified API Response Examples

The following real payloads were captured directly from the running RIMS backend server:

### Example 1: `GET /api/health`
```json
{
  "success": true,
  "data": {
    "status": "UP",
    "database": "CONNECTED",
    "environment": "development"
  }
}
```

### Example 2: `POST /api/auth/login` (Admin Authentication)
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "name": "System Administrator",
      "email": "admin@mygodown.com",
      "role": "admin",
      "isActive": true
    }
  }
}
```

### Example 3: `GET /api/auth/me` (Profile Verification)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "System Administrator",
    "email": "admin@mygodown.com",
    "role": "admin",
    "isActive": true,
    "createdAt": "2026-09-29 08:34:01",
    "updatedAt": "2026-09-29 08:34:01"
  }
}
```

### Example 4: `GET /api/users?page=1&limit=2` (Admin User Administration)
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "System Administrator",
      "email": "admin@mygodown.com",
      "role": "admin",
      "isActive": true,
      "createdAt": "2026-09-29 08:34:01",
      "updatedAt": "2026-09-29 08:34:01"
    },
    {
      "id": 2,
      "name": "Warehouse Manager",
      "email": "manager@mygodown.com",
      "role": "manager",
      "isActive": true,
      "createdAt": "2026-09-29 08:34:01",
      "updatedAt": "2026-09-29 08:34:01"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 2,
    "total": 12,
    "totalPages": 6
  }
}
```

### Example 5: `GET /api/products?page=1&limit=2` (Manager View - with `costPrice`)
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "sku": "PROD-ELEC-001",
      "name": "Ergonomic Wireless Mouse",
      "category": "Electronics",
      "unitPrice": 49.99,
      "costPrice": 22.5,
      "reorderLevel": 30,
      "supplierId": 1,
      "supplierName": "TechSource Logistics",
      "isActive": true,
      "totalStock": 120,
      "createdAt": "2026-09-29 08:34:01",
      "updatedAt": "2026-09-29 08:34:01"
    },
    {
      "id": 2,
      "sku": "PROD-ELEC-002",
      "name": "Mechanical Keyboard RGB",
      "category": "Electronics",
      "unitPrice": 89.99,
      "costPrice": 45,
      "reorderLevel": 20,
      "supplierId": 1,
      "supplierName": "TechSource Logistics",
      "isActive": true,
      "totalStock": 80,
      "createdAt": "2026-09-29 08:34:01",
      "updatedAt": "2026-09-29 08:34:01"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 2,
    "total": 20,
    "totalPages": 10
  }
}
```

### Example 6: `GET /api/products?page=1&limit=2` (Staff View - `costPrice` Omitted)
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "sku": "PROD-ELEC-001",
      "name": "Ergonomic Wireless Mouse",
      "category": "Electronics",
      "unitPrice": 49.99,
      "reorderLevel": 30,
      "supplierId": 1,
      "supplierName": "TechSource Logistics",
      "isActive": true,
      "totalStock": 120,
      "createdAt": "2026-09-29 08:34:01",
      "updatedAt": "2026-09-29 08:34:01"
    },
    {
      "id": 2,
      "sku": "PROD-ELEC-002",
      "name": "Mechanical Keyboard RGB",
      "category": "Electronics",
      "unitPrice": 89.99,
      "reorderLevel": 20,
      "supplierId": 1,
      "supplierName": "TechSource Logistics",
      "isActive": true,
      "totalStock": 80,
      "createdAt": "2026-09-29 08:34:01",
      "updatedAt": "2026-09-29 08:34:01"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 2,
    "total": 20,
    "totalPages": 10
  }
}
```

### Example 7: `GET /api/warehouses?page=1&limit=2`
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Central Logistics Hub",
      "code": "WH-CENTRAL",
      "address": "100 Industrial Parkway",
      "city": "Chicago",
      "isActive": true,
      "totalStock": 1289,
      "productCount": 20,
      "createdAt": "2026-09-29 08:34:01",
      "updatedAt": "2026-09-29 08:34:01"
    },
    {
      "id": 2,
      "name": "East Coast Distribution Center",
      "code": "WH-EAST",
      "address": "45 Harbor Road",
      "city": "Newark",
      "isActive": true,
      "totalStock": 318,
      "productCount": 9,
      "createdAt": "2026-09-29 08:34:01",
      "updatedAt": "2026-09-29 08:34:01"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 2,
    "total": 3,
    "totalPages": 2
  }
}
```

### Example 8: `GET /api/inventory/availability?productId=1&quantity=10`
```json
{
  "success": true,
  "data": {
    "productId": 1,
    "totalQuantity": 120,
    "warehouses": [
      {
        "warehouseId": 1,
        "warehouseName": "Central Logistics Hub",
        "warehouseCode": "WH-CENTRAL",
        "quantity": 85
      },
      {
        "warehouseId": 2,
        "warehouseName": "East Coast Distribution Center",
        "warehouseCode": "WH-EAST",
        "quantity": 35
      }
    ],
    "requestedQuantity": 10,
    "isAvailable": true
  }
}
```

### Example 9: `GET /api/inventory/low-stock?page=1&limit=2`
```json
{
  "success": true,
  "data": [
    {
      "id": 25,
      "productId": 17,
      "sku": "PROD-HOME-005",
      "productName": "Aroma Diffuser Ultrasonic",
      "category": "Home & Kitchen",
      "unitPrice": 39.99,
      "costPrice": 16,
      "reorderLevel": 25,
      "supplierId": 4,
      "supplierName": "Apex Supply Partners",
      "warehouseId": 2,
      "warehouseName": "East Coast Distribution Center",
      "warehouseCode": "WH-EAST",
      "quantity": 18,
      "deficit": 7,
      "updatedAt": "2026-09-29 08:34:01"
    },
    {
      "id": 24,
      "productId": 14,
      "sku": "PROD-HOME-002",
      "productName": "Cast Iron Skillet 12-inch",
      "category": "Home & Kitchen",
      "unitPrice": 49.99,
      "costPrice": 22,
      "reorderLevel": 20,
      "supplierId": 4,
      "supplierName": "Apex Supply Partners",
      "warehouseId": 2,
      "warehouseName": "East Coast Distribution Center",
      "warehouseCode": "WH-EAST",
      "quantity": 15,
      "deficit": 5,
      "updatedAt": "2026-09-29 08:34:01"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 2,
    "total": 4,
    "totalPages": 2
  }
}
```

### Example 10: `GET /api/dashboard/summary` (Admin View - with `stockValue`)
```json
{
  "success": true,
  "data": {
    "totalActiveProducts": 20,
    "totalStockUnits": 1897,
    "stockValue": 47407,
    "lowStockCount": 4,
    "openPurchaseOrders": 0,
    "openSalesOrders": 0,
    "stockByWarehouse": [
      {
        "warehouseId": 1,
        "warehouseName": "Central Logistics Hub",
        "warehouseCode": "WH-CENTRAL",
        "totalUnits": 1289
      },
      {
        "warehouseId": 2,
        "warehouseName": "East Coast Distribution Center",
        "warehouseCode": "WH-EAST",
        "totalUnits": 318
      },
      {
        "warehouseId": 3,
        "warehouseName": "West Coast Fulfillment Center",
        "warehouseCode": "WH-WEST",
        "totalUnits": 290
      }
    ],
    "recentMovements": [ ... ]
  }
}
```

### Example 11: `GET /api/dashboard/summary` (Staff View - `stockValue` Strictly Omitted)
```json
{
  "success": true,
  "data": {
    "totalActiveProducts": 20,
    "totalStockUnits": 1897,
    "lowStockCount": 4,
    "openPurchaseOrders": 0,
    "openSalesOrders": 0,
    "stockByWarehouse": [
      {
        "warehouseId": 1,
        "warehouseName": "Central Logistics Hub",
        "warehouseCode": "WH-CENTRAL",
        "totalUnits": 1289
      },
      {
        "warehouseId": 2,
        "warehouseName": "East Coast Distribution Center",
        "warehouseCode": "WH-EAST",
        "totalUnits": 318
      },
      {
        "warehouseId": 3,
        "warehouseName": "West Coast Fulfillment Center",
        "warehouseCode": "WH-WEST",
        "totalUnits": 290
      }
    ],
    "recentMovements": [ ... ]
  }
}
```

### Example 12: `POST /api/auth/login` (400 Bad Request - Validation Error)
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "target": "body",
        "field": "email",
        "message": "Email is required"
      },
      {
        "target": "body",
        "field": "password",
        "message": "Password is required"
      }
    ]
  }
}
```

### Example 13: `GET /api/dashboard/summary` (401 Unauthorized - Missing Token)
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication token is required"
  }
}
```

### Example 14: `GET /api/users` (403 Forbidden - Staff Accessing Admin Endpoint)
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied: required role admin"
  }
}
```

### Example 15: `GET /api/non-existent-route` (404 Not Found Envelope)
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Endpoint not found: GET /api/non-existent-route"
  }
}
```

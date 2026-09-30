# Phase 4 — Task 2: Dual UI & API Role Matrix Evidence

**Execution Date:** 2026-09-30  
**Environment:** Local Development Stack (`http://localhost:5000/api`, Vite dev server on `http://localhost:5173`)  
**Database:** `inventory_db` (Live MySQL 9.7.1)  
**Raw Evidence JSON:** [`docs/test-evidence/role_matrix_raw.json`](file:///C:/Users/prtv1/OneDrive/Attachments/Desktop/HCL%20Tech/docs/test-evidence/role_matrix_raw.json)  

---

## 1. Role Matrix Overview

This test suite executes a comprehensive dual-layer verification of role boundaries across the three system roles:
- **System Administrator (`admin`):** Full system governance, user administration, system-wide configuration, and warehouse facility management.
- **Warehouse Manager (`manager`):** Operational management across products, suppliers, inventory adjustments/transfers, purchase orders, sales order cancellations, and full financial visibility (`costPrice`, `stockValue`). Restricted from user administration and warehouse facility CRUD.
- **Inventory Staff (`staff`):** Frontline operations. Authorized for stock browsing, availability inquiries, creating sales orders, confirming sales orders, and fulfilling sales orders. **Restricted from:** user administration, catalog management (products/warehouses/suppliers CRUD), inventory adjustments/transfers, purchase orders, sales order cancellations, and financial visibility (cost prices & stock valuation strictly masked per BR-05).

---

## 2. Comprehensive Dual UI & API Matrix

| Module & Action | Admin API (Exp / Act) | Manager API (Exp / Act) | Staff API (Exp / Act) | Admin UI Behavior | Manager UI Behavior | Staff UI Behavior | UI/API Match? |
|---|---|---|---|---|---|---|---|
| **Users: List / View** (`GET /api/users`) | `200` / `200` | `403` / `403` | `403` / `403` | Nav item visible; DataGrid rendered | Nav item hidden; direct URL `/users` redirects to `/access-denied` | Nav item hidden; direct URL `/users` redirects to `/access-denied` | **MATCH** |
| **Users: Create** (`POST /api/users`) | `201` / `201` | `403` / `403` | `403` / `403` | "Add User" button active, dialog opens | Module blocked at route & API | Module blocked at route & API | **MATCH** |
| **Users: Edit** (`PUT /api/users/:id`) | `200` / `200` | `403` / `403` | `403` / `403` | Edit action in row actions active | Module blocked at route & API | Module blocked at route & API | **MATCH** |
| **Users: Reset Password** (`POST /api/users/:id/reset-password`) | `200` / `200` | `403` / `403` | `403` / `403` | Reset Password action in menu active | Module blocked at route & API | Module blocked at route & API | **MATCH** |
| **Users: Deactivate** (`DELETE /api/users/:id`) | `200` / `200` | `403` / `403` | `403` / `403` | Deactivate action with confirmation active | Module blocked at route & API | Module blocked at route & API | **MATCH** |
| **Auth: Change Own Password** (`POST /api/auth/change-password`) | `200` / `200` | `200` / `200` | `200` / `200` | Available in User Menu for all | Available in User Menu for all | Available in User Menu for all | **MATCH** |
| **Products: Create** (`POST /api/products`) | `201` / `201` | `201` / `201` | `403` / `403` | "Add Product" button visible & active | "Add Product" button visible & active | Button hidden/disabled; API rejects with 403 | **MATCH** |
| **Products: Edit** (`PUT /api/products/:id`) | `200` / `200` | `200` / `200` | `403` / `403` | Edit row action visible & active | Edit row action visible & active | Edit action hidden; API rejects with 403 | **MATCH** |
| **Products: Deactivate** (`DELETE /api/products/:id`) | `200` / `200` | `200` / `200` | `403` / `403` | Deactivate action visible & active | Deactivate action visible & active | Deactivate action hidden; API rejects with 403 | **MATCH** |
| **Warehouses: Create** (`POST /api/warehouses`) | `201` / `201` | `403` / `403` | `403` / `403` | "Add Warehouse" button visible & active | Button strictly hidden; API rejects with 403 | Button strictly hidden; API rejects with 403 | **MATCH** |
| **Warehouses: Edit** (`PUT /api/warehouses/:id`) | `200` / `200` | `403` / `403` | `403` / `403` | Edit row action visible & active | Action strictly hidden; API rejects with 403 | Action strictly hidden; API rejects with 403 | **MATCH** |
| **Warehouses: Deactivate** (`DELETE /api/warehouses/:id`) | `200` / `200` | `403` / `403` | `403` / `403` | Deactivate row action visible | Action strictly hidden; API rejects with 403 | Action strictly hidden; API rejects with 403 | **MATCH** |
| **Suppliers: Create** (`POST /api/suppliers`) | `201` / `201` | `201` / `201` | `403` / `403` | "Add Supplier" button visible & active | "Add Supplier" button visible & active | Button hidden; API rejects with 403 | **MATCH** |
| **Suppliers: Edit** (`PUT /api/suppliers/:id`) | `200` / `200` | `200` / `200` | `403` / `403` | Edit row action visible & active | Edit row action visible & active | Action hidden; API rejects with 403 | **MATCH** |
| **Suppliers: Deactivate** (`DELETE /api/suppliers/:id`) | `200` / `200` | `200` / `200` | `403` / `403` | Deactivate row action visible | Deactivate row action visible | Action hidden; API rejects with 403 | **MATCH** |
| **Inventory: Adjust Stock** (`POST /api/inventory/adjust`) | `200` / `200` | `200` / `200` | `403` / `403` | Adjust button visible & active | Adjust button visible & active | Action hidden/disabled; API rejects with 403 | **MATCH** |
| **Inventory: Transfer Stock** (`POST /api/inventory/transfer`) | `200` / `200` | `200` / `200` | `403` / `403` | Transfer button visible & active | Transfer button visible & active | Action hidden/disabled; API rejects with 403 | **MATCH** |
| **Purchase Orders: View / List** (`GET /api/purchase-orders`) | `200` / `200` | `200` / `200` | `403` / `403` | Visible in Nav & DataGrid rendered | Visible in Nav & DataGrid rendered | Nav item hidden; direct URL `/purchase-orders` redirects to `/access-denied` | **MATCH** |
| **Purchase Orders: Create** (`POST /api/purchase-orders`) | `201` / `201` | `201` / `201` | `403` / `403` | Create PO dialog active | Create PO dialog active | Module hidden; direct API call returns 403 | **MATCH** |
| **Sales Orders: Create** (`POST /api/sales-orders`) | `201` / `201` | `201` / `201` | `201` / `201` | Create SO button visible & active | Create SO button visible & active | **Create SO button visible & active (Staff verified!)** | **MATCH** |
| **Sales Orders: View / List** (`GET /api/sales-orders`) | `200` / `200` | `200` / `200` | `200` / `200` | Visible in Nav & DataGrid rendered | Visible in Nav & DataGrid rendered | **Visible in Nav & DataGrid rendered (Staff verified!)** | **MATCH** |
| **Sales Orders: Confirm** (`POST /:id/confirm`) | `200` / `200` | `200` / `200` | `200` / `200` | Confirm button visible & active | Confirm button visible & active | **Confirm button visible & active (Staff verified!)** | **MATCH** |
| **Sales Orders: Fulfil** (`POST /:id/fulfill`) | `200` / `200` | `200` / `200` | `200` / `200` | Fulfil button visible & active | Fulfil button visible & active | **Fulfil button visible & active (Staff verified!)** | **MATCH** |
| **Sales Orders: Cancel** (`POST /:id/cancel` & `PATCH /:id/status`) | `200` / `200` | `200` / `200` | `403` / `403` | Cancel button visible & active | Cancel button visible & active | Cancel button strictly hidden/disabled in UI; API rejects both endpoints with 403 | **MATCH** |
| **Dashboard: Summary & Financial Masking (BR-05)** | `200` / `200` | `200` / `200` | `200` / `200` | Stock Value KPI card visible; `stockValue` returned | Stock Value KPI card visible; `stockValue` returned | Stock Value KPI card hidden; `stockValue` strictly omitted from API response | **MATCH** |
| **Unauthenticated Request (No Token)** | `401` / `401` | `401` / `401` | `401` / `401` | Client redirects unauthenticated user to `/login` | Client redirects unauthenticated user to `/login` | Client redirects unauthenticated user to `/login` | **MATCH** |
| **Deactivated User Token** | `401` / `401` | `401` / `401` | `401` / `401` | Session invalidated; rejected on both `/auth/me` and `/inventory` | Session invalidated | Session invalidated | **MATCH** |

---

## 3. Critical Architectural Verifications

### 3.1 Staff Capabilities in Sales Orders (Opposite Gating Shape from Purchase Orders)
- **Purchase Orders:** Strictly gated for `admin` and `manager` only. Staff is completely blocked at both navigation level (hidden nav item, route redirects to `/access-denied`) and API level (`403 Forbidden` on list, getById, create, update, receive, cancel).
- **Sales Orders:** Frontline design allows Staff full participation in the sales lifecycle:
  - `POST /api/sales-orders` (Create): **Staff returned 201 Created**.
  - `GET /api/sales-orders` (List/Detail): **Staff returned 200 OK**.
  - `POST /api/sales-orders/:id/confirm` (Confirm): **Staff returned 200 OK**.
  - `POST /api/sales-orders/:id/fulfill` (Fulfil): **Staff returned 200 OK**.
  - `POST /api/sales-orders/:id/cancel` (Cancel): **Staff returned 403 Forbidden**.
  - `PATCH /api/sales-orders/:id/status` with `status: "cancelled"`: **Staff returned 403 Forbidden**.
- **Conclusion:** Staff genuinely has full operational capabilities to generate and process sales orders, while order cancellation is strictly reserved for Admin and Manager.

### 3.2 Deactivated User Session Invalidation
- A temporary user account was created, logged in to obtain a valid JWT token, and then soft-deactivated via `DELETE /api/users/:id`.
- The existing JWT token was subsequently submitted to:
  1. `GET /api/auth/me`: Returned **HTTP 401 Unauthorized** (`"User account has been deactivated"`).
  2. `GET /api/inventory`: Returned **HTTP 401 Unauthorized** (`"User account has been deactivated"`).
- **Conclusion:** Soft-deactivation immediately revokes token authorization across all protected application endpoints via the authentication middleware database check, without needing token blacklists.

---

## 4. UI/API Mismatches Found

**Total Mismatches Found:** **0**  
Every single backend authorization rule (`2xx` vs `403`) is perfectly mirrored on the frontend by component hiding, button disabling, or route redirection to `/access-denied`.

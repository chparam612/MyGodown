# Traceability & Coverage Matrix

| ID | Use case | Status (Core/Optional/Proposed) | Build state (Not started/Partial/Done) | API route | Files | Test evidence |
|---|---|---|---|---|---|---|
| UC-01 | Login | Core | Not started | `POST /api/auth/login` | - | None |
| UC-02 | Logout | Core | Not started | `POST /api/auth/logout` | - | None |
| UC-03 | Create User | Core | Not started | `POST /api/users` | - | None |
| UC-04 | View Users | Core | Not started | `GET /api/users` | - | None |
| UC-05 | Update User | Core | Not started | `PUT /api/users/:id` | - | None |
| UC-06 | Deactivate User | Core | Not started | `DELETE /api/users/:id` | - | None |
| UC-07 | Add Product | Core | Not started | `POST /api/products` | - | None |
| UC-08 | View and Search Products | Core | Not started | `GET /api/products` | - | None |
| UC-09 | Update Product | Core | Not started | `PUT /api/products/:id` | - | None |
| UC-10 | Deactivate Product | Core | Not started | `DELETE /api/products/:id` | - | None |
| UC-11 | Add Warehouse | Core | Not started | `POST /api/warehouses` | - | None |
| UC-12 | View Warehouses | Core | Not started | `GET /api/warehouses` | - | None |
| UC-13 | Update Warehouse | Core | Not started | `PUT /api/warehouses/:id`, `DELETE /api/warehouses/:id` | - | None |
| UC-14 | View Inventory | Core | Not started | `GET /api/inventory` | - | None |
| UC-15 | Check Stock Availability (internal) | Core | Not started | Internal Service (`withTransaction` / row lock) | - | None |
| UC-16 | Record Stock Movement (internal) | Core | Not started | Internal Service (`withTransaction`) | - | None |
| UC-17 | Adjust Stock | Core | Not started | `POST /api/inventory/adjust` | - | None |
| UC-18 | Transfer Stock | Core | Not started | `POST /api/inventory/transfer` | - | None |
| UC-19 | View Stock Movement History | Core | Not started | `GET /api/inventory/movements` | - | None |
| UC-20 | Monitor Low Stock | Core | Not started | `GET /api/inventory?lowStock=true` | - | None |
| UC-21 | Add Supplier | Core | Not started | `POST /api/suppliers` | - | None |
| UC-22 | View Suppliers | Core | Not started | `GET /api/suppliers` | - | None |
| UC-23 | Update Supplier | Core | Not started | `PUT /api/suppliers/:id` | - | None |
| UC-24 | Deactivate Supplier | Core | Not started | `DELETE /api/suppliers/:id` | - | None |
| UC-25 | Create Purchase Order | Core | Not started | `POST /api/purchase-orders` | - | None |
| UC-26 | View Purchase Orders | Core | Not started | `GET /api/purchase-orders`, `GET /api/purchase-orders/:id` | - | None |
| UC-27 | Receive Purchase Order | Core | Not started | `POST /api/purchase-orders/:id/receive` | - | None |
| UC-28 | Create Sales Order | Core | Not started | `POST /api/sales-orders` | - | None |
| UC-29 | View Sales Orders | Core | Not started | `GET /api/sales-orders`, `GET /api/sales-orders/:id` | - | None |
| UC-30 | Update Sales Order Status | Core | Not started | `PATCH /api/sales-orders/:id/status` | - | None |
| UC-31 | Cancel Sales Order | Optional | Not started | `PATCH /api/sales-orders/:id/status` | - | None |
| UC-32 | View Dashboard Summary | Core | Not started | `GET /api/dashboard/summary` | - | None |
| UC-33 | View Stock Valuation Report | Optional | Not started | `GET /api/reports/stock-valuation` | - | None |
| UC-34 | View Sales Report | Optional | Not started | `GET /api/reports/sales` | - | None |
| UC-35 | View Purchase Report | Optional | Not started | `GET /api/reports/purchases` | - | None |
| UC-P01 | Change Own Password | Proposed | Not started | `POST /api/auth/change-password` | - | None |
| UC-P02 | Reset Forgotten Password | Proposed | Not started | `POST /api/auth/reset-password` | - | None |
| UC-P03 | Manage Product Categories | Proposed | Not started | `POST /api/categories`, `GET /api/categories`, `PUT /api/categories/:id`, `DELETE /api/categories/:id` | - | None |
| UC-P04 | Manage Customers | Proposed | Not started | `POST /api/customers`, `GET /api/customers`, `PUT /api/customers/:id`, `DELETE /api/customers/:id` | - | None |
| UC-P05 | View Customer Purchase History | Proposed | Not started | `GET /api/customers/:id/orders` | - | None |
| UC-P06 | Receive Purchase Order Partially | Proposed | Not started | `POST /api/purchase-orders/:id/receive-partial` | - | None |
| UC-P07 | Cancel Purchase Order | Proposed | Not started | `PATCH /api/purchase-orders/:id/cancel` | - | None |
| UC-P08 | Edit Purchase Order Before Sending | Proposed | Not started | `PUT /api/purchase-orders/:id` | - | None |
| UC-P09 | Approve Stock Transfer | Proposed | Not started | `PATCH /api/inventory/transfers/:id/approve` | - | None |
| UC-P10 | Process Sales Return | Proposed | Not started | `POST /api/sales-returns` | - | None |
| UC-P11 | Generate Invoice (PDF) | Proposed | Not started | `GET /api/sales-orders/:id/invoice` | - | None |
| UC-P12 | Send Low-Stock Notification | Proposed | Not started | Background worker / Email service | - | None |
| UC-P13 | Import Products from CSV | Proposed | Not started | `POST /api/products/import-csv` | - | None |
| UC-P14 | Review Audit Log | Proposed | Not started | `GET /api/audit-logs` | - | None |
| UC-P15 | Customer Self-Service Ordering | Proposed | Not started | Customer portal routes | - | None |
| UC-P16 | Invalidate Session on Logout | Proposed | Not started | `POST /api/auth/logout` | - | None |

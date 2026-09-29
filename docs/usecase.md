# Retail Inventory Management System — Use Cases

## Actors

* **Admin** — Manages users, products, suppliers, inventory, purchases, sales, and reports.
* **Inventory Staff** — Handles stock, suppliers, purchases, and inventory operations.
* **Sales Staff** — Handles sales, customers, and product availability.

---

## Core Use Cases

| ID    | Use Case                 | Actor                   |Description                                                                         |
| ----- | ------------------------ | ------------------------ | -------------------------------------------------------------------------------------------- |
| UC-01 | Login / Logout           | Admin / Staff            | Authenticate users and securely access or exit the system according to their roles.          |
| UC-02 | Manage Users & Roles     | Admin                    | Create, update, deactivate users and assign appropriate roles and permissions.               |
| UC-03 | Manage Products          | Admin / Inventory Staff  | Add, view, update, search, and deactivate products.                                          |
| UC-04 | Manage Categories        | Admin                    | Create, update, view, and deactivate product categories.                                     |
| UC-05 | View Inventory           | Admin / Inventory Staff  | View current stock quantities, product status, and inventory information.                    |
| UC-06 | Adjust Inventory         | Admin / Inventory Staff  | Correct stock quantities and record the reason for manual adjustments.                       |
| UC-07 | Track Stock Movements    | Admin / Inventory Staff  | Track stock increases and decreases caused by purchases, sales, or adjustments.              |
| UC-08 | Manage Suppliers         | Admin / Inventory Staff  | Add, view, update, and manage supplier information.                                          |
| UC-09 | Manage Purchases         | Admin / Inventory Staff  | Create and manage purchase records from suppliers.                                           |
| UC-10 | Receive Stock            | Inventory Staff          | Record received purchases and automatically increase the corresponding inventory.            |
| UC-11 | Process Sales            | Admin / Sales Staff      | Create sales after checking product availability and automatically reduce inventory.         |
| UC-12 | Cancel / Return Sale     | Admin / Authorized Staff | Cancel or return a sale and restore the appropriate inventory quantity.                      |
| UC-13 | Manage Customers         | Admin / Sales Staff      | Add, view, update, and maintain customer information.                                        |
| UC-14 | Search & Filter Products | Admin / Staff            | Find products using SKU, name, category, or other supported filters.                         |
| UC-15 | Monitor Low Stock        | Admin / Inventory Staff  | Identify products whose stock reaches or falls below the reorder threshold.                  |
| UC-16 | View Dashboard           | Admin / Staff            | View important business statistics such as sales, purchases, inventory, and low-stock items. |
| UC-17 | Generate Reports         | Admin / Staff            | View inventory, sales, purchase, and low-stock reports.                                      |

---

## Core Business Flows

### Purchase → Inventory

```text
Create Purchase
      ↓
Receive Stock
      ↓
Increase Inventory
      ↓
Record Stock Movement
```

### Sale → Inventory

```text
Create Sale
      ↓
Check Stock
      ↓
Complete Sale
      ↓
Decrease Inventory
      ↓
Record Stock Movement
```

### Sale Cancellation / Return

```text
Cancel / Return Sale
        ↓
Validate Transaction
        ↓
Restore Inventory
        ↓
Record Stock Movement
```

### Inventory Adjustment

```text
Adjust Stock
      ↓
Update Inventory
      ↓
Record Reason
      ↓
Record Stock Movement
```

---

## Key Business Rules

1. Each product must have a unique SKU.
2. A sale cannot normally exceed available stock.
3. Receiving a purchase increases inventory.
4. Completing a sale decreases inventory.
5. Cancelled/returned sales restore the applicable inventory.
6. Important inventory changes must be traceable through stock movements.
7. Access to operations is controlled by user roles.
8. Products and suppliers with historical transactions should preferably be deactivated instead of permanently deleted.
9. Low-stock products are identified using their configured reorder threshold.
10. Required product, supplier, customer, purchase, and sale information must be validated before saving.

---

## MVP Scope

The initial implementation focuses on:

```text
Authentication
      ↓
Users & Roles
      ↓
Products & Categories
      ↓
Inventory & Stock Movements
      ↓
Suppliers
      ↓
Purchases & Stock Receiving
      ↓
Sales & Returns
      ↓
Customers
      ↓
Low-Stock Monitoring
      ↓
Dashboard & Reports
```

Features such as online payments, AI forecasting, barcode hardware, multi-store management, and advanced accounting are outside the initial MVP scope.

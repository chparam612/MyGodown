<!--
  File: docs/viva/phase-0-audit.md
  Purpose: Viva preparation guide and walkthrough for Phase 0 (Audit & Project Scaffolding).
  Explains initial architecture, files inspected and created, end-to-end request tracing, and likely mentor questions.
-->

# Phase 0 — Project Audit & Scaffolding Viva Guide

## 1. File-by-File Walkthrough

| File | What it does | Why it exists |
|---|---|---|
| `docs/use-cases.md` | Complete functional and non-functional system specification (v1.0). | Serves as the authoritative blueprint for actors, use cases (UC-01 to UC-35 + UC-P01 to UC-P16), business rules (BR-01 to BR-18), and API contracts. |
| `docs/coverage.md` | Traceability matrix tracking all 51 use cases. | Ensures 100% test and build traceability from specification through API implementation and UI delivery. |
| `.gitignore` | Configures Git exclusion rules. | Prevents sensitive credentials (`.env`), transient build artifacts (`dist/`, `build/`), logs (`*.log`), and large dependencies (`node_modules/`) from leaking into Git. |
| `.env.example` / `backend/.env.example` | Template for environment configuration variables. | Documents required configuration keys (`DB_*`, `PORT`, `JWT_*`, `CORS_ORIGIN`, etc.) without exposing any secrets or credentials. |
| `backend/package.json` | Node.js manifest and dependency lock. | Declares production and development dependencies (Express, MySQL2, JWT, Bcrypt, Helmet, Joi, Jest, Supertest) needed for the REST API. |

---

## 2. End-to-End Request Trace (Planned: `POST /api/auth/login`)

Because Phase 0 is an audit and baseline setup phase with no application code executed yet, the planned architectural flow for the first foundational request (`POST /api/auth/login`) is traced below:

```
[Client / React UI]
       │
       ▼  HTTP POST /api/auth/login { email, password }
[Express Server (src/server.js)]
       │
       ├──► [Security Middleware: helmet(), cors()]
       │
       ├──► [Rate Limiter: express-rate-limit (blocks brute force attacks)]
       │
       ▼
[Auth Router (src/routes/auth.routes.js)]
       │
       ├──► [Validation Middleware: Joi schema validation (validates email format, password existence)]
       │
       ▼
[Auth Controller (src/controllers/auth.controller.js)]
       │
       ▼
[Auth Service (src/services/auth.service.js)]
       │
       ├──► [MySQL Query via Connection Pool (src/config/db.js)]
       │    SQL: SELECT id, name, email, password_hash, role, is_active FROM users WHERE email = ?
       │
       ├──► Check if user exists & is_active = 1
       │
       ├──► [bcryptjs.compare(password, password_hash)]
       │
       ├──► [jsonwebtoken.sign({ id, role, email }, JWT_SECRET, { expiresIn })]
       │
       ▼
[Response Formatter (Standard JSON Shape)]
       │
       ▼  200 OK: { success: true, data: { token: "...", user: { id, name, email, role } } }
[Client receives JWT and stores in memory / AuthContext]
```

---

## 3. Likely Mentor Questions & Model Answers

### Question 1: Why use an immutable `stock_movements` ledger table instead of simply updating `quantity` in `stock_levels`?
**Answer:** In retail and warehouse management, updating only an in-place quantity leaves no audit trail. If stock discrepancies, shrinkage, damaged goods, or clerical errors occur, it is impossible to reconstruct what happened, when, and by whom. An immutable ledger records every addition, subtraction, transfer, and cancellation as an append-only event (`type`, `quantity_change`, `reason/reference`, `user_id`, `created_at`). Every stock level change occurs within a database transaction that updates `stock_levels` and inserts a `stock_movements` record simultaneously.

### Question 2: Why are user roles designed hierarchically (`admin > manager > staff`) rather than as completely isolated roles?
**Answer:** A hierarchical permission structure matches operational reality in retail warehousing. An Administrator needs full oversight to manage warehouses, users, and oversee stock. A Warehouse Manager needs to manage daily warehouse operations, stock adjustments, transfers, and order handling, which naturally includes all Staff viewing and selling capabilities. Staff handle frontline orders and catalog browsing. Cumulative inheritance eliminates duplicate code and permission checks while keeping role enforcement straightforward via middleware.

### Question 3: How do we prevent negative stock levels during concurrent sales orders or stock transfers?
**Answer:** We enforce data integrity at two independent levels:
1. **Application / Transaction level**: We wrap order creation inside an InnoDB database transaction with pessimistic row locking (`SELECT quantity FROM stock_levels WHERE product_id = ? AND warehouse_id = ? FOR UPDATE`). If available quantity is insufficient for all lines, the transaction immediately rolls back with an error.
2. **Database constraint level**: A `CHECK (quantity >= 0)` constraint is applied on the `stock_levels` table in MySQL, preventing negative quantities even if an edge case bypasses application logic.

### Question 4: Why do we enforce soft deletes (`is_active = 0`) instead of hard `DELETE` queries on users, products, suppliers, and warehouses?
**Answer:** Hard deleting entities destroys relational integrity and historical records. For example, if a product is deleted, historical sales orders, purchase orders, and stock movements referencing that product ID will either fail foreign key constraints or result in orphaned records with missing descriptions. Soft deleting flags the entity as inactive so it cannot be selected for new transactions while preserving all audit and reporting data.

### Question 5: Why must `.env` files never be committed to Git, and how does `.env.example` solve collaboration needs safely?
**Answer:** `.env` files contain sensitive operational secrets such as database passwords, JWT signing keys, and service credentials. Committing them to Git exposes secrets to repository collaborators, history logs, and external threats if pushed to remote repositories. `.env.example` acts as a contract that lists all variable names and dummy structures needed by the application without disclosing any sensitive secrets.

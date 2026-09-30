# Retail Inventory Management System (RIMS)

A robust, enterprise-grade Retail Inventory Management System built with a React frontend, a Node.js/Express REST API backend, and a relational MySQL database.

---

## 1. Prerequisites & Environment Setup

### Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **MySQL Server**: 8.0.16 or higher (running locally on port 3306)
- **Git**

### Installation Steps
1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   npm install
   ```
2. Create your environment configuration file:
   ```bash
   cp .env.example .env
   ```
3. Update `backend/.env` with your local MySQL credentials.

---

## 2. Environment Variables Reference

| Variable | Default / Example | Description |
|---|---|---|
| `PORT` | `5000` | Backend HTTP server port (docs and frontend proxy standard) |
| `NODE_ENV` | `development` | Runtime environment (`development`, `test`, `production`) |
| `DB_HOST` | `localhost` | MySQL database host address |
| `DB_PORT` | `3306` | MySQL server port |
| `DB_USER` | `root` | MySQL database user |
| `DB_PASSWORD` | `your_password` | MySQL user password |
| `DB_NAME` | `inventory_db` | Primary database name for live development/production |
| `DB_TEST_NAME` | `inventory_test_db` | Dedicated isolated database for automated Jest testing |
| `JWT_SECRET` | `your_jwt_secret_key` | Secret key used for signing JWT tokens |
| `JWT_EXPIRES_IN` | `1d` | Token expiry duration (e.g. `1d`, `8h`) |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limiter window in milliseconds (15 minutes) |
| `RATE_LIMIT_MAX` | `10` | Max failed/successful login attempts allowed per window |
| `RATE_LIMIT_MAX_TEST` | `1000` | Relaxed rate limit threshold for test runners |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin (Vite dev server default) |
| `SEED_ADMIN_PASSWORD` | `AdminPassword123!` | Password for demo administrator account |
| `SEED_MANAGER_PASSWORD` | `ManagerPassword123!` | Password for demo warehouse manager account |
| `SEED_STAFF_PASSWORD` | `StaffPassword123!` | Password for demo inventory staff account |

---

## 3. Database Initialization & Seeding

Follow this strict sequence to initialize the database:

### Step A: Schema Creation (DDL)
Create the database and base tables:
```bash
mysql -u root -p < ../database/schema.sql
```

### Step B: Catalog & Inventory Seed Data
Populate base warehouses, suppliers, products, and initial stock:
```bash
mysql -u root -p inventory_db < ../database/seed.sql
```

### Step C: Seed Demo User Accounts
Seed the three core role accounts with bcrypt-hashed credentials:
```bash
npm run seed:users
```

---

## 4. Demo Login Accounts

| Role | Email | Password | Access Boundaries & Permissions |
|---|---|---|---|
| **System Administrator** | `admin@mygodown.com` | `AdminPassword123!` | Full administrative access: user administration, password resets, warehouse creation & deactivation, system health. |
| **Warehouse Manager** | `manager@mygodown.com` | `ManagerPassword123!` | Operational access: products, warehouses (read-only), suppliers, stock transfers & adjustments, POs, SO cancellation, cost prices & stock valuation. |
| **Inventory Staff** | `staff@mygodown.com` | `StaffPassword123!` | Frontline operations: inventory browsing, stock availability checks, creating draft SOs, confirming & fulfilling SOs. **Financial data masked (no cost prices, no stock valuation).** |

> **Security Note:** Demo credentials are only documented in this README and in `.env.example` templates. They are never hardcoded in application logic or printed to console logs.

---

## 5. Running the Backend

| Command | Action |
|---|---|
| `npm run dev` | Starts development server on `http://localhost:5000` with `nodemon` auto-reload. |
| `npm start` | Starts standard production server on `http://localhost:5000`. |
| `npm test` | Runs the full Jest test suite across all 9 test suites (`--runInBand`). |
| `npm run seed:users` | Re-seeds initial demo user accounts in `inventory_db`. |

---

## 6. Route & Module Architecture Overview

All endpoints reside under the `/api` prefix and require a valid Bearer token in the `Authorization` header (except `/health` and `/auth/login`).

| Module | Route Prefix | Primary Use Cases | Allowed Roles |
|---|---|---|---|
| **Module 0: Foundation** | `/api/health` | Health checks and system status probes. | Public |
| **Module 1: Authentication & Users** | `/api/auth`, `/api/users` | Login, profile identity, password changes, user management, admin password reset. | Public (`/login`), Authenticated (`/me`, `/change-password`), Admin (`/users/*`) |
| **Module 2: Products** | `/api/products` | Product catalog CRUD, category filtering, search, SKU immutability. | Admin, Manager (Full); Staff (Read active only; `costPrice` masked) |
| **Module 3: Warehouses** | `/api/warehouses` | Warehouse facilities, address info, capacity, code immutability, BR-08 zero-stock deactivation guard. | Admin (Full); Manager, Staff (Read active only) |
| **Module 4: Inventory** | `/api/inventory` | Stock balances, availability inquiries, ledger movements, adjustments, inter-warehouse transfers. | Admin, Manager (Full); Staff (Read active; `costPrice` masked) |
| **Module 5: Suppliers** | `/api/suppliers` | Supplier vendor management, BR-07 open PO deactivation guard. | Admin, Manager (Full); Staff (Read active only) |
| **Module 6: Purchase Orders** | `/api/purchase-orders` | PO creation, draft edits, status lifecycle (`ordered`), atomic stock receipt (`received`), cancellation. | Admin, Manager (Staff forbidden: 403) |
| **Module 7: Sales Orders** | `/api/sales-orders` | SO creation, status lifecycle (`confirmed`), atomic guarded fulfillment (`fulfilled`), cancellation. | Admin, Manager, Staff (All can create/confirm/fulfill; Cancel restricted to Admin/Manager) |
| **Module 8: Dashboard** | `/api/dashboard` | Real-time operational KPIs, active product count, open order counts, warehouse stock breakdown, low stock alerts. | Admin, Manager (Full metrics with `stockValue`); Staff (`stockValue` strictly omitted per BR-05) |

---

## 7. Documentation Index

- **[API Contract Document](docs/api-contract.md)**: The authoritative REST contract for frontend development containing complete schemas, validation rules, state machines, and real verified responses.
- **[Traceability & Coverage Matrix](docs/coverage.md)**: Full requirements traceability mapping UC-01 through UC-32 to source code and Jest tests.
- **[Frontend Coverage Document](docs/frontend-coverage.md)**: Full frontend use case implementation and verification matrix.
- **[Project Deviations & Architecture Notes](docs/deviations.md)**: Explicit records of deliberate design decisions, immutability rules, and BR-05/BR-07/BR-08 guards.
- **[API Test Requests (`docs/api-tests/`)](docs/api-tests/)**: Pre-configured, runnable `.http` files compatible with VS Code REST Client, Thunder Client, and IntelliJ.

---

## 8. Frontend Setup (Phase 3)

The user interface is an enterprise single-page application built with **React (JavaScript)**, **Vite**, and **Material UI (MUI)**.

### Prerequisites & Installation
```bash
cd frontend
npm install
```

### Environment Configuration
The frontend communicates with the backend via a reverse-proxy configured in Vite:
```bash
# In frontend/
cp .env.example .env
```
Default `.env` configuration:
```env
VITE_API_BASE_URL=/api
```

### Running the Development Server
```bash
npm run dev
```
The Vite development server boots on **`http://localhost:5173`**. Requests matching `/api/*` are automatically proxied to the backend REST service at `http://localhost:5000`.

### Production Build & Linting
```bash
npm run build    # Compiles client bundles into frontend/dist/
npm run lint     # Validates code quality and rules via oxlint
```

### Authentication & Demo Logins
Login at `http://localhost:5173/login`. Available demo accounts (passwords documented in Section 4):
- **Administrator:** `admin@mygodown.com`
- **Warehouse Manager:** `manager@mygodown.com`
- **Inventory Staff:** `staff@mygodown.com`


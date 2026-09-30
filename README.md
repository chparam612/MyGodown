# Retail Inventory Management System (RIMS / MyGodown)

A robust, enterprise-grade Retail Inventory & Warehouse Management System built with a React/MUI single-page application frontend, a Node.js/Express REST API backend, and a relational MySQL database.

---

## 1. System Overview & Technology Stack

RIMS is designed for multi-facility retail warehousing and inventory operations, providing end-to-end control across product catalogs, suppliers, purchase procurement, inter-warehouse stock transfers, audit adjustments, sales order fulfillment, and role-gated financial valuation.

### Technology Stack
- **Frontend:**
  - **Core:** React 19, JavaScript (ESM)
  - **Build & Tooling:** Vite 8, Rolldown / Rollup with manual vendor chunking
  - **Component UI:** Material UI (MUI) v9, Emotion styling
  - **Data Tables:** `@mui/x-data-grid` (server-side pagination, sorting, filtering)
  - **Data Visualization:** Recharts (responsive warehouse stock distribution)
  - **HTTP Client:** Axios (centralized interceptors for JWT injection and 401 handling)
  - **Code Quality:** Oxlint
- **Backend:**
  - **Runtime:** Node.js (v18.0.0+, v20+ recommended, v24 verified)
  - **Web Framework:** Express 5 (RESTful architecture, JSON envelopes)
  - **Security:** Helmet (HTTP headers), CORS, express-rate-limit (brute force protection), bcryptjs (password hashing), jsonwebtoken (signed JWTs)
  - **Input Validation:** Joi schemas on headers, query parameters, URL params, and request bodies
  - **Testing:** Jest, Supertest (217 automated integration tests across 9 test suites)
- **Database:**
  - **RDBMS:** MySQL Server 8.0.16+ (MySQL 9.7 verified)
  - **Driver:** `mysql2/promise` with connection pooling and ACID transaction management (`withTransaction`)
  - **Integrity:** Foreign keys (`ON DELETE RESTRICT`), unique constraints, check constraints (`quantity >= 0`), decimal types for financial accuracy

---

## 2. Prerequisites & Environment Setup

### Prerequisites
- **Node.js:** v18.0.0 or higher
- **MySQL Server:** 8.0.16 or higher (running on port 3306)
- **Git**

---

## 3. Step-by-Step Installation & Database Setup

Follow this exact sequence to initialize the repository, databases, and dependencies:

### Step 1: Clone Repository
```bash
git clone <repository_url>
cd "HCL Tech"
```

### Step 2: Initialize Databases & Schema (DDL)
Log in to your local MySQL instance as root and execute the schema and migration scripts to build both `inventory_db` (live development) and `inventory_test_db` (automated test isolation):

```bash
# 1. Create databases and primary schema
mysql -u root -p < database/schema.sql

# 2. Apply orders migration (purchase and sales orders DDL)
mysql -u root -p inventory_db < database/migrations/002_orders.sql
mysql -u root -p inventory_test_db < database/migrations/002_orders.sql

# 3. Seed baseline catalog, warehouses, suppliers, and stock in inventory_db
mysql -u root -p inventory_db < database/seed.sql
```

### Step 3: Backend Setup & User Seeding
```bash
cd backend
npm install
cp .env.example .env
# Edit backend/.env if your MySQL root password differs from default

# Seed initial role accounts (Admin, Manager, Staff) with bcrypt hashes
npm run seed:users

# Optional: Seed full canonical enterprise demo dataset (131 products, 8 suppliers, 5 warehouses, 230 orders)
npm run seed:canonical
```

### Step 4: Frontend Setup
```bash
cd ../frontend
npm install
cp .env.example .env
# Default frontend/.env points to VITE_API_BASE_URL=/api (Vite reverse-proxy)
```

---

## 4. Environment Variables Reference

### Backend (`backend/.env`, template: [`backend/.env.example`](backend/.env.example))

| Variable | Default / Example | Purpose |
|---|---|---|
| `PORT` | `5000` | HTTP server port (standard target for Vite proxy) |
| `NODE_ENV` | `development` | Runtime environment (`development`, `test`, `production`) |
| `DB_HOST` | `localhost` | MySQL host address |
| `DB_PORT` | `3306` | MySQL port |
| `DB_USER` | `root` | Database username |
| `DB_PASSWORD` | `your_password` | Database password |
| `DB_NAME` | `inventory_db` | Primary database name for live runtime and manual demo |
| `DB_TEST_NAME` | `inventory_test_db` | Isolated database dedicated to Jest automated testing |
| `JWT_SECRET` | `replace_with_a_long_random_string` | Secret key used to sign and verify session JWTs |
| `JWT_EXPIRES_IN` | `1d` | Expiration time for authentication tokens |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limiter sliding window (15 minutes in milliseconds) |
| `RATE_LIMIT_MAX` | `10` | Maximum login attempts allowed per IP per window |
| `RATE_LIMIT_MAX_TEST` | `1000` | Relaxed rate limiter limit for automated test runners |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed browser origin for CORS preflight checks |
| `SEED_ADMIN_PASSWORD` | `AdminPassword123!` | Initial password used by `npm run seed:users` for admin |
| `SEED_MANAGER_PASSWORD` | `ManagerPassword123!` | Initial password used by `npm run seed:users` for manager |
| `SEED_STAFF_PASSWORD` | `StaffPassword123!` | Initial password used by `npm run seed:users` for staff |

### Frontend (`frontend/.env`, template: [`frontend/.env.example`](frontend/.env.example))

| Variable | Default / Example | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | Base path for REST calls, routed via Vite proxy to port 5000 |

---

## 5. Demo Login Credentials

The database comes pre-seeded with three operational role accounts:

| Role | Email | Password | Access Boundaries & Permissions |
|---|---|---|---|
| **System Administrator** | `admin@mygodown.com` | `AdminPassword123!` | Full governance: user management, password resets, warehouse creation & deactivation, system health probes. |
| **Warehouse Manager** | `manager@mygodown.com` | `ManagerPassword123!` | Operational control: products, suppliers, stock adjustments/transfers, POs, SO cancellation, cost price & valuation visibility. |
| **Inventory Staff** | `staff@mygodown.com` | `StaffPassword123!` | Frontline operations: inventory browsing, availability checks, SO creation, confirmation & fulfillment. **Financial data strictly masked (BR-05).** |

> **Security Note:** Demo credentials are only documented in this README and `.env.example` templates. They are never committed in runtime application source code.

---

## 6. How to Run the System

### A. Run Backend Only
```bash
cd backend
npm run dev      # Starts server on http://localhost:5000 with nodemon auto-reload
npm start        # Starts production server on http://localhost:5000
npm test         # Executes 217 Jest tests against inventory_test_db (--runInBand)
```

### B. Run Frontend Only
```bash
cd frontend
npm run dev      # Starts Vite dev server on http://localhost:5173 (proxies /api to :5000)
npm run build    # Compiles production bundles into frontend/dist/
npm run lint     # Validates code quality and ESLint rules via oxlint
npm run preview  # Previews production build locally
```

### C. Run Full Demo (Both Together)
1. In Terminal 1, boot backend:
   ```bash
   cd backend && npm start
   ```
2. In Terminal 2, boot frontend:
   ```bash
   cd frontend && npm run dev
   ```
3. Open browser at **`http://localhost:5173/login`**.

---

## 7. Project Directory Structure

```
├── backend/
│   ├── scripts/             # Administrative utilities (user seeding, diagnostics)
│   ├── src/
│   │   ├── config/          # MySQL connection pool and environment loading
│   │   ├── controllers/     # Express route handlers and response envelopes
│   │   ├── middleware/      # JWT auth, RBAC permissions, Joi validation, error handling, rate limiting
│   │   ├── repositories/    # Direct parameterized SQL execution and data access
│   │   ├── routes/          # Express route definitions grouped by domain
│   │   ├── services/        # Business logic, state machines, transactions, stock invariants
│   │   ├── utils/           # Standard JSON response formatting helpers
│   │   ├── validators/      # Joi schema definitions for request bodies/params
│   │   ├── app.js           # Express app configuration, security middleware, routing
│   │   └── server.js        # HTTP server entry point and port listener
│   └── tests/               # 9 Jest integration test suites executed against inventory_test_db
│
├── frontend/
│   ├── src/
│   │   ├── api/             # Axios client, interceptors, and domain API service modules
│   │   ├── components/      # Reusable UI widgets (SearchToolbar, ConfirmDialog, FormDialog, StatusChip)
│   │   ├── context/         # AuthContext and state management for user session
│   │   ├── layouts/         # MainLayout with responsive app bar and role-gated navigation drawer
│   │   ├── pages/           # 9 lazy-loaded view pages (Login, Dashboard, Inventory, Products, etc.)
│   │   ├── routes/          # ProtectedRoute component enforcing authentication and RBAC redirects
│   │   ├── theme.js         # Material UI theme palette, typography, and component overrides
│   │   ├── App.jsx          # Top-level routing, Suspense boundaries, and React.lazy imports
│   │   └── main.jsx         # Application DOM bootstrap entry point
│   ├── vite.config.js       # Vite build configuration, proxy rules, and manual vendor chunking
│   └── package.json         # Frontend dependencies and build scripts
│
├── database/
│   ├── schema.sql           # Base DDL tables, foreign keys, and check constraints
│   ├── seed.sql             # Initial catalog products, warehouses, suppliers, and stock levels
│   └── migrations/          # Additive DDL migrations (002_orders.sql for PO/SO tables)
│
└── docs/
    ├── api-contract.md      # Authoritative REST contract with request/response schemas
    ├── coverage.md          # Backend Traceability & Requirements Coverage Matrix
    ├── frontend-coverage.md # Frontend Traceability & Requirements Coverage Matrix
    ├── deviations.md        # Deliberate design decisions, immutability rules, and pending decisions
    ├── api-tests/           # Runnable .http request suites for IDE REST clients
    ├── test-evidence/       # Recorded evidence for Demo Flow, Role Matrix, and Negative Tests
    └── viva/                # Project viva defense guide and architectural breakdown
```

---

## 8. API Overview & Documentation Links

All backend endpoints are prefixed with `/api` and return standardized envelopes:
- **Success:** `{ "success": true, "data": ..., "meta": ... }`
- **Error:** `{ "success": false, "error": { "code": "...", "message": "...", "details": ... } }`

### Documentation Index
- **[Authoritative API Contract](docs/api-contract.md):** Complete endpoint specifications, Joi validation rules, state machines, and real response samples.
- **[Backend Coverage Matrix](docs/coverage.md):** Comprehensive traceability mapping UC-01 through UC-32 to source code and tests.
- **[Frontend Coverage Matrix](docs/frontend-coverage.md):** UI component implementation and role-gating status.
- **[Project Deviations & Architecture Notes](docs/deviations.md):** Immutability rules, financial data masking (BR-05), deactivation guards (BR-07, BR-08).
- **[Viva Defense Guide](docs/viva/00-overview.md):** Line-by-line request trace, architecture diagrams, glossary, and viva Q&A.
- **[Test Evidence Directory](docs/test-evidence/):** Verified logs from Demo Flow, Role Matrix, and Negative Tests.

---

## 9. Troubleshooting Guide

| Issue | Root Cause | Solution |
|---|---|---|
| **Port 5000 in use** | An existing background server process is holding port 5000. | On Windows: `netstat -ano \| findstr :5000` then `taskkill /PID <pid> /F`. On Linux/macOS: `lsof -i :5000` then `kill -9 <pid>`. |
| **Database connection refused (`ECONNREFUSED 127.0.0.1:3306`)** | MySQL Server is stopped or port is blocked. | Verify MySQL service is running via Windows Services (`services.msc`) or execute `net start MySQL80`. Check credentials in `backend/.env`. |
| **Vite proxy / CORS error** | Direct browser requests hitting port 5000 directly or Vite proxy is pointing to wrong backend port. | Ensure requests from frontend use relative `/api` paths. Verify `target: 'http://localhost:5000'` in `frontend/vite.config.js`. |
| **CHECK constraints ignored** | Running on MySQL older than 8.0.16 or older MariaDB releases that parse but do not enforce `CHECK` constraints. | Upgrade to MySQL 8.0.16+ (tested on MySQL 9.7.1). RIMS also enforces all stock bounds in JavaScript service transactions. |
| **Login rate limit 429 (`TOO_MANY_REQUESTS`)** | Rate limiter triggered after $\ge 10$ login attempts within 15 minutes. | Wait 15 minutes for the in-memory window to expire, or restart the backend process (`npm start`) to reset the in-memory counter. For test automation, use `RATE_LIMIT_MAX_TEST=1000`. |

---

## 10. Known Limitations

Detailed architectural limitations are documented in [`docs/final-report.md`](docs/final-report.md):
1. **JWT Revocation:** JWTs are stateless and held in browser `localStorage`. Immediate deactivation is checked against the database upon each request via `authenticate` middleware, but there is no distributed token blacklist (Redis).
2. **Order Lifecycle Granularity:** In accordance with the system specification, Sales Orders transition directly from `confirmed` $\rightarrow$ `fulfilled`. There are no intermediate `packed` or `shipped` states.
3. **No Automated Back-Ordering:** When stock is insufficient for a sales order line, fulfillment fails atomically with `422 INSUFFICIENT_STOCK`. Partial shipments or back-orders are not supported.

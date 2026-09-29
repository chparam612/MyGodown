# Retail Inventory Management System (RIMS)

A full-stack Retail Inventory Management System built with a React frontend, Node.js/Express backend API, and a relational MySQL database.

---

## Database Setup

Follow these steps to set up and seed the database (`inventory_db`) from scratch.

### 1. Prerequisites & Environment Configuration
1. Ensure MySQL Server 8.0.16+ is running locally.
2. In the `backend/` directory, copy `.env.example` to `.env`:
   ```bash
   cp backend/.env.example backend/.env
   ```
3. Edit `backend/.env` with your actual MySQL database credentials (`DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`).

### 2. Execution Order

Execute the database setup scripts in this strict sequence:

#### Step A: Create Database & Apply DDL Schema
Run `database/schema.sql` against your MySQL server. This creates the database `inventory_db` (if missing) and all 6 core tables:
```bash
mysql -u root -p < database/schema.sql
```
*(Or execute `database/schema.sql` via MySQL Workbench / database client).*

#### Step B: Populate Initial Seed Data
Run `database/seed.sql` to populate warehouses, suppliers, products, and initial stock levels (including low-stock test scenarios):
```bash
mysql -u root -p inventory_db < database/seed.sql
```
*(All seed operations are idempotent and resolve relationships via subqueries without inserting users).*

#### Step C: Seed Demo User Accounts
From the `backend/` directory, run the automated user seeding script. It securely hashes passwords using `bcryptjs` and reads credentials from your environment:
```bash
cd backend
npm run seed:users
```

---

## Demo Credentials

The initial demo accounts seeded by `npm run seed:users` are configured with the following credentials:

| Email | Role | Demo Password | Purpose |
|---|---|---|---|
| `admin@mygodown.com` | `admin` | `AdminPassword123!` | System configuration, user management, and warehouse administration |
| `manager@mygodown.com` | `manager` | `ManagerPassword123!` | Product catalog maintenance, stock adjustments, supplier management, and reporting |
| `staff@mygodown.com` | `staff` | `StaffPassword123!` | Sales order entry, inventory lookups, and fulfillment status updates |

> **Note:** Demo passwords appear only in this README and in `.env.example` template placeholders. They are never hardcoded in application logic or printed to console logs.

# Satyal Mart — QR Digital Shopping System (V1)

A mobile-first, QR-based in-store shopping and ordering system: customers scan a QR code, browse the catalog, add to cart, apply a coupon, and place an order for pay-at-counter pickup — no app install, no online payment. Staff manage everything from an admin dashboard.

This is the V1 build described in the project spec, covering Phases 1–6 (foundation, customer experience, promotions, orders, Excel + media, local deployment). Phase 7 (production polish / load testing with many real phones) is still ahead of you before a real launch.

## What's included

**Customer catalog** (`/`)
- Browse, search, filter by category
- Product detail view, cart, quantity controls
- Coupon codes (server-validated, so nothing can be faked from the browser)
- Checkout → order confirmation screen with order number

**Admin dashboard** (`/admin`)
- Login (default: `admin` / `satyal123` — **change this immediately** under Settings)
- Dashboard: today's orders, pending orders, sales, active products/coupons
- Products: full CRUD, photo upload, active/inactive toggle, featured flag, optional stock tracking
- Categories: CRUD
- Orders: list, filter by status, detail view, status updates (NEW → CONFIRMED → PREPARING → READY → COMPLETED / CANCELLED)
- Coupons: CRUD with percent/flat discount, min order, max discount cap, date range, usage limit
- Excel/CSV import: upload → preview with per-row validation → confirm import (matches on SKU, updates existing or creates new)
- QR code: auto-generated PNG pointing at your configured catalog URL, downloadable
- Reports: top products, coupon usage, CSV export of all orders
- Settings: store name, banner text, admin password change

**Backend**
- Node.js + Express REST API
- SQLite database (`better-sqlite3`) — a single file, no separate database server to install
- All prices, discounts, and order totals are calculated **server-side** — the browser is never trusted with money math (per the spec's security requirement)
- Session-based admin auth (bcrypt-hashed passwords)
- Local image storage for product photos

## Running it

You'll need [Node.js](https://nodejs.org) (v18 or newer) installed on the computer that will act as your local server (e.g. the one at the counter).

```bash
cd satyal-mart-app
npm install
npm start
```

You should see:
```
Satyal Mart is running!
  Customer catalog: http://localhost:3000
  Admin dashboard:  http://localhost:3000/admin
```

The first time it runs, it creates the database file at `server/db/satyal-mart.sqlite`, seeds it with the default admin user and the 18 sample products from the spec, and you're ready to go.

## Using it on your store Wi-Fi

1. Find the local IP address of the computer running the server (e.g. `192.168.1.20`). On Windows: `ipconfig`. On Mac/Linux: `ifconfig` or `ip addr`.
2. In the admin dashboard → **QR Code**, set the Catalog URL to `http://<that-ip>:3000` and save. The QR image updates automatically.
3. Print or display that QR code at the entrance/counter/shelves.
4. Any phone connected to the same Wi-Fi can scan it and shop — no mobile data or app needed.
5. Keep the server computer on and connected while the store is open. If it restarts, just run `npm start` again — all products, orders, and settings are safely stored in the SQLite file.

## Replacing the sample data

- **Products**: edit or delete the 18 seeded sample products from the admin Products page, or bulk-replace everything via **Import Excel** using columns `SKU, Product Name, Category, Brand, Regular Price, Sale Price, Active`.
- **Product photos**: the sample products use illustrated placeholder icons. Upload real photos per product from the Edit Product screen.
- **Coupons**: three starter coupons are seeded (`SATYAL10`, `SAVE50`, `WELCOME20`) — edit or delete them from the Coupons page.

## What's deferred beyond V1

Per the spec's own scoping (sections 20 and 27), these are intentionally not built yet, since they weren't required for V1:
- Online/public hosting, delivery, online payment, customer accounts, loyalty points
- WhatsApp/SMS order notifications (V1 uses the in-dashboard order list; you'll want to check it or add a sound alert)
- Multi-branch / POS / inventory-system integration
- A separate "Admin Users" management screen (currently a single admin account, with password change) and a dedicated "Customers" CRM screen (customer name/phone is captured per order)

The codebase avoids hard-coding Satyal Mart-specific logic in the schema or API (store name and banner text are configurable in Settings), so it can extend toward the multi-store SaaS idea in section 28 later without a rebuild.

## Project structure

```
satyal-mart-app/
├── server/
│   ├── index.js          # Express app entry point
│   ├── db/index.js       # SQLite schema + seed data
│   ├── middleware/auth.js
│   ├── routes/           # auth, products, categories, coupons, orders, upload, import, settings, reports
│   └── uploads/products/ # uploaded product photos
├── public/
│   ├── customer/         # customer-facing catalog (index.html + script.js)
│   └── admin/            # admin dashboard (index.html + app.js + style.css)
└── package.json
```

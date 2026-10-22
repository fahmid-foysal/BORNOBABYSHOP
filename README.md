# Borno Baby Shop ERP

Express + MySQL 8 backend and React + Vite dashboard for online and in-store toy shop operations. Supports module permissions, product/combo inventory, purchasing, POS receipts, CSV orders, Steadfast dispatch and settlement accounting, and reports. No commits or publication are performed.

## Local setup

Use Node.js 22.12+ (24 LTS is also supported), npm, and MySQL 8.0+. Both local `.env` files are already created. Backend uses `127.0.0.1:4406`, database `bornobabyshop_db`, username `root`, password `root`. Open `backend/.env` to get the initial login credentials (`ADMIN_EMAIL` and `ADMIN_PASSWORD`). It also contains generated JWT and webhook secrets. Environment files are ignored by Git; `.env.example` files document each variable.

In `backend`:

```sh
npm install
npm run migrate
npm run seed
npm run dev
```

In a second terminal, in `frontend`:

```sh
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api`, `/uploads`, and `/health` to Express on port 3000. In PowerShell with restricted execution policy, use `npm.cmd` instead of `npm`.

Seed creates an administrator and Cash, bKash, Nagad, Bank, and Steadfast payment methods. It never resets an existing password. Ordinary users are created in **Users & permissions**, with role `user` and checked modules. API authorization checks the database on every request. Password or permission changes invalidate previous sessions. The dashboard belongs to `REPORTS`. Master Data also includes income accounts and sales employees, needed for accounting and team reports.

## Sample data

Run `npm run seed:demo` from `backend` to insert the sample dataset once. It adds 24 products, 4 combos, 13 categories, 3 suppliers, 3 sales employees, 3 purchases, 30 offline sales (paid/due/returned), stock adjustments, expenses, and income. Records are marked `[Demo]` or `BORNO_DEMO_V1`. Existing users and passwords are preserved. Online sales and courier records are untouched, and no external APIs are called. Rerunning skips the existing batch.

Dates cover the current month, including today. See [docs/demo-data.md](docs/demo-data.md) for generated product/combo barcodes. Opening stock purchases have substantial payouts, so this dataset intentionally shows negative cash profit while trading profit remains separate.

## Database

`migrations/001.sql` is preserved. `002_erp_integrity.sql` adds combo quantities, a shared barcode registry, unique customer phones and settlement IDs, courier dispatch state, inventory snapshots, accounting views, and settlement allocation records.

The migration runner recognizes an existing database containing all original tables and records its baseline. It then applies numbered migrations once and verifies their hashes. Do not edit applied migrations. MySQL DDL implicitly commits: back up production before migrating. Existing data must have unique customer phones and settlement IDs, and valid unique five-character barcodes across products and combos before 002. Historical stock is backfilled using the combo contents and product costs available at migration time; earlier composition/cost history cannot be reconstructed.

Stock = purchases + adjustments − active sale component quantities. Sales expand combo quantities into immutable component rows. Returning a whole sale reverses its component deductions; later combo edits do not rewrite past stock or cost. Inventory-changing transactions serialize through a database row lock, preventing concurrent overselling. Barcodes use 0–9/A–Z, are reserved across both tables, and try at most 50 combinations. Negative stock adjustments support loss/damage.

Referenced records cannot be deleted. Purchases with payouts cannot be deleted, and reducing purchased stock below sold quantities is rejected. Sales are preserved for accounting and support full-order returns with an editable refund amount. Partial item returns are outside this workflow.

## Steadfast configuration

Set these in `backend/.env`:

```dotenv
STEADFAST_BASE_URL=https://portal.packzy.com/api/v1
STEADFAST_API_KEY=your-merchant-api-key
STEADFAST_SECRET_KEY=your-merchant-secret
STEADFAST_WEBHOOK_TOKEN=your-generated-webhook-token
```

The integration implements the API contracts supplied in the brief. Single dispatch calls `POST /create_order`; batches call `POST /create_order/bulk-order` with `{ "data": [...] }`. Invoice = `ORD-{online_sale_id}`. COD = subtotal − discount + delivery − paid amount. Success stores the consignment ID, tracking code/link, and permanently sets `sent_to_steadfast`. Orders remain saved when credentials are missing or dispatch fails. The sales list can send unsent orders later.

An uncertain network result leaves dispatch reserved to prevent duplicate shipments. Check `ORD-ID` in the merchant portal, then use **Reconcile** in the sales list to link confirmed details. A definite per-invoice rejection enables retry. If the request never reached the courier, verify this in its portal before manually clearing that order’s `steadfast_submitted_at` in MySQL. Uncertain external writes are never retried automatically.

Register this public HTTPS webhook in your merchant portal, with its matching bearer token:

```text
POST https://your-domain.example/api/webhooks/steadfast
Authorization: Bearer <STEADFAST_WEBHOOK_TOKEN>
Content-Type: application/json
```

Use the delivery-status body from the brief with invoice `ORD-ID`. The endpoint validates invoice/consignment pairing, ignores older timestamps, and updates courier status and delivery charge. Inventory restoration uses the explicit return action. Unauthenticated webhooks are rejected.

**Steadfast payments** fetches `GET /payments/SFC-ID`, saves the entire response in JSON, matches consignments by ID or `ORD-ID`, and records `cod_amount` with note `STEADFAST_PAYMENTS SFC-ID`. It creates expense account `steadfast_charges` if missing and records one expense of `payment.amount - payment.total`, narrated `STEADFAST_CHARGES SFC-ID`. Imported charges are immutable in expense CRUD. Duplicate imports cannot duplicate payments or charges. Unmatched consignments remain in the response; re-import after linking their orders to apply them. Historical invoices that are not `ORD-ID` must match a stored consignment ID.

Live merchant credentials are required to verify actual courier behavior. Integration tests mock the external courier and use real MySQL for accounting and stock.

## Bulk online CSV

Download the template from **Sales → Bulk online entry**, or use [docs/online-sales-template.csv](docs/online-sales-template.csv). Replace sample barcodes with real catalog barcodes.

| Column                                                | Meaning                                                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `order_ref`                                           | Required grouping key. Matching references create one order. Actual invoice becomes `ORD-ID`. |
| `customer_name`, `customer_phone`, `customer_address` | Required customer data. Preserve leading zeros by treating phone numbers as text.             |
| `item_type`                                           | `product` or `combo`.                                                                         |
| `barcode`                                             | Five-character barcode matching the item type.                                                |
| `quantity`                                            | Positive item quantity.                                                                       |
| `rate`                                                | Optional; blank uses the current catalog sale price.                                          |
| `discount`                                            | Fixed amount per order, not a percentage. Defaults to 0.                                      |
| `delivery_charge`                                     | Blank uses the item delivery defaults × quantities. Editable in the preview.                  |
| `paid_amount`                                         | Advance payment per order. Defaults to 0.                                                     |
| `payment_method_id`                                   | Required for a positive advance payment; use a Master Data payment method ID.                 |
| `sales_employee_id`                                   | Optional employee ID from Master Data.                                                        |
| `notes`                                               | Optional order/courier notes.                                                                 |

One item per row; up to 500 orders and 5,000 rows per file. Order-level fields must match on every row sharing an `order_ref`. The screen resolves barcodes and previews orders before submission. Local batch creation is atomic: one invalid or out-of-stock order rolls back the whole batch. Courier dispatch happens after commit and can succeed/fail per invoice. Review results in **Sales list → Online sales**.

## Dashboard calculations

Default dates: first day of the current month through today, Asia/Dhaka.

- **Sales revenue:** quantity × rate − discount + customer delivery, excluding returns, by sale `created_at`.
- **Cash profit (the requested calculation):** sale receipts + other incomes − expenses − purchase payouts. Uses each entry’s own `created_at`, including negative refunds.
- **Gross trading profit:** item revenue − discount − sale-time component cost snapshots, excluding returns and customer delivery.
- **Net operating profit:** gross trading profit + other income − expenses. Purchase payouts affect cash profit only to avoid counting product costs twice.
- **Category units:** actual product component quantities; combos count in all their component categories. Team item charts count sold product/combo units. Today’s team chart always uses today in Dhaka.

Six reports cover daily/monthly salesperson sales, daily product/combo sales, salesperson sale counts, monthly product-by-salesperson sales, and monthly product/combo sales. Item reports allocate order discounts proportionally and exclude delivery. CSV exports contain the selected report rows.

## Build and hPanel deployment

In `frontend`:

```sh
npm run build
```

Output goes directly to `backend/dist`, beside `app.js`. Upload the **contents of `backend`**, including `dist` and persistent `uploads`, to the Node.js app directory. Keep `dist/index.html` and `dist/assets` together. You can upload compiled `dist` separately as long as it lands there. Production does not need Vite.

Use an hPanel plan/runtime supporting Node.js apps and MySQL; static-only PHP hosting cannot execute Express. Set startup file `app.js`, install with `npm ci --omit=dev`, and use the panel-provided `PORT` if present. Configure production database credentials, `NODE_ENV=production`, a fresh JWT secret and administrator password, HTTPS origins in `CORS_ORIGINS`, and courier secrets. Set `TRUST_PROXY=1` only behind exactly one trusted reverse proxy. Upload repository `migrations` to `../migrations` relative to the app directory, then run migration and seed commands with production credentials.

Routes:

- `/health`: database health, HTTP 200 or 503.
- `/api/*`: JSON APIs; unknown APIs return JSON 404.
- `/uploads/*`: public product images, generated filenames, restricted sizes/types and signature checks.
- `/*`: compiled frontend and SPA fallback.

Relative `/api` keeps production under one origin. `VITE_*` values are public, compiled at build time; never put secrets there. Set shop phone/address in `frontend/.env` before building for branded receipts. Receipt CSS targets 80 mm rolls. Select your POS printer and disable browser headers/footers; the print dialog also supports PDF.

## Code and API

`app.js → api/<domain>/<domain>.router.js → .controller.js → .service.js`. Shared middleware supplies bearer JWT auth, database module authorization, and multer disk image uploads. The mysql2 promise pool and transaction helper are in `config/database.js`. Input schemas validate business amounts. User SQL values use bound parameters; resource/table names come from code allowlists.

| Base route                | Operations                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/auth`               | `POST /login`, `GET /me`, `GET /modules`, user list/create/update, `PUT /users/:id/password`                                                   |
| `/api/master`             | `GET /lookups`; list/create/update/delete `/:resource`                                                                                         |
| `/api/catalog`            | `GET /search`, `GET /categories`; products/combos list/detail/create/update/delete                                                             |
| `/api/purchases`          | list/detail/create/update/delete; `POST /:id/payments`                                                                                         |
| `/api/sales`              | `GET /customer?phone=...`, channel list/detail/create; `POST /online/bulk`; payments and return via `POST /:channel/:id/payments` or `/return` |
| `/api/sales/online`       | `POST /:id/send-steadfast`, `POST /:id/reconcile-steadfast`                                                                                    |
| `/api/steadfast/payments` | list; `POST /import` with `payment_id`                                                                                                         |
| `/api/webhooks/steadfast` | Bearer-authenticated delivery status notifications                                                                                             |
| `/api/analytics`          | `GET /dashboard`, `GET /reports/:type`, with `from`/`to`                                                                                       |

Lists use `page`/`limit` (maximum 100). Catalog search accepts `search`, `barcode`, `category_id`, `category_ids`, `products_only=1`. Omitting `category_ids` includes all descendants; supplying it includes checked descendants plus the root. Suggestions order by most recent sale. Multipart product/combo forms send `images` plus JSON `data`; `remove_image_ids` removes image associations during editing.

## Verification

```sh
# backend unit checks
npm test

# isolated real-MySQL integration test (PowerShell)
$env:BBS_INTEGRATION='1'
node --test tests/integration.test.js

# frontend
npm run build
```

Integration creates a separate database named `bornobabyshop_test_<timestamp>`, leaves its fixtures for inspection, and never drops or truncates the shop database. Tests cover combo quantities, historical snapshots, concurrent overselling, rollback, refunds, authorization, courier dispatch/webhooks, duplicate-safe settlements, bulk requests, and all report SQL. Remove old test databases through your MySQL client after inspecting them.

On Windows with Microsoft Edge installed, run `npm run test:browser` from `frontend` after a build and integration test. It uses the newest isolated test database and checks login, themes, image upload, barcode picking, basket preservation, checkout/receipt, CSV preview, reports, and mobile navigation. Screenshots are saved under `frontend/test-results`. No fixture sales are added to the shop database. Migration 003 adds unique courier consignment IDs and reporting indexes.

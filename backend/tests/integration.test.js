const { test } = require("node:test");
const assert = require("node:assert/strict");
// Uses an isolated database. It is never run against the shop database.
test(
  "ERP integration: auth, stock, sales, returns, courier and analytics",
  { skip: process.env.BBS_INTEGRATION !== "1" },
  async (t) => {
    require("dotenv").config({
      path: require("path").join(__dirname, "../.env"),
    });
    const mysql = require("mysql2/promise");
    const { spawnSync } = require("child_process");
    const dbName = "bornobabyshop_test_" + Date.now();
    const admin = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
    // Preserve any previous run for inspection instead of deleting it.
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    const [[count]] = await admin.query(
      "SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=?",
      [dbName],
    );
    if (count.n)
      throw new Error(
        "Integration database already contains tables. Use the documented test cleanup command after inspecting it.",
      );
    process.env.DB_NAME = dbName;
    const migration = spawnSync(
      process.execPath,
      [require("path").join(__dirname, "../scripts/migrate.js")],
      { env: process.env, encoding: "utf8" },
    );
    assert.equal(migration.status, 0, migration.stderr);
    const { pool, transaction } = require("../config/database");
    const app = require("../app");
    const request = require("supertest");
    const bcrypt = require("bcryptjs");
    const { insert } = require("../lib/http");
    const master = require("../api/master/master.service");
    const catalog = require("../api/catalog/catalog.service");
    const purchases = require("../api/purchases/purchases.service");
    const sales = require("../api/sales/sales.service");
    const steadfast = require("../api/steadfast/steadfast.service");
    let user,
      token,
      productA,
      productB,
      combo,
      method,
      supplier,
      category,
      employee,
      order;
    await t.test("seed test administrator and log in", async () => {
      const key = await insert(pool, "users", {
        name: "Integration Admin",
        email: "integration@example.test",
        password: await bcrypt.hash("integration-password", 4),
        role: "admin",
      });
      user = { id: key, role: "admin" };
      const login = await request(app).post("/api/auth/login").send({
        email: "integration@example.test",
        password: "integration-password",
      });
      assert.equal(login.status, 200);
      token = login.body.data.token;
      assert.equal(
        (await request(app).get("/api/master/categories")).status,
        401,
      );
      assert.equal((await request(app).get("/health")).status, 200);
    });
    const authorized = () => request(app);
    await t.test("create master data and reject category cycles", async () => {
      supplier = (
        await master.save(
          "suppliers",
          { supplier_name: "Fixture Supplier" },
          null,
          user,
        )
      ).id;
      category = (
        await master.save("categories", { category_name: "Toys" }, null, user)
      ).id;
      const child = (
        await master.save(
          "categories",
          { category_name: "Blocks", parent_category_id: category },
          null,
          user,
        )
      ).id;
      await assert.rejects(
        () =>
          master.save(
            "categories",
            { category_name: "Toys", parent_category_id: child },
            category,
            user,
          ),
        /ancestor/,
      );
      method = (
        await master.save("payment_methods", { method: "Cash" }, null, user)
      ).id;
      employee = (
        await master.save("employees", { name: "Test Salesperson" }, null, user)
      ).id;
    });
    await t.test(
      "create products, quantities in combos and paginated category search",
      async () => {
        productA = await catalog.save(
          "products",
          { product_name: "Blocks", sale_price: 100, category_id: category },
          null,
          [],
        );
        productB = await catalog.save(
          "products",
          { product_name: "Teddy", sale_price: 150, category_id: category },
          null,
          [],
        );
        assert.match(productA.barcode, /^[0-9A-Z]{5}$/);
        assert.notEqual(productA.barcode, productB.barcode);
        combo = await catalog.save(
          "combos",
          {
            combo_name: "Play Box",
            sale_price: 300,
            items: [
              { product_id: productA.id, quantity: 2 },
              { product_id: productB.id, quantity: 1 },
            ],
          },
          null,
          [],
        );
        assert.notEqual(combo.barcode, productA.barcode);
        const d = await catalog.search({ category_id: category, limit: 2 });
        assert.equal(d.total, 3);
        assert.equal(d.rows.length, 2);
        assert.equal(
          (await catalog.search({ barcode: combo.barcode, products_only: "1" }))
            .total,
          0,
        );
      },
    );
    await t.test(
      "shared barcode reservations stop after exactly fifty collisions",
      async () => {
        const crypto = require("crypto");
        const original = crypto.randomInt;
        let calls = 0;
        await pool.query(
          "INSERT IGNORE INTO barcode_registry(barcode,entity_type) VALUES ('00000','product')",
        );
        crypto.randomInt = () => {
          calls++;
          return 0;
        };
        try {
          await assert.rejects(
            () => catalog.barcode(pool, "product"),
            /50 attempts/,
          );
          assert.equal(calls, 250);
        } finally {
          crypto.randomInt = original;
        }
      },
    );
    await t.test(
      "multipart image upload and invalid signature rejection",
      async () => {
        const png = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP7sAAAAASUVORK5CYII=",
          "base64",
        );
        const uploaded = await request(app)
          .post("/api/catalog/products")
          .set("Authorization", `Bearer ${token}`)
          .field(
            "data",
            JSON.stringify({
              product_name: "Image test product",
              sale_price: 1,
            }),
          )
          .attach("images", png, {
            filename: "test.png",
            contentType: "image/png",
          });
        assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body));
        const detail = await catalog.detail("products", uploaded.body.data.id);
        assert.equal(detail.images.length, 1);
        assert.equal(
          (await request(app).get(detail.images[0].img_path)).status,
          200,
        );
        t.after(() =>
          require("fs")
            .promises.unlink(
              require("path").join(__dirname, "..", detail.images[0].img_path),
            )
            .catch(() => {}),
        );
        const bad = await request(app)
          .post("/api/catalog/products")
          .set("Authorization", `Bearer ${token}`)
          .field(
            "data",
            JSON.stringify({ product_name: "Bad image", sale_price: 1 }),
          )
          .attach("images", Buffer.from("not an image"), {
            filename: "fake.png",
            contentType: "image/png",
          });
        assert.equal(bad.status, 400);
        await catalog.remove("products", uploaded.body.data.id);
      },
    );
    await t.test("purchase updates stock and cost", async () => {
      await purchases.save(
        {
          supplier_id: supplier,
          items: [
            { product_id: productA.id, quantity: 20, rate: 50 },
            { product_id: productB.id, quantity: 20, rate: 70 },
          ],
          paid_amount: 100,
          payment_method_id: method,
        },
        null,
        user,
      );
      assert.equal((await catalog.detail("products", productA.id)).stock, 20);
      assert.equal(
        (await catalog.detail("products", productA.id)).purchase_price,
        50,
      );
    });
    await t.test(
      "unpaid purchase edits and deletion restore stock",
      async () => {
        const purchase = await purchases.save(
          {
            supplier_id: supplier,
            items: [{ product_id: productA.id, quantity: 2, rate: 50 }],
          },
          null,
          user,
        );
        assert.equal((await catalog.detail("products", productA.id)).stock, 22);
        await purchases.save(
          {
            supplier_id: supplier,
            items: [{ product_id: productA.id, quantity: 3, rate: 50 }],
          },
          purchase.id,
          user,
        );
        assert.equal((await catalog.detail("products", productA.id)).stock, 23);
        await purchases.remove(purchase.id);
        assert.equal((await catalog.detail("products", productA.id)).stock, 20);
      },
    );
    const customer = {
      cus_name: "Customer",
      cus_phone: "01700000001",
      cus_address: "Dhaka",
    };
    await t.test(
      "mixed sale expands combo quantities and snapshots product cost",
      async () => {
        order = await sales.create(
          "offline",
          {
            customer,
            items: [
              { item_type: "combo", item_id: combo.id, quantity: 2, rate: 300 },
              {
                item_type: "product",
                item_id: productA.id,
                quantity: 1,
                rate: 100,
              },
            ],
            final_discount: 50,
            paid_amount: 200,
            payment_method_id: method,
            sales_employee_id: employee,
          },
          user,
        );
        assert.equal(order.payable, 650);
        assert.equal(order.due, 450);
        assert.equal((await catalog.detail("products", productA.id)).stock, 15);
        assert.equal((await catalog.detail("products", productB.id)).stock, 18);
        await catalog.save(
          "combos",
          {
            combo_name: "Play Box",
            sale_price: 300,
            items: [{ product_id: productA.id, quantity: 9 }],
          },
          combo.id,
          [],
        );
        assert.equal((await catalog.detail("products", productA.id)).stock, 15);
      },
    );
    await t.test(
      "overselling rolls back customer and sale creation",
      async () => {
        await assert.rejects(
          () =>
            sales.create(
              "offline",
              {
                customer: { ...customer, cus_phone: "01700000999" },
                items: [
                  {
                    item_type: "product",
                    item_id: productA.id,
                    quantity: 200,
                    rate: 100,
                  },
                ],
              },
              user,
            ),
          /Insufficient/,
        );
        assert.equal(await sales.customer("01700000999"), null);
      },
    );
    await t.test("concurrent checkout cannot oversell", async () => {
      const body = {
        customer,
        items: [
          {
            item_type: "product",
            item_id: productB.id,
            quantity: 10,
            rate: 150,
          },
        ],
      };
      const results = await Promise.allSettled([
        sales.create("offline", body, user),
        sales.create("offline", body, user),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const extra = results.find((r) => r.status === "fulfilled").value;
      await sales.returnSale(
        "offline",
        extra.id,
        { amount: 0, payment_method_id: method },
        user,
      );
    });
    await t.test(
      "collect balance, return sale once and restore stock",
      async () => {
        await sales.addPayment(
          "offline",
          order.id,
          { amount: 450, payment_method_id: method },
          user,
        );
        assert.equal((await sales.detail("offline", order.id)).status, "paid");
        await sales.returnSale(
          "offline",
          order.id,
          { amount: 650, payment_method_id: method },
          user,
        );
        assert.equal((await catalog.detail("products", productA.id)).stock, 20);
        assert.equal((await sales.detail("offline", order.id)).paid, 0);
        await assert.rejects(
          () =>
            sales.returnSale(
              "offline",
              order.id,
              { amount: 0, payment_method_id: method },
              user,
            ),
          /already/,
        );
      },
    );
    await t.test("permissions are enforced by API", async () => {
      const auth = require("../api/auth/auth.service");
      const u = await auth.save({
        name: "Catalog user",
        email: "catalog@example.test",
        password: "password123",
        permissions: ["PRODUCTS"],
      });
      const login = await request(app)
        .post("/api/auth/login")
        .send({ email: "catalog@example.test", password: "password123" });
      const bearer = `Bearer ${login.body.data.token}`;
      assert.equal(
        (
          await authorized()
            .get("/api/catalog/products")
            .set("Authorization", bearer)
        ).status,
        200,
      );
      assert.equal(
        (
          await authorized()
            .get("/api/sales/offline")
            .set("Authorization", bearer)
        ).status,
        403,
      );
      await auth.save(
        {
          name: "Catalog user",
          email: "catalog@example.test",
          permissions: [],
        },
        u.id,
      );
      assert.equal(
        (
          await authorized()
            .get("/api/catalog/products")
            .set("Authorization", bearer)
        ).status,
        401,
      );
    });
    const originalFetch = global.fetch;
    try {
      process.env.STEADFAST_API_KEY = "test";
      process.env.STEADFAST_SECRET_KEY = "test";
      process.env.STEADFAST_WEBHOOK_TOKEN = "test-webhook";
      let online;
      await t.test(
        "online dispatch COD, protected webhook and idempotent send",
        async () => {
          global.fetch = async (url, opts) => {
            const body = JSON.parse(opts.body);
            assert.equal(body.cod_amount, 130);
            return {
              ok: true,
              json: async () => ({
                status: 200,
                consignment: {
                  consignment_id: 123456,
                  tracking_code: "TEST123",
                  tracking_link: "https://steadfast.com.bd/tl/test",
                },
              }),
            };
          };
          online = await sales.create(
            "online",
            {
              customer,
              items: [
                {
                  item_type: "product",
                  item_id: productA.id,
                  quantity: 1,
                  rate: 100,
                },
              ],
              delivery_charge: 50,
              paid_amount: 20,
              payment_method_id: method,
            },
            user,
          );
          assert.equal(online.sent_to_steadfast, 1);
          assert.equal(online.steadfast_cod_amount, 130);
          await assert.rejects(() => steadfast.send([online.id]), /already/);
          const body = {
            notification_type: "delivery_status",
            invoice: `ORD-${online.id}`,
            consignment_id: 123456,
            status: "delivered",
            delivery_charge: 60,
            updated_at: "2026-10-23 12:00:00",
          };
          assert.equal(
            (await request(app).post("/api/webhooks/steadfast").send(body))
              .status,
            401,
          );
          assert.equal(
            (
              await request(app)
                .post("/api/webhooks/steadfast")
                .set("Authorization", "Bearer test-webhook")
                .send(body)
            ).status,
            200,
          );
          assert.equal(
            (await sales.detail("online", online.id)).steadfast_delivery_charge,
            60,
          );
        },
      );
      await t.test(
        "settlements record payment and charges exactly once",
        async () => {
          const payload = {
            status: 1,
            payment: {
              payment_id: "SFC-TEST123",
              amount: 130,
              total: 110,
              method: "Bank",
              status_label: "paid",
              consignments: [
                {
                  consignment_id: 123456,
                  invoice: `ORD-${online.id}`,
                  cod_amount: 130,
                },
              ],
            },
          };
          global.fetch = async () => ({ ok: true, json: async () => payload });
          const first = await steadfast.importPayment("SFC-TEST123", user);
          assert.equal(first.matched, 1);
          const second = await steadfast.importPayment("SFC-TEST123", user);
          assert.equal(second.matched, 0);
          assert.equal(second.already_applied, 1);
          assert.equal((await sales.detail("online", online.id)).paid, 150);
          const [[charges]] = await pool.query(
            "SELECT COUNT(*) n,SUM(amount) amount FROM expenses WHERE narration='STEADFAST_CHARGES SFC-TEST123'",
          );
          assert.equal(Number(charges.n), 1);
          assert.equal(charges.amount, 20);
        },
      );
      await t.test(
        "bulk create is atomic and calls courier bulk endpoint",
        async () => {
          global.fetch = async (url, opts) => {
            assert.match(url, /bulk-order$/);
            const body = JSON.parse(opts.body);
            assert.equal(body.data.length, 2);
            return {
              ok: true,
              json: async () => ({
                status: 200,
                data: body.data.map((o, i) => ({
                  invoice: o.invoice,
                  status: i === 0 ? "success" : null,
                  consignment_id: i === 0 ? 333333 : null,
                  error: i === 1 ? "Rejected recipient" : undefined,
                })),
              }),
            };
          };
          const raw = {
            customer,
            items: [
              {
                item_type: "product",
                item_id: productA.id,
                quantity: 1,
                rate: 100,
              },
            ],
            send_to_steadfast: false,
          };
          const result = await sales.bulk(
            { orders: [raw, raw], send_to_steadfast: true },
            user,
          );
          assert.equal(result.orders.length, 2);
          assert.equal(
            (await sales.detail("online", result.orders[0].id))
              .sent_to_steadfast,
            1,
          );
          assert.equal(
            (await sales.detail("online", result.orders[1].id))
              .sent_to_steadfast,
            0,
          );
        },
      );
      await t.test(
        "income and expense use creation dates for cash profit",
        async () => {
          const incomeAccount = (
            await master.save(
              "income_accounts",
              { title: "Fixture income" },
              null,
              user,
            )
          ).id;
          const expenseAccount = (
            await master.save(
              "expense_accounts",
              { title: "Fixture expense" },
              null,
              user,
            )
          ).id;
          const income = await master.save(
            "incomes",
            {
              income_account_id: incomeAccount,
              amount: 9,
              income_date: "1999-01-01",
              narration: "Fixture",
            },
            null,
            user,
          );
          await master.save(
            "incomes",
            {
              income_account_id: incomeAccount,
              amount: 10,
              income_date: "1999-01-01",
              narration: "Fixture updated",
            },
            income.id,
            user,
          );
          await master.save(
            "expenses",
            {
              expense_account_id: expenseAccount,
              amount: 5,
              expense_date: "1999-01-01",
              narration: "Fixture",
            },
            null,
            user,
          );
          const date = new Date().toLocaleDateString("en-CA", {
            timeZone: "Asia/Dhaka",
          });
          const dashboard =
            await require("../api/analytics/analytics.service").dashboard({
              from: date,
              to: date,
            });
          assert.equal(dashboard.other_income, 10);
          assert.equal(dashboard.expenses, 25);
          assert.equal(dashboard.profit, 35);
        },
      );
      await t.test(
        "dashboard and all six reports execute against real SQL",
        async () => {
          const date = new Date().toLocaleDateString("en-CA", {
            timeZone: "Asia/Dhaka",
          });
          for (const path of [
            "/api/analytics/dashboard",
            ...[
              "daily-salesperson",
              "monthly-salesperson",
              "daily-product",
              "salesperson-count",
              "monthly-product-salesperson",
              "monthly-product",
            ].map((t) => `/api/analytics/reports/${t}`),
          ]) {
            const response = await request(app)
              .get(`${path}?from=${date}&to=${date}`)
              .set("Authorization", `Bearer ${token}`);
            assert.equal(response.status, 200, JSON.stringify(response.body));
          }
          const dash =
            await require("../api/analytics/analytics.service").dashboard({
              from: date,
              to: date,
            });
          assert.ok(dash.orders >= 3);
          assert.ok(dash.revenue > 0);
        },
      );
    } finally {
      global.fetch = originalFetch;
      await pool.end();
      await admin.end();
    }
  },
);

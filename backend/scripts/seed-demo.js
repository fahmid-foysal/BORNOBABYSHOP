const fs = require("fs/promises");
const path = require("path");
const assert = require("node:assert/strict");
const { pool, transaction } = require("../config/database");
const { insert, one } = require("../lib/http");
const { barcode } = require("../api/catalog/catalog.service");
const { round, totals, expandComponents } = require("../lib/sale-math");

// One transaction, repeat-safe, and deliberately no online-sale or courier writes.
const marker = "BORNO_DEMO_V1";
const products = [
  ["Magnetic Building Blocks", "Magnetic toys", 380, 650, 0.45],
  ["Wooden Alphabet Puzzle", "Puzzles", 180, 320, 0.3],
  ["Rainbow Stacking Rings", "Learning toys", 160, 290, 0.25],
  ["Counting Beads Board", "Learning toys", 220, 390, 0.35],
  ["Soft Teddy Bear", "Plush toys", 280, 480, 0.4],
  ["Bunny Plush", "Plush toys", 200, 350, 0.25],
  ["Mini Racing Car", "Vehicles", 120, 220, 0.15],
  ["Pull Back School Bus", "Vehicles", 180, 330, 0.25],
  ["Dinosaur Figure Set", "Figures", 320, 550, 0.4],
  ["Farm Animal Set", "Figures", 240, 420, 0.3],
  ["Kids Watercolor Kit", "Art supplies", 150, 280, 0.2],
  ["Washable Crayon Box", "Art supplies", 90, 170, 0.12],
  ["Junior Doctor Kit", "Role play", 300, 520, 0.5],
  ["Mini Kitchen Play Set", "Role play", 450, 790, 0.65],
  ["Bubble Wand", "Outdoor toys", 50, 100, 0.1],
  ["Soft Football", "Outdoor toys", 170, 300, 0.3],
  ["Shape Sorting Cube", "Learning toys", 260, 450, 0.35],
  ["Wooden Train Set", "Vehicles", 500, 850, 0.75],
  ["Space Jigsaw Puzzle", "Puzzles", 140, 260, 0.18],
  ["Number Flash Cards", "Learning toys", 70, 140, 0.08],
  ["Large Building Brick Box", "Magnetic toys", 600, 990, 0.9],
  ["Princess Doll", "Figures", 250, 440, 0.3],
  ["Sensory Squeeze Ball", "Learning toys", 80, 150, 0.1],
  ["Classic Robot (Inactive)", "Vehicles", 350, 600, 0.45],
];

async function run() {
  const result = await transaction(async (db) => {
    const [[clock]] = await db.query("SELECT CURDATE() today");
    const today = clock.today;
    const month = today.slice(0, 7);
    const lastDay = Number(today.slice(8));
    const stamp = (day, hour = 12) =>
      `${month}-${String(Math.min(lastDay, Math.max(1, day))).padStart(2, "0")} ${String(hour).padStart(2, "0")}:00:00`;
    const onlineTables = [
      "online_sales",
      "online_sale_products",
      "online_sale_combos",
      "online_sale_payments",
      "steadfast_payments",
      "settlement_allocations",
    ];
    const onlineCounts = async () => {
      const counts = {};
      for (const table of onlineTables)
        counts[table] = String(
          (await one(db, "SELECT COUNT(*) total FROM ??", [table])).total,
        );
      counts.components = String(
        (
          await one(
            db,
            "SELECT COUNT(*) total FROM sale_components WHERE channel='online'",
          )
        ).total,
      );
      return counts;
    };
    const beforeOnline = await onlineCounts();
    const [existing] = await db.query(
      "SELECT id FROM offline_sales WHERE notes=? LIMIT 1",
      [`${marker}: sale 01`],
    );
    if (existing.length)
      return {
        alreadyExists: true,
        database: (await one(db, "SELECT DATABASE() name")).name,
      };
    const [admins] = await db.query(
      "SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1",
    );
    if (!admins.length)
      throw new Error("Run npm run seed first to create an administrator");
    const userId = admins[0].id;
    const methods = {};
    for (const method of ["Cash", "bKash", "Nagad", "Bank"]) {
      const [found] = await db.query(
        "SELECT id FROM payment_methods WHERE method=? ORDER BY id LIMIT 1",
        [method],
      );
      methods[method] =
        found[0]?.id || (await insert(db, "payment_methods", { method }));
    }
    const suppliers = [];
    for (const [index, name] of [
      "Little Wonders Wholesale",
      "Playtime Imports",
      "Happy Kids Distribution",
    ].entries())
      suppliers.push(
        await insert(db, "suppliers", {
          supplier_name: `[Demo] ${name}`,
          supplier_phone: `0100000200${index + 1}`,
        }),
      );
    const categories = new Map();
    for (const [name, parent] of [
      ["Toys", null],
      ["Educational toys", "Toys"],
      ["Learning toys", "Educational toys"],
      ["Building toys", "Educational toys"],
      ["Magnetic toys", "Building toys"],
      ["Puzzles", "Educational toys"],
      ["Plush toys", "Toys"],
      ["Vehicles", "Toys"],
      ["Figures", "Toys"],
      ["Creative play", "Toys"],
      ["Art supplies", "Creative play"],
      ["Role play", "Creative play"],
      ["Outdoor toys", "Toys"],
    ])
      categories.set(
        name,
        await insert(db, "categories", {
          category_name: `[Demo] ${name}`,
          parent_category_id: parent ? categories.get(parent) : null,
        }),
      );
    const employees = [];
    for (const [index, name] of ["Ayesha", "Rafi", "Nabila"].entries())
      employees.push(
        await insert(db, "employees", {
          name: `[Demo] ${name}`,
          phone: `0100000300${index + 1}`,
          rank: index === 0 ? "Shop manager" : "Sales associate",
          salary: index === 0 ? 22000 : 16000,
        }),
      );
    const catalog = [];
    for (const [
      index,
      [name, category, cost, price, weight],
    ] of products.entries()) {
      const code = await barcode(db, "product");
      const row = {
        barcode: code,
        product_name: `[Demo] ${name}`,
        description: `${marker}: fictional sample product for testing`,
        sale_price: price,
        purchase_price: cost,
        avg_weight: weight,
        default_delivery_charge: weight > 0.5 ? 100 : 70,
        status: index === 23 ? "inactive" : "active",
        supplier_id: suppliers[Math.floor(index / 8)],
        category_id: categories.get(category),
      };
      const key = await insert(db, "products", row);
      await db.query(
        "UPDATE barcode_registry SET entity_id=? WHERE barcode=?",
        [key, code],
      );
      catalog.push({
        ...row,
        id: key,
        initialStock: index === 22 ? 3 : index === 23 ? 20 : 80,
        adjustment: 0,
        sold: 0,
      });
    }
    const comboMap = new Map();
    const combos = [];
    for (const [name, contents] of [
      [
        "Learning Starter Bundle",
        [
          [0, 2],
          [1, 1],
          [19, 1],
        ],
      ],
      [
        "Cuddle and Play Bundle",
        [
          [4, 1],
          [5, 1],
          [2, 1],
        ],
      ],
      [
        "Little Racer Bundle",
        [
          [6, 2],
          [7, 1],
        ],
      ],
      [
        "Creative Afternoon Bundle",
        [
          [10, 1],
          [11, 2],
          [18, 1],
        ],
      ],
    ]) {
      const code = await barcode(db, "combo");
      const salePrice = round(
        contents.reduce(
          (sum, [index, quantity]) =>
            sum + catalog[index].sale_price * quantity,
          0,
        ) * 0.9,
      );
      const key = await insert(db, "product_combos", {
        barcode: code,
        combo_name: `[Demo] ${name}`,
        description: `${marker}: sample combo with saved component quantities`,
        sale_price: salePrice,
        delivery_charge: 90,
      });
      await db.query(
        "UPDATE barcode_registry SET entity_id=? WHERE barcode=?",
        [key, code],
      );
      const parts = contents.map(([index, quantity]) => ({
        product_id: catalog[index].id,
        quantity,
      }));
      for (const part of parts)
        await insert(db, "product_combo_items", {
          product_combo_id: key,
          ...part,
        });
      comboMap.set(String(key), parts);
      combos.push({
        id: key,
        barcode: code,
        name: `[Demo] ${name}`,
        sale_price: salePrice,
      });
    }
    const purchaseIds = [];
    for (let group = 0; group < 3; group++) {
      const key = await insert(db, "purchases", {
        supplier_id: suppliers[group],
        status: "active",
        notes: `${marker}: opening stock ${group + 1}`,
        created_at: stamp(1, 8),
        created_by: userId,
      });
      purchaseIds.push(key);
      let total = 0;
      for (const p of catalog.slice(group * 8, group * 8 + 8)) {
        await insert(db, "purchase_items", {
          purchase_id: key,
          product_id: p.id,
          quantity: p.initialStock,
          rate: p.purchase_price,
          status: "active",
        });
        total += p.initialStock * p.purchase_price;
      }
      await insert(db, "purchase_payouts", {
        purchase_id: key,
        amount: round(total * (group === 0 ? 1 : 0.4)),
        payment_method_id: methods.Bank,
        notes: `${marker}: supplier ${group === 0 ? "full" : "partial"} payment`,
        status: "active",
        created_at: stamp(1, 9),
        created_by: userId,
      });
    }
    for (const [index, quantity, reason] of [
      [0, 5, "Extra units counted on shelf"],
      [4, -2, "Damaged packaging removed"],
    ]) {
      await insert(db, "stock_adjustments", {
        product_id: catalog[index].id,
        quantity,
        reason: `${marker}: ${reason}`,
        created_at: stamp(1, 9),
        created_by: userId,
      });
      catalog[index].adjustment = quantity;
    }
    const customers = [];
    for (let i = 0; i < 12; i++)
      customers.push(
        await insert(db, "customers", {
          cus_name: `[Demo] Customer ${String(i + 1).padStart(2, "0")}`,
          cus_phone: `01000001${String(i).padStart(3, "0")}`,
          cus_address: `Sample address ${i + 1}, ${["Dhanmondi", "Mirpur", "Uttara", "Mohammadpur"][i % 4]}, Dhaka (demo)`,
        }),
      );
    const sales = [];
    const byProductId = new Map(catalog.map((p) => [String(p.id), p]));
    for (let i = 0; i < 30; i++) {
      const day =
        i >= 27 ? lastDay : 1 + Math.floor((i * Math.max(0, lastDay - 1)) / 29);
      const createdAt = stamp(day, 10 + (i % 8));
      const paymentAt = stamp(day + 1, 11);
      const first = catalog[i % 22],
        second = catalog[(i + 7) % 22];
      const items = [
        {
          item_type: "product",
          item_id: first.id,
          quantity: 1 + (i % 2),
          rate: first.sale_price,
        },
        {
          item_type: "product",
          item_id: second.id,
          quantity: 1,
          rate: second.sale_price,
        },
      ];
      if (i % 3 === 0) {
        const c = combos[Math.floor(i / 3) % combos.length];
        items.push({
          item_type: "combo",
          item_id: c.id,
          quantity: 1,
          rate: c.sale_price,
        });
      }
      const subtotal = totals(items).subtotal;
      const discount = i % 3 === 0 ? round(subtotal * 0.05) : 0;
      const payable = round(subtotal - discount);
      const returned = i % 10 === 9;
      const paid =
        i % 12 === 0 ? 0 : i % 4 === 0 ? round(payable * 0.4) : payable;
      const key = await insert(db, "offline_sales", {
        customer_id: customers[i % customers.length],
        status: returned ? "returned" : paid < payable ? "due" : "paid",
        notes: `${marker}: sale ${String(i + 1).padStart(2, "0")}`,
        sales_employee_id: i === 26 ? null : employees[i % 3],
        final_discount: discount,
        created_at: createdAt,
        created_by: userId,
      });
      for (const item of items)
        await insert(
          db,
          item.item_type === "product"
            ? "offline_sale_products"
            : "offline_sale_combos",
          {
            offline_sale_id: key,
            [item.item_type === "product" ? "product_id" : "product_combo_id"]:
              item.item_id,
            quantity: item.quantity,
            rate: item.rate,
            status: "active",
          },
        );
      for (const [productId, quantity] of expandComponents(items, comboMap)) {
        const p = byProductId.get(productId);
        await insert(db, "sale_components", {
          channel: "offline",
          sale_id: key,
          product_id: p.id,
          quantity,
          cost_rate: p.purchase_price,
          category_id: p.category_id,
          active: returned ? 0 : 1,
        });
        if (!returned) p.sold += quantity;
      }
      const method = [methods.Cash, methods.bKash, methods.Nagad][i % 3];
      if (paid)
        await insert(db, "offline_sale_payments", {
          offline_sale_id: key,
          payment_method_id: method,
          amount: paid,
          notes: `${marker}: checkout`,
          status: "active",
          created_at: createdAt,
          created_by: userId,
        });
      if (returned && paid)
        await insert(db, "offline_sale_payments", {
          offline_sale_id: key,
          payment_method_id: method,
          amount: -paid,
          notes: "RETURN_PAYMENT",
          status: "active",
          created_at: paymentAt,
          created_by: userId,
        });
      if (!returned && paid < payable && i % 7 === 0) {
        await insert(db, "offline_sale_payments", {
          offline_sale_id: key,
          payment_method_id: method,
          amount: round(payable - paid),
          notes: `${marker}: later balance collection`,
          status: "active",
          created_at: paymentAt,
          created_by: userId,
        });
        await db.query("UPDATE offline_sales SET status='paid' WHERE id=?", [
          key,
        ]);
      }
      sales.push(key);
    }
    const expenseAccounts = [];
    for (const title of [
      "Shop rent",
      "Utilities",
      "Packaging",
      "Shop supplies",
    ])
      expenseAccounts.push(
        await insert(db, "expense_accounts", { title: `[Demo] ${title}` }),
      );
    for (const [index, value] of [12000, 1800, 750, 450, 300, 600].entries()) {
      const day = Math.min(lastDay, 2 + index * 3);
      await insert(db, "expenses", {
        expense_account_id: expenseAccounts[index % 4],
        narration: `${marker}: sample operating expense ${index + 1}`,
        amount: value,
        expense_date: stamp(day).slice(0, 10),
        created_at: stamp(day, 9),
        created_by: userId,
      });
    }
    const incomeAccount = await insert(db, "income_accounts", {
      title: "[Demo] Gift wrapping services",
    });
    for (const [index, value] of [250, 400, 150].entries()) {
      const day = Math.min(lastDay, 4 + index * 7);
      await insert(db, "incomes", {
        income_account_id: incomeAccount,
        narration: `${marker}: sample wrapping income ${index + 1}`,
        amount: value,
        income_date: stamp(day).slice(0, 10),
        created_at: stamp(day, 16),
        created_by: userId,
      });
    }
    // Verify stock against independently accumulated expected quantities before committing.
    for (const p of catalog) {
      const row = await one(
        db,
        "SELECT stock FROM product_stock WHERE product_id=?",
        [p.id],
      );
      assert.equal(
        Number(row.stock),
        p.initialStock + p.adjustment - p.sold,
        `Stock mismatch for ${p.product_name}`,
      );
      assert.ok(Number(row.stock) >= 0, `Negative stock for ${p.product_name}`);
    }
    assert.deepEqual(
      await onlineCounts(),
      beforeOnline,
      "Online/courier tables must remain unchanged",
    );
    const [statuses] = await db.query(
      "SELECT status,COUNT(*) count FROM offline_sales WHERE id IN (?) GROUP BY status",
      [sales],
    );
    return {
      alreadyExists: false,
      database: (await one(db, "SELECT DATABASE() name")).name,
      products: catalog.length,
      combos: combos.length,
      categories: categories.size,
      suppliers: suppliers.length,
      employees: employees.length,
      purchases: purchaseIds.length,
      offlineSales: sales.length,
      statuses,
      expenses: 6,
      incomes: 3,
      stockAdjustments: 2,
      onlineSalesAdded: 0,
    };
  });
  const [catalog] = await pool.query(
    "SELECT p.barcode,p.product_name,ps.stock,p.sale_price,p.status FROM products p JOIN product_stock ps ON ps.product_id=p.id WHERE p.description=? ORDER BY p.id",
    [`${marker}: fictional sample product for testing`],
  );
  const [combos] = await pool.query(
    "SELECT barcode,combo_name,sale_price FROM product_combos WHERE description=? ORDER BY id",
    [`${marker}: sample combo with saved component quantities`],
  );
  const table = (headers, rows) =>
    [
      headers,
      "|" +
        headers
          .split("|")
          .filter((s) => s.trim())
          .map(() => " --- ")
          .join("|") +
        "|",
      ...rows,
    ].join("\n");
  await fs.writeFile(
    path.join(__dirname, "../../docs/demo-data.md"),
    `# Demo data\n\nInserted in \`${result.database}\`. Records use [Demo] names and ${marker} notes. Online sales and courier tables are untouched.\n\n30 offline sales include paid, due, returned, discounts, multiple payment methods, and follow-up collections. Dates cover the current month, including today. Existing users and their passwords are unchanged.\n\n## Product barcodes\n\n${table(
      "| Barcode | Product | Stock | Sale price | Status |",
      catalog.map(
        (p) =>
          `| ${p.barcode} | ${p.product_name} | ${p.stock} | ${p.sale_price} | ${p.status} |`,
      ),
    )}\n\n## Combo barcodes\n\n${table(
      "| Barcode | Combo | Sale price |",
      combos.map((c) => `| ${c.barcode} | ${c.combo_name} | ${c.sale_price} |`),
    )}\n\nRun \`npm run seed:demo\` in backend to insert this dataset once; reruns skip it. This command does not reset edited demo records.\n`,
  );
  console.log(JSON.stringify(result, null, 2));
  console.log("Barcode reference written to docs/demo-data.md");
}
run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

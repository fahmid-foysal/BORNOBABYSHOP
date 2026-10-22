const { pool, transaction } = require("../../config/database");
const {
  z,
  id,
  amount,
  HttpError,
  one,
  insert,
  pagination,
  pageResult,
} = require("../../lib/http");
const optionalText = z.string().trim().max(255).nullable().optional();
const nullableId = id.nullable().optional();
const title = z.string().trim().min(1).max(255);
const configs = {
  suppliers: {
    module: "MASTER_DATA",
    schema: z.object({ supplier_name: title, supplier_phone: optionalText }),
  },
  categories: {
    module: "MASTER_DATA",
    schema: z.object({ category_name: title, parent_category_id: nullableId }),
  },
  payment_methods: {
    module: "MASTER_DATA",
    schema: z.object({ method: title }),
  },
  expense_accounts: { module: "MASTER_DATA", schema: z.object({ title }) },
  income_accounts: { module: "MASTER_DATA", schema: z.object({ title }) },
  employees: {
    module: "MASTER_DATA",
    schema: z.object({
      name: title,
      phone: optionalText,
      rank: optionalText,
      salary: amount.default(0),
    }),
  },
  expenses: {
    module: "EXPENSE",
    schema: z.object({
      expense_account_id: id,
      narration: z.string().max(5000).nullable().optional(),
      amount,
      expense_date: z.string().date(),
    }),
  },
  incomes: {
    module: "INCOME",
    schema: z.object({
      income_account_id: id,
      narration: z.string().max(5000).nullable().optional(),
      amount,
      income_date: z.string().date(),
    }),
  },
  stock_adjustments: {
    module: "STOCK_ADJUSTMENTS",
    schema: z.object({
      product_id: id,
      quantity: z.coerce
        .number()
        .finite()
        .multipleOf(0.001)
        .min(-999999999)
        .max(999999999)
        .refine((n) => n !== 0, "Quantity cannot be zero"),
      reason: z.string().trim().min(1).max(5000),
    }),
  },
};
exports.configs = configs;
exports.config = (resource) => {
  if (!configs[resource]) throw new HttpError(404, "Unknown resource");
  return configs[resource];
};
exports.list = async (resource, q) => {
  exports.config(resource);
  const p = pagination(q);
  const fields = Object.keys(configs[resource].schema.shape).filter((k) =>
    [
      "supplier_name",
      "category_name",
      "method",
      "title",
      "name",
      "narration",
      "reason",
    ].includes(k),
  );
  const params = [resource];
  let where = "";
  if (q.search && fields.length) {
    where = ` WHERE (${fields.map((f) => "CAST(?? AS CHAR) LIKE ?").join(" OR ")})`;
    for (const f of fields)
      params.push(f, `%${String(q.search).slice(0, 255)}%`);
  }
  const [count] = await pool.query(
    `SELECT COUNT(*) total FROM ??${where}`,
    params,
  );
  const [rows] = await pool.query(
    `SELECT * FROM ??${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, p.limit, p.offset],
  );
  if (resource === "stock_adjustments")
    for (const r of rows) {
      const [ps] = await pool.query(
        "SELECT product_name,barcode FROM products WHERE id=?",
        [r.product_id],
      );
      Object.assign(r, ps[0]);
    }
  return pageResult(rows, count[0].total, p);
};
exports.save = async (resource, raw, key, user) => {
  const config = exports.config(resource);
  const b = config.schema.parse(raw);
  return transaction(async (db) => {
    if (key) {
      await one(db, "SELECT id FROM ?? WHERE id=? FOR UPDATE", [
        resource,
        id.parse(key),
      ]);
      if (resource === "expenses") {
        const row = await one(db, "SELECT narration FROM expenses WHERE id=?", [
          key,
        ]);
        if (row.narration?.startsWith("STEADFAST_CHARGES "))
          throw new HttpError(409, "Imported courier charges are immutable");
      }
    }
    if (resource === "categories" && b.parent_category_id) {
      let parent = b.parent_category_id;
      const seen = new Set(key ? [String(key)] : []);
      while (parent) {
        if (seen.has(String(parent)))
          throw new HttpError(400, "A category cannot be its own ancestor");
        seen.add(String(parent));
        const row = await one(
          db,
          "SELECT parent_category_id FROM categories WHERE id=?",
          [parent],
        );
        parent = row.parent_category_id;
      }
    }
    if (["expenses", "incomes", "stock_adjustments"].includes(resource) && !key)
      b.created_by = user.id;
    if (key) {
      await db.query("UPDATE ?? SET ? WHERE id=?", [resource, b, key]);
      return { id: key };
    }
    return { id: await insert(db, resource, b) };
  });
};
exports.remove = async (resource, key) => {
  exports.config(resource);
  return transaction(async (db) => {
    await one(db, "SELECT id FROM ?? WHERE id=?", [resource, id.parse(key)]);
    // Courier accounting entries can only be changed through their settlement.
    if (resource === "expenses") {
      const row = await one(db, "SELECT narration FROM expenses WHERE id=?", [
        key,
      ]);
      if (row.narration?.startsWith("STEADFAST_CHARGES "))
        throw new HttpError(409, "Imported courier charges are immutable");
    }
    await db.query("DELETE FROM ?? WHERE id=?", [resource, key]);
    return { deleted: true };
  });
};
exports.lookups = async (user) => {
  const output = {};
  const access = (m) => user.role === "admin" || user.permissions.includes(m);
  const allowed = {
    categories: [
      "PRODUCTS",
      "PRODUCT_COMBOS",
      "SALES",
      "PURCHASES",
      "STOCK_ADJUSTMENTS",
      "REPORTS",
    ],
    suppliers: ["PRODUCTS", "PURCHASES"],
    payment_methods: ["SALES", "PURCHASES", "STEADFAST_PAYMENTS"],
    employees: ["SALES", "REPORTS"],
    expense_accounts: ["EXPENSE"],
    income_accounts: ["INCOME"],
  };
  for (const [table, mods] of Object.entries(allowed))
    if (access("MASTER_DATA") || mods.some(access)) {
      const [rows] = await pool.query("SELECT * FROM ?? ORDER BY id", [table]);
      output[table] = rows;
    }
  return output;
};

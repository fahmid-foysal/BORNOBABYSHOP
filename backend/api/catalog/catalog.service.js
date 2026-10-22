const crypto = require("crypto");
const { pool, transaction } = require("../../config/database");
const {
  z,
  id,
  amount,
  positive,
  HttpError,
  one,
  insert,
  pagination,
  pageResult,
} = require("../../lib/http");
const { cleanup } = require("../../middleware/upload");
const productSchema = z.object({
  product_name: z.string().trim().min(1).max(255),
  description: z.string().max(10000).nullable().optional(),
  sale_price: amount,
  purchase_price: amount.default(0),
  avg_weight: z.coerce
    .number()
    .finite()
    .min(0)
    .max(999999999)
    .multipleOf(0.001)
    .default(0),
  default_delivery_charge: amount.default(0),
  status: z.enum(["active", "inactive"]).default("active"),
  supplier_id: id.nullable().optional(),
  category_id: id.nullable().optional(),
});
const comboSchema = z.object({
  combo_name: z.string().trim().min(1).max(255),
  description: z.string().max(10000).nullable().optional(),
  sale_price: amount,
  delivery_charge: amount.default(0),
  items: z
    .array(z.object({ product_id: id, quantity: positive }))
    .min(1)
    .max(200),
});
async function barcode(db, type) {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = Array.from(
      { length: 5 },
      () => chars[crypto.randomInt(36)],
    ).join("");
    const [exists] = await db.query(
      "SELECT barcode FROM products WHERE barcode=? UNION ALL SELECT barcode FROM product_combos WHERE barcode=?",
      [code, code],
    );
    if (exists.length) continue;
    try {
      await insert(db, "barcode_registry", {
        barcode: code,
        entity_type: type,
      });
      return code;
    } catch (e) {
      if (e.code !== "ER_DUP_ENTRY") throw e;
    }
  }
  throw new HttpError(409, "Failed to generate barcode after 50 attempts");
}
exports.barcode = barcode;
exports.categories = async () => {
  const [rows] = await pool.query(
    "SELECT * FROM categories ORDER BY category_name",
  );
  return rows;
};
async function categoryFilter(q) {
  if (!q.category_id) return null;
  const root = id.parse(q.category_id);
  const rows = await exports.categories();
  const allowed = new Set([String(root)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of rows)
      if (
        allowed.has(String(c.parent_category_id)) &&
        !allowed.has(String(c.id))
      ) {
        allowed.add(String(c.id));
        changed = true;
      }
  }
  if (q.category_ids !== undefined) {
    const selected = String(q.category_ids).split(",").filter(Boolean);
    return [
      root,
      ...selected.filter((v) => allowed.has(String(v))).map(Number),
    ];
  }
  return [...allowed].map(Number);
}
exports.list = async (type, q) => {
  const p = pagination(q);
  const cats = await categoryFilter(q);
  const isCombo = type === "combos";
  let params = [];
  let where = " WHERE 1=1";
  if (q.search) {
    where += isCombo
      ? " AND (p.combo_name LIKE ? OR p.barcode LIKE ?)"
      : " AND (p.product_name LIKE ? OR p.barcode LIKE ?)";
    params.push(
      `%${String(q.search).slice(0, 255)}%`,
      `%${String(q.search).slice(0, 255)}%`,
    );
  }
  if (q.barcode) {
    where += " AND p.barcode=?";
    params.push(String(q.barcode).toUpperCase());
  }
  if (q.status && !isCombo) {
    where += " AND p.status=?";
    params.push(q.status);
  }
  if (cats) {
    where += isCombo
      ? " AND EXISTS(SELECT 1 FROM product_combo_items ci JOIN products cp ON cp.id=ci.product_id WHERE ci.product_combo_id=p.id AND cp.category_id IN (?))"
      : " AND p.category_id IN (?)";
    params.push(cats);
  }
  const table = isCombo ? "product_combos" : "products";
  const [count] = await pool.query(
    `SELECT COUNT(*) total FROM ${table} p${where}`,
    params,
  );
  const [rows] = await pool.query(
    `SELECT p.*,${isCombo ? "'combo' item_type,p.combo_name name,COALESCE((SELECT MIN(FLOOR(ps.stock/ci.quantity)) FROM product_combo_items ci JOIN product_stock ps ON ps.product_id=ci.product_id WHERE ci.product_combo_id=p.id),0) stock,(SELECT img_path FROM product_combo_images WHERE product_combo_id=p.id ORDER BY id LIMIT 1) image" : "'product' item_type,p.product_name name,ps.stock,c.category_name,(SELECT img_path FROM product_images WHERE product_id=p.id ORDER BY id LIMIT 1) image"},(SELECT MAX(s.created_at) FROM sale_lines l JOIN all_sales s ON s.id=l.sale_id AND s.channel=l.channel WHERE l.item_type='${isCombo ? "combo" : "product"}' AND l.item_id=p.id AND s.status<>'returned') last_sold FROM ${table} p ${isCombo ? "" : "LEFT JOIN product_stock ps ON ps.product_id=p.id LEFT JOIN categories c ON c.id=p.category_id"}${where} ORDER BY ${q.recent === "1" ? "last_sold DESC," : ""}p.id DESC LIMIT ? OFFSET ?`,
    [...params, p.limit, p.offset],
  );
  return pageResult(rows, count[0].total, p);
};
exports.search = async (q) => {
  if (q.products_only === "1")
    return exports.list("products", { ...q, recent: "1", status: "active" });
  const p = pagination(q);
  // Combined pagination is performed in SQL below rather than truncating either catalog.
  const cats = await categoryFilter(q);
  const params = [];
  let where = " WHERE (kind='combo' OR status='active')";
  if (q.search) {
    where += " AND (name LIKE ? OR barcode LIKE ?)";
    params.push(`%${q.search}%`, `%${q.search}%`);
  }
  if (q.barcode) {
    where += " AND barcode=?";
    params.push(String(q.barcode).toUpperCase());
  }
  if (cats) {
    where +=
      " AND ((kind='product' AND category_id IN (?)) OR (kind='combo' AND EXISTS(SELECT 1 FROM product_combo_items ci JOIN products cp ON cp.id=ci.product_id WHERE ci.product_combo_id=u.id AND cp.category_id IN (?))))";
    params.push(cats, cats);
  }
  const union =
    "(SELECT p.id,p.barcode,p.product_name name,p.sale_price,p.default_delivery_charge delivery_charge,p.status,p.category_id,'product' kind FROM products p UNION ALL SELECT c.id,c.barcode,c.combo_name,c.sale_price,c.delivery_charge,'active',NULL,'combo' FROM product_combos c) u";
  const [count] = await pool.query(
    `SELECT COUNT(*) total FROM ${union}${where}`,
    params,
  );
  const [rows] = await pool.query(
    `SELECT u.*,(SELECT MAX(s.created_at) FROM sale_lines l JOIN all_sales s ON s.id=l.sale_id AND s.channel=l.channel WHERE l.item_type=u.kind AND l.item_id=u.id AND s.status<>'returned') last_sold FROM ${union}${where} ORDER BY last_sold DESC,u.id DESC,u.kind LIMIT ? OFFSET ?`,
    [...params, p.limit, p.offset],
  );
  for (const row of rows) {
    const full = await exports.detail(
      row.kind === "product" ? "products" : "combos",
      row.id,
    );
    Object.assign(row, { ...full, item_type: row.kind, name: row.name });
  }
  return pageResult(rows, count[0].total, p);
};
exports.detail = async (type, key) => {
  const combo = type === "combos";
  const row = await one(
    pool,
    `SELECT * FROM ${combo ? "product_combos" : "products"} WHERE id=?`,
    [id.parse(key)],
  );
  const [images] = await pool.query(
    `SELECT * FROM ${combo ? "product_combo_images" : "product_images"} WHERE ${combo ? "product_combo_id" : "product_id"}=?`,
    [key],
  );
  row.images = images;
  if (combo) {
    const [items] = await pool.query(
      "SELECT ci.*,p.product_name,p.barcode,p.category_id,ps.stock FROM product_combo_items ci JOIN products p ON p.id=ci.product_id LEFT JOIN product_stock ps ON ps.product_id=p.id WHERE ci.product_combo_id=?",
      [key],
    );
    row.items = items;
    const categories = await exports.categories();
    const byId = new Map(categories.map((c) => [String(c.id), c]));
    for (const item of items) {
      item.category_chain = [];
      let categoryId = item.category_id;
      const seen = new Set();
      while (categoryId && !seen.has(String(categoryId))) {
        seen.add(String(categoryId));
        const category = byId.get(String(categoryId));
        if (!category) break;
        item.category_chain.unshift(category);
        categoryId = category.parent_category_id;
      }
    }
    row.stock = items.length
      ? Math.min(...items.map((i) => Math.floor(i.stock / i.quantity)))
      : 0;
  } else {
    row.stock = (
      await one(pool, "SELECT stock FROM product_stock WHERE product_id=?", [
        key,
      ])
    ).stock;
    row.category_chain = [];
    let cat = row.category_id;
    const seen = new Set();
    while (cat && !seen.has(String(cat))) {
      seen.add(String(cat));
      const c = await one(pool, "SELECT * FROM categories WHERE id=?", [cat]);
      row.category_chain.unshift(c);
      cat = c.parent_category_id;
    }
  }
  row.item_type = combo ? "combo" : "product";
  row.name = combo ? row.combo_name : row.product_name;
  row.image = images[0]?.img_path;
  return row;
};
exports.save = async (type, raw, key, files) => {
  try {
    const combo = type === "combos";
    const b = (combo ? comboSchema : productSchema).parse(raw);
    const items = b.items;
    delete b.items;
    return await transaction(async (db) => {
      const table = combo ? "product_combos" : "products";
      let entityId = key && id.parse(key);
      if (entityId) {
        await one(db, "SELECT id FROM ?? WHERE id=? FOR UPDATE", [
          table,
          entityId,
        ]);
        await db.query("UPDATE ?? SET ? WHERE id=?", [table, b, entityId]);
      } else {
        b.barcode = await barcode(db, combo ? "combo" : "product");
        entityId = await insert(db, table, b);
        await db.query(
          "UPDATE barcode_registry SET entity_id=? WHERE barcode=?",
          [entityId, b.barcode],
        );
      }
      if (combo) {
        await db.query(
          "DELETE FROM product_combo_items WHERE product_combo_id=?",
          [entityId],
        );
        const merged = new Map();
        for (const i of items)
          merged.set(
            i.product_id,
            (merged.get(i.product_id) || 0) + i.quantity,
          );
        for (const [product_id, quantity] of merged)
          await insert(db, "product_combo_items", {
            product_combo_id: entityId,
            product_id,
            quantity,
          });
      }
      if (raw.remove_image_ids) {
        const ids = z.array(id).parse(raw.remove_image_ids);
        if (ids.length)
          await db.query(
            `DELETE FROM ${combo ? "product_combo_images" : "product_images"} WHERE ${combo ? "product_combo_id" : "product_id"}=? AND id IN (?)`,
            [entityId, ids],
          );
      }
      for (const f of files || [])
        await insert(db, combo ? "product_combo_images" : "product_images", {
          [combo ? "product_combo_id" : "product_id"]: entityId,
          img_path: `/uploads/${f.filename}`,
        });
      return { id: entityId, barcode: b.barcode };
    });
  } catch (e) {
    await cleanup(files);
    throw e;
  }
};
exports.remove = async (type, key) =>
  transaction(async (db) => {
    const combo = type === "combos";
    const table = combo ? "product_combos" : "products";
    await one(db, "SELECT id FROM ?? WHERE id=?", [table, id.parse(key)]);
    await db.query("DELETE FROM ?? WHERE id=?", [table, key]);
    await db.query(
      "DELETE FROM barcode_registry WHERE entity_type=? AND entity_id=?",
      [combo ? "combo" : "product", key],
    );
    return { deleted: true };
  });

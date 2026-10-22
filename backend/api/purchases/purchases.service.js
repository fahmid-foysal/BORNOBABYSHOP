const { pool, transaction } = require("../../config/database");
const {
  z,
  id,
  amount,
  positive,
  HttpError,
  insert,
  one,
  pagination,
  pageResult,
} = require("../../lib/http");
const schema = z.object({
  supplier_id: id,
  notes: z.string().max(5000).nullable().optional(),
  items: z
    .array(z.object({ product_id: id, quantity: positive, rate: amount }))
    .min(1)
    .max(500),
  paid_amount: amount.default(0),
  payment_method_id: id.nullable().optional(),
});
exports.detail = async (key) => {
  const row = await one(
    pool,
    "SELECT p.*,s.supplier_name FROM purchases p JOIN suppliers s ON s.id=p.supplier_id WHERE p.id=?",
    [id.parse(key)],
  );
  const [items] = await pool.query(
    "SELECT pi.*,p.product_name,p.barcode FROM purchase_items pi JOIN products p ON p.id=pi.product_id WHERE purchase_id=?",
    [key],
  );
  const [payments] = await pool.query(
    "SELECT pp.*,pm.method FROM purchase_payouts pp JOIN payment_methods pm ON pm.id=pp.payment_method_id WHERE purchase_id=?",
    [key],
  );
  return {
    ...row,
    items,
    payments,
    total: items.reduce((s, i) => s + i.quantity * i.rate, 0),
    paid: payments.reduce((s, i) => s + i.amount, 0),
  };
};
exports.list = async (q) => {
  const p = pagination(q);
  let where = "";
  let params = [];
  if (q.search) {
    where =
      " WHERE s.supplier_name LIKE ? OR p.notes LIKE ? OR CAST(p.id AS CHAR)=?";
    params = [`%${q.search}%`, `%${q.search}%`, q.search];
  }
  const [[count]] = await pool.query(
    `SELECT COUNT(*) total FROM purchases p JOIN suppliers s ON s.id=p.supplier_id${where}`,
    params,
  );
  const [ids] = await pool.query(
    `SELECT p.id FROM purchases p JOIN suppliers s ON s.id=p.supplier_id${where} ORDER BY p.id DESC LIMIT ? OFFSET ?`,
    [...params, p.limit, p.offset],
  );
  const rows = [];
  for (const r of ids) rows.push(await exports.detail(r.id));
  return pageResult(rows, count.total, p);
};
exports.save = async (raw, key, user) => {
  const b = schema.parse(raw);
  return transaction(async (db) => {
    let purchaseId = key && id.parse(key);
    const affectedProducts = new Set(b.items.map((item) => item.product_id));
    if (purchaseId) {
      await one(db, "SELECT id FROM purchases WHERE id=? FOR UPDATE", [
        purchaseId,
      ]);
      await db.query("UPDATE purchases SET supplier_id=?,notes=? WHERE id=?", [
        b.supplier_id,
        b.notes || null,
        purchaseId,
      ]);
      const [oldItems] = await db.query(
        "SELECT product_id FROM purchase_items WHERE purchase_id=?",
        [purchaseId],
      );
      oldItems.forEach((item) => affectedProducts.add(item.product_id));
      await db.query("DELETE FROM purchase_items WHERE purchase_id=?", [
        purchaseId,
      ]);
    } else
      purchaseId = await insert(db, "purchases", {
        supplier_id: b.supplier_id,
        notes: b.notes || null,
        status: "active",
        created_by: user.id,
      });
    for (const item of b.items) {
      await one(db, "SELECT id FROM products WHERE id=? FOR UPDATE", [
        item.product_id,
      ]);
      await insert(db, "purchase_items", {
        purchase_id: purchaseId,
        ...item,
        status: "active",
      });
      await db.query("UPDATE products SET purchase_price=? WHERE id=?", [
        item.rate,
        item.product_id,
      ]);
    }
    if (!key && b.paid_amount) {
      if (!b.payment_method_id)
        throw new HttpError(400, "Select a payment method");
      if (b.paid_amount > b.items.reduce((s, i) => s + i.quantity * i.rate, 0))
        throw new HttpError(400, "Payment cannot exceed purchase total");
      await insert(db, "purchase_payouts", {
        purchase_id: purchaseId,
        amount: b.paid_amount,
        payment_method_id: b.payment_method_id,
        status: "active",
        created_by: user.id,
      });
    }
    const [negative] = key
      ? await db.query(
          "SELECT product_id FROM product_stock WHERE stock<0 AND product_id IN (?) LIMIT 1",
          [[...affectedProducts]],
        )
      : [[]];
    if (negative.length)
      throw new HttpError(
        409,
        "This change would make existing product stock negative",
      );
    const [[paid]] = await db.query(
      "SELECT COALESCE(SUM(amount),0) paid FROM purchase_payouts WHERE purchase_id=?",
      [purchaseId],
    );
    if (paid.paid > b.items.reduce((s, i) => s + i.quantity * i.rate, 0))
      throw new HttpError(
        409,
        "Purchase total cannot be lower than recorded payments",
      );
    return { id: purchaseId };
  });
};
exports.payment = async (key, raw, user) => {
  const b = z
    .object({
      amount: amount.refine((value) => value > 0, "Amount must be positive"),
      payment_method_id: id,
      notes: z.string().max(5000).optional(),
    })
    .parse(raw);
  return transaction(async (db) => {
    await one(
      db,
      "SELECT id FROM purchases WHERE id=? AND status='active' FOR UPDATE",
      [id.parse(key)],
    );
    const [[totals]] = await db.query(
      "SELECT (SELECT COALESCE(SUM(quantity*rate),0) FROM purchase_items WHERE purchase_id=?) total,(SELECT COALESCE(SUM(amount),0) FROM purchase_payouts WHERE purchase_id=?) paid",
      [key, key],
    );
    if (b.amount > totals.total - totals.paid)
      throw new HttpError(400, "Payment exceeds the remaining balance");
    return {
      id: await insert(db, "purchase_payouts", {
        ...b,
        purchase_id: key,
        status: "active",
        created_by: user.id,
      }),
    };
  });
};
exports.remove = async (key) =>
  transaction(async (db) => {
    await one(db, "SELECT id FROM purchases WHERE id=? FOR UPDATE", [
      id.parse(key),
    ]);
    const [[paid]] = await db.query(
      "SELECT COUNT(*) n FROM purchase_payouts WHERE purchase_id=?",
      [key],
    );
    if (Number(paid.n) > 0)
      throw new HttpError(409, "A purchase with payments cannot be deleted");
    await db.query("UPDATE purchases SET status='cancelled' WHERE id=?", [key]);
    const [negative] = await db.query(
      "SELECT ps.product_id FROM product_stock ps JOIN purchase_items pi ON pi.product_id=ps.product_id WHERE pi.purchase_id=? AND ps.stock<0 LIMIT 1",
      [key],
    );
    if (negative.length)
      throw new HttpError(409, "Purchased stock has already been sold");
    await db.query("DELETE FROM purchase_items WHERE purchase_id=?", [key]);
    await db.query("DELETE FROM purchases WHERE id=?", [key]);
    return { deleted: true };
  });

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
const { totals, round, expandComponents } = require("../../lib/sale-math");
const saleSchema = z.object({
  customer: z.object({
    cus_name: z.string().trim().min(1).max(255),
    cus_phone: z.string().trim().min(7).max(30),
    cus_address: z.string().trim().max(5000).default(""),
  }),
  items: z
    .array(
      z.object({
        item_type: z.enum(["product", "combo"]),
        item_id: id,
        quantity: positive,
        rate: amount,
      }),
    )
    .min(1)
    .max(500),
  final_discount: amount.default(0),
  delivery_charge: amount.default(0),
  paid_amount: amount.default(0),
  payment_method_id: id.nullable().optional(),
  sales_employee_id: id.nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  send_to_steadfast: z.boolean().default(true),
});
const channel = (c) => {
  if (!["online", "offline"].includes(c))
    throw new HttpError(404, "Unknown sales channel");
  return c;
};
exports.channel = channel;
async function createOne(db, c, b, user) {
  if (c === "online" && !b.customer.cus_address)
    throw new HttpError(400, "Online orders require a delivery address");
  const value = totals(
    b.items,
    b.final_discount,
    c === "online" ? b.delivery_charge : 0,
    b.paid_amount,
  );
  if (b.final_discount > value.subtotal)
    throw new HttpError(400, "Discount exceeds the subtotal");
  if (b.paid_amount > value.payable)
    throw new HttpError(400, "Payment exceeds payable amount");
  if (b.paid_amount && !b.payment_method_id)
    throw new HttpError(400, "Select a payment method");
  const combos = new Map();
  for (const i of b.items) {
    if (i.item_type === "combo" && !combos.has(String(i.item_id))) {
      await one(db, "SELECT id FROM product_combos WHERE id=? FOR UPDATE", [
        i.item_id,
      ]);
      const [parts] = await db.query(
        "SELECT product_id,quantity FROM product_combo_items WHERE product_combo_id=?",
        [i.item_id],
      );
      if (!parts.length) throw new HttpError(400, "Combo has no products");
      combos.set(String(i.item_id), parts);
    }
  }
  const components = expandComponents(b.items, combos);
  const products = new Map();
  for (const [productId, qty] of [...components].sort(
    (a, b) => Number(a[0]) - Number(b[0]),
  )) {
    const product = await one(
      db,
      "SELECT p.*,ps.stock FROM products p JOIN product_stock ps ON ps.product_id=p.id WHERE p.id=? FOR UPDATE",
      [productId],
    );
    if (product.status !== "active")
      throw new HttpError(409, `${product.product_name} is inactive`);
    if (Number(product.stock) < qty)
      throw new HttpError(
        409,
        `Insufficient stock for ${product.product_name}: ${product.stock} available`,
      );
    products.set(productId, product);
  }
  await db.query(
    "INSERT INTO customers SET ? ON DUPLICATE KEY UPDATE cus_name=VALUES(cus_name),cus_address=VALUES(cus_address)",
    [b.customer],
  );
  const customer = await one(db, "SELECT id FROM customers WHERE cus_phone=?", [
    b.customer.cus_phone,
  ]);
  const header = {
    customer_id: customer.id,
    status: value.due > 0 ? "due" : "paid",
    notes: b.notes || null,
    sales_employee_id: b.sales_employee_id || null,
    final_discount: b.final_discount,
    created_by: user.id,
  };
  if (c === "online")
    Object.assign(header, {
      delivery_charge: b.delivery_charge,
      steadfast_cod_amount: round(value.payable - b.paid_amount),
      steadfast_note: b.notes || null,
    });
  const key = await insert(db, `${c}_sales`, header);
  for (const i of b.items)
    await insert(
      db,
      `${c}_sale_${i.item_type === "combo" ? "combos" : "products"}`,
      {
        [`${c}_sale_id`]: key,
        [i.item_type === "combo" ? "product_combo_id" : "product_id"]:
          i.item_id,
        quantity: i.quantity,
        rate: i.rate,
        status: "active",
      },
    );
  for (const [productId, quantity] of components) {
    const p = products.get(productId);
    await insert(db, "sale_components", {
      channel: c,
      sale_id: key,
      product_id: productId,
      quantity,
      cost_rate: p.purchase_price,
      category_id: p.category_id,
      active: 1,
    });
  }
  if (b.paid_amount)
    await insert(db, `${c}_sale_payments`, {
      [`${c}_sale_id`]: key,
      payment_method_id: b.payment_method_id,
      amount: b.paid_amount,
      notes: "CHECKOUT_PAYMENT",
      status: "active",
      created_by: user.id,
    });
  return { id: key, ...value };
}
exports.create = async (c, raw, user) => {
  channel(c);
  const b = saleSchema.parse(raw);
  const order = await transaction((db) => createOne(db, c, b, user));
  let dispatch = null;
  if (c === "online" && b.send_to_steadfast) {
    try {
      dispatch = await require("../steadfast/steadfast.service").send(
        [order.id],
        false,
      );
    } catch (e) {
      dispatch = { error: e.message };
    }
  }
  return { ...(await exports.detail(c, order.id)), dispatch };
};
exports.bulk = async (raw, user) => {
  const b = z
    .object({
      orders: z.array(saleSchema).min(1).max(500),
      send_to_steadfast: z.boolean().default(true),
    })
    .parse(raw);
  const orders = await transaction(async (db) => {
    const rows = [];
    for (const order of b.orders)
      rows.push(await createOne(db, "online", order, user));
    return rows;
  });
  let dispatch = null;
  if (b.send_to_steadfast) {
    try {
      dispatch = await require("../steadfast/steadfast.service").send(
        orders.map((o) => o.id),
        true,
      );
    } catch (e) {
      dispatch = { error: e.message };
    }
  }
  return { orders, dispatch };
};
exports.customer = async (phone) => {
  const [rows] = await pool.query("SELECT * FROM customers WHERE cus_phone=?", [
    String(phone).slice(0, 30),
  ]);
  return rows[0] || null;
};
exports.detail = async (c, key) => {
  channel(c);
  const row = await one(
    pool,
    `SELECT s.*,cu.cus_name,cu.cus_phone,cu.cus_address,e.name sales_person_name FROM ${c}_sales s JOIN customers cu ON cu.id=s.customer_id LEFT JOIN employees e ON e.id=s.sales_employee_id WHERE s.id=?`,
    [id.parse(key)],
  );
  const [items] = await pool.query(
    "SELECT l.*,COALESCE(p.barcode,pc.barcode) barcode FROM sale_lines l LEFT JOIN products p ON l.item_type='product' AND p.id=l.item_id LEFT JOIN product_combos pc ON l.item_type='combo' AND pc.id=l.item_id WHERE l.channel=? AND l.sale_id=?",
    [c, key],
  );
  const [payments] = await pool.query(
    `SELECT p.*,m.method FROM ${c}_sale_payments p JOIN payment_methods m ON m.id=p.payment_method_id WHERE ${c}_sale_id=? ORDER BY p.id DESC`,
    [key],
  );
  return {
    ...row,
    channel: c,
    items,
    payments,
    ...totals(
      items,
      row.final_discount,
      row.delivery_charge || 0,
      payments.reduce((s, p) => s + Number(p.amount), 0),
    ),
  };
};
exports.list = async (c, q) => {
  channel(c);
  const p = pagination(q);
  let where = " WHERE 1=1";
  let params = [];
  if (q.search) {
    where +=
      " AND (cu.cus_name LIKE ? OR cu.cus_phone LIKE ? OR CAST(s.id AS CHAR)=?)";
    params.push(`%${q.search}%`, `%${q.search}%`, q.search);
  }
  if (q.status) {
    where += " AND s.status=?";
    params.push(q.status);
  }
  if (q.from) {
    where += " AND s.created_at>=?";
    params.push(z.string().date().parse(q.from));
  }
  if (q.to) {
    where += " AND s.created_at<DATE_ADD(?,INTERVAL 1 DAY)";
    params.push(z.string().date().parse(q.to));
  }
  const from = `FROM ${c}_sales s JOIN customers cu ON cu.id=s.customer_id${where}`;
  const [[count]] = await pool.query(`SELECT COUNT(*) total ${from}`, params);
  const [keys] = await pool.query(
    `SELECT s.id ${from} ORDER BY s.id DESC LIMIT ? OFFSET ?`,
    [...params, p.limit, p.offset],
  );
  const rows = [];
  for (const k of keys) rows.push(await exports.detail(c, k.id));
  return pageResult(rows, count.total, p);
};
async function paymentState(db, c, key) {
  const sale = await one(db, `SELECT * FROM ${c}_sales WHERE id=? FOR UPDATE`, [
    id.parse(key),
  ]);
  const [items] = await db.query(
    "SELECT quantity,rate FROM sale_lines WHERE channel=? AND sale_id=?",
    [c, key],
  );
  const [[payments]] = await db.query(
    `SELECT COALESCE(SUM(amount),0) paid FROM ${c}_sale_payments WHERE ${c}_sale_id=?`,
    [key],
  );
  return {
    sale,
    ...totals(
      items,
      sale.final_discount,
      sale.delivery_charge || 0,
      payments.paid,
    ),
  };
}
exports.addPayment = async (c, key, raw, user) => {
  channel(c);
  const b = z
    .object({
      amount: amount.refine((value) => value > 0, "Amount must be positive"),
      payment_method_id: id,
      notes: z.string().max(5000).optional(),
    })
    .parse(raw);
  return transaction(async (db) => {
    const state = await paymentState(db, c, key);
    if (state.sale.status === "returned")
      throw new HttpError(409, "Returned orders cannot receive payments");
    if (b.amount > state.due)
      throw new HttpError(400, "Payment exceeds the outstanding balance");
    const paymentId = await insert(db, `${c}_sale_payments`, {
      ...b,
      [`${c}_sale_id`]: key,
      status: "active",
      created_by: user.id,
    });
    await db.query(`UPDATE ${c}_sales SET status=? WHERE id=?`, [
      b.amount >= state.due ? "paid" : "due",
      key,
    ]);
    return { id: paymentId };
  });
};
exports.returnSale = async (c, key, raw, user) => {
  channel(c);
  const b = z.object({ amount, payment_method_id: id }).parse(raw);
  return transaction(async (db) => {
    const state = await paymentState(db, c, key);
    if (state.sale.status === "returned")
      throw new HttpError(409, "This order has already been returned");
    if (b.amount > state.paid)
      throw new HttpError(400, "Refund cannot exceed recorded payments");
    if (b.amount)
      await insert(db, `${c}_sale_payments`, {
        [`${c}_sale_id`]: key,
        payment_method_id: b.payment_method_id,
        amount: -b.amount,
        notes: "RETURN_PAYMENT",
        status: "active",
        created_by: user.id,
      });
    await db.query(`UPDATE ${c}_sales SET status='returned' WHERE id=?`, [key]);
    await db.query(
      "UPDATE sale_components SET active=0 WHERE channel=? AND sale_id=?",
      [c, key],
    );
    return { returned: true };
  });
};

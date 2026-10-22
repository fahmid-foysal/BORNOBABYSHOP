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
const { round } = require("../../lib/sale-math");
async function request(endpoint, body) {
  if (!process.env.STEADFAST_API_KEY || !process.env.STEADFAST_SECRET_KEY)
    throw new HttpError(
      503,
      "Set the Steadfast API key and secret in backend/.env",
    );
  const response = await fetch(
    `${process.env.STEADFAST_BASE_URL || "https://portal.packzy.com/api/v1"}${endpoint}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        "Api-Key": process.env.STEADFAST_API_KEY,
        "Secret-Key": process.env.STEADFAST_SECRET_KEY,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok)
    throw new HttpError(502, `Steadfast returned HTTP ${response.status}`);
  return response.json();
}
exports.send = async (keys, bulk = false) => {
  if (!process.env.STEADFAST_API_KEY || !process.env.STEADFAST_SECRET_KEY)
    throw new HttpError(
      503,
      "Steadfast credentials are not configured; orders were saved locally",
    );
  const data = await transaction(async (db) => {
    const rows = [];
    for (const key of keys) {
      const s = await one(
        db,
        "SELECT s.*,c.cus_name,c.cus_phone,c.cus_address FROM online_sales s JOIN customers c ON c.id=s.customer_id WHERE s.id=? FOR UPDATE",
        [id.parse(key)],
      );
      if (s.sent_to_steadfast)
        throw new HttpError(409, `ORD-${key} has already been sent`);
      if (s.status === "returned")
        throw new HttpError(409, "Returned orders cannot be dispatched");
      if (s.steadfast_submitted_at)
        throw new HttpError(
          409,
          `ORD-${key} has an unresolved dispatch attempt. Check its invoice in the courier portal before reconciling.`,
        );
      const [[v]] = await db.query(
        "SELECT (SELECT COALESCE(SUM(quantity*rate),0) FROM sale_lines WHERE channel='online' AND sale_id=?) subtotal,(SELECT COALESCE(SUM(amount),0) FROM online_sale_payments WHERE online_sale_id=?) paid",
        [key, key],
      );
      const cod = round(
        Math.max(0, v.subtotal - s.final_discount + s.delivery_charge - v.paid),
      );
      await db.query(
        "UPDATE online_sales SET steadfast_submitted_at=NOW(),steadfast_cod_amount=?,steadfast_last_error=NULL WHERE id=?",
        [cod, key],
      );
      rows.push({
        invoice: `ORD-${key}`,
        recipient_name: s.cus_name,
        recipient_phone: s.cus_phone,
        recipient_address: s.cus_address,
        cod_amount: cod,
        note: s.steadfast_note || s.notes || "",
      });
    }
    return rows;
  });
  let response;
  try {
    response = await request(
      bulk ? "/create_order/bulk-order" : "/create_order",
      bulk ? { data } : data[0],
    );
  } catch (e) {
    await transaction(async (db) => {
      for (const key of keys)
        await db.query(
          "UPDATE online_sales SET steadfast_last_error=? WHERE id=?",
          [
            `Unconfirmed dispatch: ${e.message}. Reconcile this invoice in the Steadfast portal before retrying.`,
            key,
          ],
        );
    });
    return { error: e.message, uncertain: true };
  }
  const results = bulk
    ? Array.isArray(response.data)
      ? response.data
      : []
    : [
        response.consignment
          ? {
              ...response.consignment,
              invoice: data[0].invoice,
              status: Number(response.status) === 200 ? "success" : "failed",
            }
          : null,
      ].filter(Boolean);
  await transaction(async (db) => {
    for (const key of keys) {
      const invoice = `ORD-${key}`;
      const result = results.find((r) => String(r.invoice) === invoice);
      const success =
        result && result.status === "success" && result.consignment_id;
      if (success)
        await db.query(
          "UPDATE online_sales SET sent_to_steadfast=1,steadfast_consignment_id=?,steadfast_tracking_code=?,steadfast_tracking_link=?,steadfast_last_error=NULL WHERE id=?",
          [
            result.consignment_id,
            result.tracking_code || null,
            result.tracking_link || null,
            key,
          ],
        );
      else {
        const error = String(
          result?.error ||
            response.message ||
            "Courier response did not confirm this invoice",
        );
        const duplicate = /EXISTS|duplicate/i.test(error);
        await db.query(
          `UPDATE online_sales SET steadfast_last_error=?${result && !duplicate ? ",steadfast_submitted_at=NULL" : ""} WHERE id=?`,
          [error, key],
        );
      }
    }
  });
  return { results, response_status: response.status };
};
exports.reconcile = async (key, raw) => {
  const b = z
    .object({
      consignment_id: id,
      tracking_code: z.string().min(1).max(150),
      tracking_link: z
        .string()
        .url()
        .max(1024)
        .refine((v) => new URL(v).protocol === "https:"),
    })
    .parse(raw);
  return transaction(async (db) => {
    const s = await one(
      db,
      "SELECT * FROM online_sales WHERE id=? FOR UPDATE",
      [id.parse(key)],
    );
    if (s.sent_to_steadfast)
      throw new HttpError(409, "Order is already linked to Steadfast");
    await db.query(
      "UPDATE online_sales SET sent_to_steadfast=1,steadfast_consignment_id=?,steadfast_tracking_code=?,steadfast_tracking_link=?,steadfast_last_error=NULL WHERE id=?",
      [b.consignment_id, b.tracking_code, b.tracking_link, key],
    );
    return { linked: true };
  });
};
exports.webhook = async (raw) => {
  const b = z
    .object({
      notification_type: z.literal("delivery_status"),
      consignment_id: id,
      invoice: z.string().regex(/^ORD-\d+$/),
      status: z.string().min(1).max(100),
      delivery_charge: amount,
      updated_at: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
    })
    .passthrough()
    .parse(raw);
  return transaction(async (db) => {
    const key = b.invoice.slice(4);
    const s = await one(
      db,
      "SELECT id,steadfast_consignment_id,steadfast_webhook_at FROM online_sales WHERE id=? FOR UPDATE",
      [key],
    );
    if (
      s.steadfast_consignment_id &&
      String(s.steadfast_consignment_id) !== String(b.consignment_id)
    )
      throw new HttpError(409, "Invoice and consignment do not match");
    if (!s.steadfast_webhook_at || b.updated_at >= s.steadfast_webhook_at)
      await db.query(
        "UPDATE online_sales SET steadfast_status=?,steadfast_delivery_charge=?,steadfast_webhook_at=? WHERE id=?",
        [b.status, b.delivery_charge, b.updated_at, key],
      );
    return { message: "Webhook received successfully" };
  });
};
exports.importPayment = async (paymentId, user) => {
  const key = z
    .string()
    .regex(/^SFC-[A-Za-z0-9-]+$/)
    .max(150)
    .parse(paymentId);
  const [stored] = await pool.query(
    "SELECT steadfast_settled_orders_details FROM steadfast_payments WHERE steadfast_payment_id=?",
    [key],
  );
  const response = stored.length
    ? typeof stored[0].steadfast_settled_orders_details === "string"
      ? JSON.parse(stored[0].steadfast_settled_orders_details)
      : stored[0].steadfast_settled_orders_details
    : await request(`/payments/${encodeURIComponent(key)}`);
  const p = z
    .object({
      payment_id: z.literal(key),
      amount,
      total: amount,
      method: z.string().max(100),
      status_label: z.string().max(255),
      created_at: z.string().nullable().optional(),
      ready_at: z.string().nullable().optional(),
      paid_at: z.string().nullable().optional(),
      consignments: z.array(
        z
          .object({
            consignment_id: id,
            invoice: z.string(),
            cod_amount: amount,
          })
          .passthrough(),
      ),
    })
    .passthrough()
    .parse(response.payment);
  if (p.total > p.amount)
    throw new HttpError(502, "Courier settlement total exceeds amount");
  return transaction(async (db) => {
    const [existing] = await db.query(
      "SELECT id FROM steadfast_payments WHERE steadfast_payment_id=? FOR UPDATE",
      [key],
    );
    const first = !existing.length;
    let settlementId = existing[0]?.id;
    if (first)
      settlementId = await insert(db, "steadfast_payments", {
        steadfast_payment_id: key,
        status: "imported",
        amount: p.amount,
        method: p.method,
        steadfast_status_label: p.status_label,
        steadfast_created_at: p.created_at || null,
        steadfast_ready_at: p.ready_at || null,
        steadfast_paid_at: p.paid_at || null,
        steadfast_settled_orders_details: JSON.stringify(response),
      });
    let [methods] = await db.query(
      "SELECT id FROM payment_methods WHERE method='Steadfast' ORDER BY id LIMIT 1",
    );
    const methodId =
      methods[0]?.id ||
      (await insert(db, "payment_methods", { method: "Steadfast" }));
    let matched = 0;
    let already_applied = 0;
    const unmatched = [];
    for (const c of p.consignments) {
      const [allocation] = await db.query(
        "SELECT id FROM settlement_allocations WHERE steadfast_payment_id=? AND consignment_id=?",
        [key, c.consignment_id],
      );
      if (allocation.length) {
        already_applied++;
        continue;
      }
      const invoiceId = c.invoice.match(/^ORD-(\d+)$/)?.[1];
      const [sales] = await db.query(
        "SELECT * FROM online_sales WHERE steadfast_consignment_id=? OR id=? FOR UPDATE",
        [c.consignment_id, invoiceId || 0],
      );
      if (sales.length > 1)
        throw new HttpError(
          409,
          `Conflicting invoice and consignment for ${c.invoice}`,
        );
      if (!sales.length) {
        unmatched.push(c);
        continue;
      }
      const sale = sales[0];
      if (
        sale.steadfast_consignment_id &&
        String(sale.steadfast_consignment_id) !== String(c.consignment_id)
      )
        throw new HttpError(409, `Consignment mismatch for ${c.invoice}`);
      await insert(db, "online_sale_payments", {
        online_sale_id: sale.id,
        payment_method_id: methodId,
        amount: c.cod_amount,
        notes: `STEADFAST_PAYMENTS ${key}`,
        status: "active",
        created_by: user.id,
      });
      await insert(db, "settlement_allocations", {
        steadfast_payment_id: key,
        consignment_id: c.consignment_id,
        online_sale_id: sale.id,
        amount: c.cod_amount,
      });
      if (sale.status !== "returned") {
        const [[v]] = await db.query(
          "SELECT (SELECT COALESCE(SUM(quantity*rate),0) FROM sale_lines WHERE channel='online' AND sale_id=?) subtotal,(SELECT COALESCE(SUM(amount),0) FROM online_sale_payments WHERE online_sale_id=?) paid",
          [sale.id, sale.id],
        );
        await db.query("UPDATE online_sales SET status=? WHERE id=?", [
          v.paid >= v.subtotal - sale.final_discount + sale.delivery_charge
            ? "paid"
            : "due",
          sale.id,
        ]);
      }
      matched++;
    }
    if (first) {
      const [accounts] = await db.query(
        "SELECT id FROM expense_accounts WHERE title='steadfast_charges' ORDER BY id LIMIT 1",
      );
      const account =
        accounts[0]?.id ||
        (await insert(db, "expense_accounts", { title: "steadfast_charges" }));
      await insert(db, "expenses", {
        expense_account_id: account,
        narration: `STEADFAST_CHARGES ${key}`,
        amount: round(p.amount - p.total),
        expense_date: new Date().toLocaleDateString("en-CA", {
          timeZone: "Asia/Dhaka",
        }),
        created_by: user.id,
      });
    }
    return {
      id: settlementId,
      matched,
      already_applied,
      unmatched,
      payment: p,
    };
  });
};
exports.list = async (q) => {
  const p = pagination(q);
  const params = [];
  let where = "";
  if (q.search) {
    where = " WHERE steadfast_payment_id LIKE ?";
    params.push(`%${q.search}%`);
  }
  const [[count]] = await pool.query(
    `SELECT COUNT(*) total FROM steadfast_payments${where}`,
    params,
  );
  const [rows] = await pool.query(
    `SELECT * FROM steadfast_payments${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, p.limit, p.offset],
  );
  return pageResult(rows, count.total, p);
};

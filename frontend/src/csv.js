import Papa from "papaparse";
import { api, qs } from "./api";
const required = [
  "order_ref",
  "customer_name",
  "customer_phone",
  "customer_address",
  "item_type",
  "barcode",
  "quantity",
];
export const template = [
  {
    order_ref: "WEB-001",
    customer_name: "Jahid Hasan",
    customer_phone: "01712345678",
    customer_address: "Dhanmondi, Dhaka",
    item_type: "product",
    barcode: "A1B2C",
    quantity: 2,
    rate: "",
    discount: 0,
    delivery_charge: 80,
    paid_amount: 0,
    payment_method_id: "",
    sales_employee_id: "",
    notes: "Call first",
  },
  {
    order_ref: "WEB-001",
    customer_name: "Jahid Hasan",
    customer_phone: "01712345678",
    customer_address: "Dhanmondi, Dhaka",
    item_type: "combo",
    barcode: "D3E4F",
    quantity: 1,
    rate: "",
    discount: 0,
    delivery_charge: 80,
    paid_amount: 0,
    payment_method_id: "",
    sales_employee_id: "",
    notes: "Call first",
  },
];
export async function parseSalesCsv(file) {
  const text = await file.text();
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  if (result.errors.length) throw new Error(`CSV: ${result.errors[0].message}`);
  for (const field of required)
    if (!result.meta.fields.includes(field))
      throw new Error(`CSV column missing: ${field}`);
  if (result.data.length > 5000)
    throw new Error("Use no more than 5,000 item rows per file");
  const groups = new Map(),
    cache = new Map();
  for (let i = 0; i < result.data.length; i++) {
    const r = result.data[i];
    const line = i + 2;
    const fail = (message) => {
      throw new Error(`Row ${line}: ${message}`);
    };
    for (const field of required)
      if (!String(r[field] || "").trim()) fail(`${field} is required`);
    if (!["product", "combo"].includes(r.item_type))
      fail("item_type must be product or combo");
    const barcode = r.barcode.trim().toUpperCase();
    if (!/^[0-9A-Z]{5}$/.test(barcode))
      fail("barcode must contain 5 letters or digits");
    if (!(Number(r.quantity) > 0)) fail("quantity must be positive");
    if (!cache.has(barcode)) {
      const d = await api(`/catalog/search?${qs({ barcode })}`);
      if (!d.rows.length) fail(`barcode ${barcode} was not found`);
      cache.set(barcode, d.rows[0]);
    }
    const item = cache.get(barcode);
    if (item.item_type !== r.item_type)
      fail(`barcode ${barcode} is a ${item.item_type}`);
    const numeric = (key, fallback = 0) => {
      const n = String(r[key] ?? "").trim() === "" ? fallback : Number(r[key]);
      if (!Number.isFinite(n) || n < 0)
        fail(`${key} must be a non-negative number`);
      return n;
    };
    const header = {
      customer: {
        cus_name: r.customer_name.trim(),
        cus_phone: r.customer_phone.trim(),
        cus_address: r.customer_address.trim(),
      },
      final_discount: numeric("discount"),
      delivery_charge:
        String(r.delivery_charge ?? "").trim() === ""
          ? null
          : numeric("delivery_charge"),
      paid_amount: numeric("paid_amount"),
      payment_method_id: r.payment_method_id
        ? numeric("payment_method_id")
        : null,
      sales_employee_id: r.sales_employee_id
        ? numeric("sales_employee_id")
        : null,
      notes: r.notes || "",
    };
    const ref = r.order_ref.trim();
    if (
      groups.has(ref) &&
      JSON.stringify(groups.get(ref).header) !== JSON.stringify(header)
    )
      fail(`all order-level fields for ${ref} must match`);
    if (!groups.has(ref)) groups.set(ref, { ref, header, items: [] });
    groups.get(ref).items.push({
      item_type: r.item_type,
      item_id: Number(item.id),
      quantity: Number(r.quantity),
      rate: numeric("rate", Number(item.sale_price)),
      name: item.name,
      barcode,
      default_delivery_charge: Number(
        item.default_delivery_charge ?? item.delivery_charge ?? 0,
      ),
    });
  }
  if (!groups.size) throw new Error("The CSV contains no orders");
  if (groups.size > 500) throw new Error("Import up to 500 orders per batch");
  const orders = [...groups.values()].map((g) => ({
    ...g.header,
    order_ref: g.ref,
    items: g.items,
    delivery_charge:
      g.header.delivery_charge ??
      Math.round(
        g.items.reduce(
          (sum, item) => sum + item.quantity * item.default_delivery_charge,
          0,
        ) * 100,
      ) / 100,
  }));
  for (const o of orders) {
    const total = o.items.reduce((s, i) => s + i.quantity * i.rate, 0);
    if (o.final_discount > total)
      throw new Error(`${o.order_ref}: discount exceeds subtotal`);
    if (o.paid_amount > total - o.final_discount + o.delivery_charge)
      throw new Error(`${o.order_ref}: payment exceeds payable`);
    if (o.paid_amount && !o.payment_method_id)
      throw new Error(
        `${o.order_ref}: payment_method_id is required for an advance payment`,
      );
  }
  return orders;
}

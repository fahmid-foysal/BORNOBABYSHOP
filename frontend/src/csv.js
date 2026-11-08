import Papa from "papaparse";
import { api, qs } from "./api";
const commonValueFields = [
  "order_ref",
  "customer_name",
  "customer_phone",
  "customer_address",
  "item_type",
  "barcode",
  "quantity",
];
const required = commonValueFields;

const modeHeaders = {
  mode1: [
    "order_ref",
    "customer_name",
    "customer_phone",
    "customer_address",
    "total_paid",
    "cod_amount",
    "item_type",
    "barcode",
    "quantity",
    "payment_method",
    "sales_employee",
    "notes",
    "product_name",
  ],
  mode2: [
    ...commonValueFields,
    "rate",
    "discount",
    "delivery_charge",
    "paid_amount",
    "payment_method",
    "sales_employee",
    "notes",
  ],
};

export const bulkTemplates = {
  mode1: [
    {
      order_ref: "WEB-001",
      customer_name: "",
      customer_phone: "",
      customer_address: "",
      total_paid: "",
      cod_amount: "",
      item_type: "product",
      barcode: "A1B2C",
      quantity: 2,
      payment_method: "",
      sales_employee: "",
      notes: "",
      product_name: "Sample product name",
    },
    {
      order_ref: "WEB-001",
      customer_name: "Jahid Hasan",
      customer_phone: "01712345678",
      customer_address: "Dhanmondi, Dhaka",
      total_paid: 0,
      cod_amount: 1000,
      item_type: "combo",
      barcode: "D3E4F",
      quantity: 1,
      payment_method: "",
      sales_employee: "",
      notes: "Call first",
      product_name: "Sample combo name",
    },
  ],
  mode2: [
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
    payment_method: "",
    sales_employee: "",
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
    payment_method: "",
    sales_employee: "",
    notes: "Call first",
  },
  ],
};

// Kept for compatibility with older imports; Mode 2 is the original detailed format.
export const template = bulkTemplates.mode2;
async function parseSalesCsvLegacy(file) {
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

const normalizedName = (value) => String(value ?? "").trim().toUpperCase();
const roundedMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function resolveNamedMaster(rows, field, rawValue, label, fail) {
  const wanted = normalizedName(rawValue);
  if (!wanted) return null;
  const matches = (rows || []).filter((row) => normalizedName(row[field]) === wanted);
  if (!matches.length) fail(`${label} "${rawValue}" was not found`);
  if (matches.length > 1) fail(`${label} "${rawValue}" is duplicated in master data`);
  return Number(matches[0].id);
}

export async function parseSalesCsv(file, mode = "mode2", lookups = {}) {
  const expectedHeaders = modeHeaders[mode];
  if (!expectedHeaders) throw new Error("Unknown bulk import mode");

  const text = await file.text();
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  if (parsed.errors.length) throw new Error(parsed.errors[0].message);
  const requiredHeaders = mode === "mode1"
    ? expectedHeaders.filter((field) => !["notes", "product_name"].includes(field))
    : expectedHeaders;
  for (const field of requiredHeaders) {
    if (!parsed.meta.fields?.includes(field)) throw new Error(`Missing column: ${field}`);
  }

  if (parsed.data.length > 5000) throw new Error("Use no more than 5,000 item rows per file");
  const groups = new Map();
  const catalogCache = new Map();
  for (let index = 0; index < parsed.data.length; index += 1) {
    const row = parsed.data[index];
    const rowNumber = index + 2;
    const fail = (message) => { throw new Error(`Row ${rowNumber}: ${message}`); };

    const requiredFields = mode === "mode1"
      ? ["order_ref", "item_type", "barcode", "quantity"]
      : commonValueFields;
    for (const field of requiredFields) {
      if (String(row[field] ?? "").trim() === "") fail(`${field} is required`);
    }

    const itemType = String(row.item_type).trim().toLowerCase();
    if (!["product", "combo"].includes(itemType)) fail("item_type must be product or combo");

    const barcode = String(row.barcode).trim().toUpperCase();
    if (!catalogCache.has(barcode)) {
      const catalog = await api(`/catalog/search?${qs({ barcode })}`);
      if (!catalog.rows?.length) fail(`barcode ${barcode} was not found`);
      catalogCache.set(barcode, catalog.rows[0]);
    }
    const item = catalogCache.get(barcode);
    if (item.item_type !== itemType) fail(`barcode ${barcode} is a ${item.item_type}`);

    const numberValue = (field, fallback = 0) => {
      const raw = String(row[field] ?? "").trim();
      const value = raw === "" ? Number(fallback) : Number(raw);
      if (!Number.isFinite(value) || value < 0) fail(`${field} must be a non-negative number`);
      return value;
    };
    const optionalNumberValue = (field) =>
      String(row[field] ?? "").trim() === "" ? null : numberValue(field);

    const paymentMethodId = resolveNamedMaster(
      lookups.payment_methods,
      "method",
      String(row.payment_method ?? "").trim(),
      "payment_method",
      fail,
    );
    const salesEmployeeId = resolveNamedMaster(
      lookups.employees,
      "name",
      String(row.sales_employee ?? "").trim(),
      "sales_employee",
      fail,
    );

    const commonHeader = {
      customer_name: String(row.customer_name).trim(),
      customer_phone: String(row.customer_phone).trim(),
      customer_address: String(row.customer_address).trim(),
      payment_method_id: paymentMethodId,
      sales_employee_id: salesEmployeeId,
    };
    const header = mode === "mode1"
      ? {
          ...commonHeader,
          total_paid: optionalNumberValue("total_paid"),
          cod_amount: optionalNumberValue("cod_amount"),
          notes: String(row.notes ?? "").trim(),
        }
      : {
          ...commonHeader,
          final_discount: numberValue("discount"),
          delivery_charge: String(row.delivery_charge ?? "").trim() === "" ? null : numberValue("delivery_charge"),
          paid_amount: numberValue("paid_amount"),
          notes: String(row.notes ?? "").trim(),
        };

    const reference = String(row.order_ref).trim();
    const existing = groups.get(reference);
    if (existing && mode === "mode1") {
      for (const field of [
        "customer_name",
        "customer_phone",
        "customer_address",
        "total_paid",
        "cod_amount",
        "notes",
        "payment_method_id",
        "sales_employee_id",
      ]) {
        const current = existing.header[field];
        const incoming = header[field];
        const currentIsBlank = current == null || current === "";
        const incomingIsBlank = incoming == null || incoming === "";
        if (currentIsBlank && !incomingIsBlank) existing.header[field] = incoming;
        else if (!currentIsBlank && !incomingIsBlank && current !== incoming) {
          fail(`${field} conflicts with another row for ${reference}`);
        }
      }
    } else if (existing && JSON.stringify(existing.header) !== JSON.stringify(header)) {
      fail(`all rows for ${reference} must have identical order-level values`);
    }
    if (!existing) groups.set(reference, { header, items: [] });
    groups.get(reference).items.push({
      item_type: itemType,
      item_id: Number(item.id),
      quantity: numberValue("quantity"),
      rate: mode === "mode1" ? Number(item.sale_price) : numberValue("rate", item.sale_price),
      name: item.name,
      barcode: item.barcode,
      default_delivery_charge: Number(item.default_delivery_charge ?? item.delivery_charge ?? 0),
    });
  }

  if (!groups.size) throw new Error("The CSV contains no orders");
  if (groups.size > 500) throw new Error("Import up to 500 orders per batch");
  const orders = [...groups.entries()].map(([orderRef, group]) => {
    if (mode === "mode1") {
      for (const field of ["customer_name", "customer_phone", "customer_address"]) {
        if (!String(group.header[field] ?? "").trim()) {
          throw new Error(`${orderRef}: ${field} must be provided on one row of the order`);
        }
      }
      for (const field of ["total_paid", "cod_amount"]) {
        if (group.header[field] == null) {
          throw new Error(`${orderRef}: ${field} must be provided on one row of the order`);
        }
      }
    }
    const subtotal = roundedMoney(group.items.reduce((sum, item) => sum + item.quantity * item.rate, 0));
    let finalDiscount;
    let deliveryCharge;
    let paidAmount;

    if (mode === "mode1") {
      const totalBill = roundedMoney(group.header.total_paid + group.header.cod_amount);
      finalDiscount = roundedMoney(subtotal - totalBill);
      deliveryCharge = 0;
      paidAmount = group.header.total_paid;
    } else {
      finalDiscount = group.header.final_discount;
      deliveryCharge = group.header.delivery_charge == null
        ? roundedMoney(group.items.reduce((sum, item) => sum + item.default_delivery_charge * item.quantity, 0))
        : group.header.delivery_charge;
      paidAmount = group.header.paid_amount;
    }

    const payable = roundedMoney(subtotal + deliveryCharge - finalDiscount);
    if (finalDiscount > subtotal + deliveryCharge) throw new Error(`${orderRef}: discount exceeds the bill`);
    if (paidAmount > payable) throw new Error(`${orderRef}: paid amount exceeds payable amount`);
    if (paidAmount > 0 && !group.header.payment_method_id) {
      throw new Error(`${orderRef}: payment_method is required when an amount is paid`);
    }

    return {
      order_ref: orderRef,
      customer: {
        cus_name: group.header.customer_name,
        cus_phone: group.header.customer_phone,
        cus_address: group.header.customer_address,
      },
      payment_method_id: group.header.payment_method_id,
      sales_employee_id: group.header.sales_employee_id,
      notes: group.header.notes,
      items: group.items,
      final_discount: finalDiscount,
      delivery_charge: deliveryCharge,
      paid_amount: paidAmount,
    };
  });

  return orders;
}

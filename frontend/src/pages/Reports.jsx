import React, { useState } from "react";
import { Download, ChartNoAxesCombined, RotateCcw } from "lucide-react";
import { defaultDates, qs, downloadCsv, downloadXlsx, downloadPdf, money, number } from "../api";
import { useData, DateRange, Busy, ErrorBox, Empty } from "../components";
const reports = [
  ["sales-explorer", "Sales explorer"],
  ["daily-salesperson", "Daily sales by sales person"],
  ["monthly-salesperson", "Monthly sales by sales person"],
  ["daily-product", "Daily product / combo sales"],
  ["salesperson-count", "Sales count by sales person"],
  ["monthly-product-salesperson", "Monthly product sales by sales person"],
  ["monthly-product", "Monthly product / combo sales"],
];
const labels = {
  period: "Period",
  sales_person: "Sales person",
  item_type: "Item type",
  item_id: "Item ID",
  item_name: "Product / combo",
  sale_count: "Sales count",
  quantity: "Quantity",
  gross_sales: "Gross sales",
  allocated_discount: "Discount",
  net_sales: "Net sales",
  net_product_sales: "Net product sales",
  sold_cost: "Sold purchase cost",
  gross_profit: "Gross profit",
  delivery_charge: "Delivery charge",
  component_quantity: "Component quantity",
  customer_name: "Customer",
  customer_phone: "Phone",
  channel: "Channel",
  sale_id: "Order ID",
  status: "Status",
  created_at: "Created",
  payable: "Filtered payable",
};

const moneyKeys = new Set([
  "gross_sales",
  "allocated_discount",
  "net_sales",
  "net_product_sales",
  "delivery_charge",
  "sold_cost",
  "gross_profit",
  "payable",
]);
const numberKeys = new Set(["sale_count", "quantity", "component_quantity"]);

function valueDisplay(key, value) {
  if (moneyKeys.has(key)) return money(value);
  if (numberKeys.has(key)) return number(value);
  if (key === "period" && value) return String(value).slice(0, 10);
  if (key === "created_at" && value) return new Date(value).toLocaleString();
  return value ?? "—";
}

function ReportTable({ title, subtitle, rows = [] }) {
  const keys = rows.length ? Object.keys(rows[0]) : [];
  return (
    <section className="report-section">
      <div className="report-section-heading">
        <div>
          <h4>{title}</h4>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <span className="count">{rows.length} rows</span>
      </div>
      {rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>{keys.map((key) => <th key={key}>{labels[key] || key.replaceAll("_", " ")}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${title}-${index}`}>
                  {keys.map((key) => <td key={key}>{valueDisplay(key, row[key])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title={`No ${title.toLowerCase()}`} text="No rows match the selected filters." />
      )}
    </section>
  );
}

const emptyExplorerFilters = {
  sales_employee_id: "",
  category_id: "",
  item: "",
  channel: "",
  status: "",
  payment_method_id: "",
  customer: "",
};

function SalesExplorer({ data, filters, setFilters, loading }) {
  const options = data?.options || {};
  const set = (key) => (event) =>
    setFilters((current) => ({ ...current, [key]: event.target.value }));
  const summary = data?.summary || {};
  const summaryCards = [
    ["Orders", summary.sale_count, "number"],
    ["Units", summary.quantity, "number"],
    ["Gross sales", summary.gross_sales, "money"],
    ["Discount", summary.allocated_discount, "money"],
    ["Net product sales", summary.net_product_sales, "money"],
    ["Delivery income", summary.delivery_charge, "money"],
    ["Sold purchase cost", summary.sold_cost, "money"],
    ["Gross profit", summary.gross_profit, "money"],
  ];
  return (
    <>
      <div className="report-filter-grid">
        <label><span>Sales person</span><select value={filters.sales_employee_id} onChange={set("sales_employee_id")}><option value="">All sales people</option>{options.employees?.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label><span>Category</span><select value={filters.category_id} onChange={set("category_id")}><option value="">All categories</option>{options.categories?.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label><span>Product or combo</span><select value={filters.item} onChange={set("item")}><option value="">All products and combos</option>{options.items?.map((row) => <option key={row.value} value={row.value}>{row.name} · {row.barcode} ({row.item_type})</option>)}</select></label>
        <label><span>Channel</span><select value={filters.channel} onChange={set("channel")}><option value="">All channels</option><option value="offline">In-store</option><option value="online">Online</option></select></label>
        <label><span>Order status</span><select value={filters.status} onChange={set("status")}><option value="">Paid and due</option><option value="paid">Paid</option><option value="due">Due</option></select></label>
        <label><span>Payment method</span><select value={filters.payment_method_id} onChange={set("payment_method_id")}><option value="">All payment methods</option>{options.payment_methods?.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label className="report-customer-filter"><span>Customer</span><input value={filters.customer} onChange={set("customer")} placeholder="Name or phone" /></label>
        <button className="btn" type="button" onClick={() => setFilters(emptyExplorerFilters)} disabled={loading}><RotateCcw size={15} />Clear filters</button>
      </div>
      <div className="report-summary-grid">
        {summaryCards.map(([label, value, format]) => (
          <div className="report-summary-card" key={label}><span>{label}</span><strong>{format === "money" ? money(value || 0) : number(value || 0)}</strong></div>
        ))}
      </div>
      <div className="report-sections-grid">
        <ReportTable title="Daily performance" rows={data?.daily} />
        <ReportTable title="Salespeople" rows={data?.salespeople} />
        <ReportTable title="Categories" subtitle="Combo components are counted in their product categories." rows={data?.categories} />
        <ReportTable title="Channels" rows={data?.channels} />
      </div>
      <ReportTable title="Products and combos" rows={data?.products} />
      <ReportTable title="Customers" rows={data?.customers} />
      <ReportTable title="Orders" subtitle="Up to 500 newest matching orders." rows={data?.orders} />
    </>
  );
}
export default function Reports() {
  const [type, setType] = useState(reports[0][0]);
  const [dates, setDates] = useState(defaultDates);
  const [explorerFilters, setExplorerFilters] = useState(emptyExplorerFilters);
  const explorer = type === "sales-explorer";
  const { data, loading, error } = useData(
    `/analytics/reports/${type}?${qs(explorer ? { ...dates, ...explorerFilters } : dates)}`,
  );
  const rows = explorer ? data?.orders || [] : data?.rows || [];
  const keys = rows.length ? Object.keys(rows[0]) : [];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">TURN EVERY SALE INTO AN INSIGHT</span>
          <h1>Reports</h1>
          <p>A closer look at what sells, when, and with whom.</p>
        </div>
        <div className="row-actions wrap">
          <button className="btn" disabled={!rows.length || loading} onClick={() => downloadCsv(rows, `borno-${type}-${dates.from}-${dates.to}.csv`)}><Download size={16} />CSV</button>
          <button className="btn" disabled={!rows.length || loading} onClick={() => downloadXlsx(rows, `borno-${type}-${dates.from}-${dates.to}.xlsx`, "Sales report")}><Download size={16} />XLSX</button>
          <button className="btn" disabled={!rows.length || loading} onClick={() => downloadPdf(rows, `borno-${type}-${dates.from}-${dates.to}.pdf`, reports.find((r) => r[0] === type)[1])}><Download size={16} />PDF</button>
        </div>
      </div>
      <div className="reports-layout">
        <aside className="panel report-nav">
          <span className="eyebrow">SALES REPORTS</span>
          {reports.map(([key, label]) => (
            <button
              className={type === key ? "selected" : ""}
              key={key}
              onClick={() => setType(key)}
            >
              <ChartNoAxesCombined size={17} />
              {label}
            </button>
          ))}
        </aside>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>{reports.find((r) => r[0] === type)[1]}</h3>
              <p>
                {explorer
                  ? `${number(data?.summary?.sale_count || 0)} matching orders · returns excluded`
                  : `${rows.length} report rows · returns excluded`}
              </p>
            </div>
            <DateRange value={dates} onChange={setDates} />
          </div>
          <ErrorBox message={error} />
          {explorer ? (
            <SalesExplorer
              data={data}
              filters={explorerFilters}
              setFilters={setExplorerFilters}
              loading={loading}
            />
          ) : loading ? (
            <Busy />
          ) : rows.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {keys.map((k) => (
                      <th key={k}>{labels[k] || k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, n) => (
                    <tr key={n}>
                      {keys.map((k) => (
                        <td key={k}>
                          {[
                            "gross_sales",
                            "allocated_discount",
                            "net_sales",
                          ].includes(k)
                            ? money(row[k])
                            : ["sale_count", "quantity"].includes(k)
                              ? number(row[k])
                              : row[k]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No sales in this period"
              text="Select another date range or create a sale to see your report."
            />
          )}
          <div className="panel-bottom">
            Discount is allocated to items by their share of the order subtotal.
            {explorer
              ? " Delivery is counted once per matching order; sold cost uses sale-time cost snapshots."
              : " Delivery is excluded from item sales."}
          </div>
        </section>
      </div>
    </>
  );
}

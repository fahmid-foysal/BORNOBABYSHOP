import React, { useMemo, useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import { defaultDates, qs, downloadCsv, downloadXlsx, downloadPdf, money, number } from "../api";
import { useData, DateRange, Busy, ErrorBox, Empty } from "../components";
const reports = [
  ["sales-explorer", "Sales explorer"],
  ["revenue-expense", "Revenue vs expense"],
  ["marketing", "Marketing performance"],
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
  sales_revenue: "Sales revenue",
  other_income: "Other income",
  total_revenue: "Total revenue",
  operating_expenses: "Operating expenses",
  marketing_expenses: "Marketing expenses",
  sold_purchase_cost: "Sold purchase cost",
  total_cost: "Total cost",
  net_profit: "Net profit",
  net_margin_percent: "Net margin",
  barcode: "Barcode",
  product_name: "Product",
  order_count: "Order count",
  status_breakdown: "Steadfast status breakdown",
  total_ad_expense_usd: "Ad expense (USD)",
  average_conversion_rate: "USD to BDT rate",
  total_ad_expense_bdt: "Ad expense (BDT)",
  ad_expense_per_order_bdt: "Ad expense / order",
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
  "sales_revenue",
  "other_income",
  "total_revenue",
  "operating_expenses",
  "marketing_expenses",
  "sold_purchase_cost",
  "total_cost",
  "net_profit",
  "total_ad_expense_bdt",
  "ad_expense_per_order_bdt",
]);
const usdKeys = new Set(["total_ad_expense_usd"]);
const numberKeys = new Set([
  "sale_count",
  "quantity",
  "component_quantity",
  "order_count",
  "total_order_count",
  "selected_product_count",
  "average_conversion_rate",
]);
const nonTotalKeys = new Set([
  "item_id",
  "sale_id",
  "customer_id",
  "customer_phone",
  "sales_employee_id",
]);

function isNumericColumn(key, rows) {
  if (nonTotalKeys.has(key)) return false;
  if (key === "net_margin_percent") return true;
  if (moneyKeys.has(key) || numberKeys.has(key)) return true;
  return (
    rows.length > 0 &&
    rows.every(
      (row) =>
        row[key] == null ||
        row[key] === "" ||
        (Number.isFinite(Number(row[key])) && typeof row[key] !== "boolean"),
    )
  );
}

function valueDisplay(key, value) {
  if (moneyKeys.has(key)) return money(value);
  if (usdKeys.has(key))
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(value) || 0);
  if (numberKeys.has(key)) return number(value);
  if (key === "net_margin_percent") return `${number(value)}%`;
  if (key === "period" && value) return String(value).slice(0, 10);
  if (key === "created_at" && value) return new Date(value).toLocaleString();
  return value ?? "—";
}

function reportCell(key, value, row) {
  if (key === "category" && row.row_kind === "combo") {
    const label = String(value ?? "");
    const categoriesAt = label.lastIndexOf("(");
    if (categoriesAt >= 0) {
      return (
        <>
          {label.slice(0, categoriesAt)}
          <span className="report-combo-brace">(</span>
          <span className="report-combo-category-names">
            {label.slice(categoriesAt + 1, -1)}
          </span>
          <span className="report-combo-brace">)</span>
        </>
      );
    }
  }
  return valueDisplay(key, value);
}

function ReportTable({
  title,
  subtitle,
  rows = [],
  hiddenKeys = [],
}) {
  const hidden = new Set(hiddenKeys);
  const keys = rows.length
    ? Object.keys(rows[0]).filter((key) => !hidden.has(key))
    : [];
  const [sort, setSort] = useState(null);
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const numeric = isNumericColumn(sort.key, rows);
    return [...rows].sort((left, right) => {
      const a = left[sort.key];
      const b = right[sort.key];
      let comparison;
      if (numeric) comparison = Number(a || 0) - Number(b || 0);
      else
        comparison = String(a ?? "").localeCompare(String(b ?? ""), undefined, {
          numeric: true,
          sensitivity: "base",
        });
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [rows, sort]);
  const totalKeys = new Set(keys.filter((key) => isNumericColumn(key, rows)));
  const totalValue = (key) => {
    if (key === "net_margin_percent") {
      const revenue = rows.reduce(
        (sum, row) => sum + Number(row.total_revenue || 0),
        0,
      );
      const profit = rows.reduce(
        (sum, row) => sum + Number(row.net_profit || 0),
        0,
      );
      return revenue ? (profit / revenue) * 100 : 0;
    }
    if (key === "average_conversion_rate") {
      const usd = rows.reduce(
        (sum, row) => sum + Number(row.total_ad_expense_usd || 0),
        0,
      );
      const bdt = rows.reduce(
        (sum, row) => sum + Number(row.total_ad_expense_bdt || 0),
        0,
      );
      return usd ? bdt / usd : 0;
    }
    if (key === "ad_expense_per_order_bdt") {
      const orders = rows.reduce(
        (sum, row) => sum + Number(row.order_count || 0),
        0,
      );
      const bdt = rows.reduce(
        (sum, row) => sum + Number(row.total_ad_expense_bdt || 0),
        0,
      );
      return orders ? bdt / orders : 0;
    }
    return rows.reduce(
      (sum, row) => sum + Number(row[key] || 0),
      0,
    );
  };
  const toggleSort = (key) =>
    setSort((current) => ({
      key,
      direction:
        current?.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
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
              <tr>{keys.map((key) => (
                <th key={key} aria-sort={sort?.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <button className="report-sort-button" type="button" onClick={() => toggleSort(key)}>
                    {labels[key] || key.replaceAll("_", " ")}
                    <span>{sort?.key === key ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}</span>
                  </button>
                </th>
              ))}</tr>
            </thead>
            <tbody>
              {sortedRows.map((row, index) => (
                <tr key={`${title}-${index}`}>
                  {keys.map((key) => (
                    <td key={key}>{reportCell(key, row[key], row)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="report-total-row">
                {keys.map((key, index) => (
                  <td key={key}>
                    {index === 0
                      ? "Total"
                      : totalKeys.has(key)
                        ? valueDisplay(
                            key,
                            totalValue(key),
                          )
                        : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
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
        <ReportTable
          title="Categories"
          subtitle="Standalone products are grouped by category. Combos with the same category combination share one row."
          rows={data?.categories}
          hiddenKeys={["row_kind"]}
        />
        <ReportTable title="Channels" rows={data?.channels} />
      </div>
      <ReportTable title="Products and combos" rows={data?.products} />
      <ReportTable title="Customers" rows={data?.customers} />
      <ReportTable title="Orders" subtitle="Up to 500 newest matching orders." rows={data?.orders} />
    </>
  );
}

function MultiSelectFilter({ label, options = [], value, onChange, optionValue, optionLabel, searchable = false }) {
  const [search, setSearch] = useState("");
  const selected = new Set(value.map(String));
  const visible = options.filter((option) =>
    !search || optionLabel(option).toLowerCase().includes(search.toLowerCase()),
  );
  const toggle = (option) => {
    const key = String(optionValue(option));
    onChange(
      selected.has(key)
        ? value.filter((item) => String(item) !== key)
        : [...value, optionValue(option)],
    );
  };
  return (
    <details className="multi-filter">
      <summary>
        <span>{label}</span>
        <strong>{value.length ? `${value.length} selected` : "All"}</strong>
      </summary>
      <div className="multi-filter-popover">
        {searchable && (
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${label.toLowerCase()}`}
          />
        )}
        <div className="multi-filter-actions">
          <button type="button" onClick={() => onChange(options.map(optionValue))}>Select all</button>
          <button type="button" onClick={() => onChange([])}>Clear</button>
        </div>
        <div className="multi-filter-options">
          {visible.map((option) => {
            const key = String(optionValue(option));
            return (
              <label key={key}>
                <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(option)} />
                <span>{optionLabel(option)}</span>
              </label>
            );
          })}
        </div>
      </div>
    </details>
  );
}

const emptyMarketingFilters = {
  sales_employee_ids: [],
  barcodes: [],
  steadfast_statuses: [],
};

function MarketingReport({ data, filters, setFilters, loading }) {
  const options = data?.options || {};
  const summary = data?.summary || {};
  const set = (key) => (value) =>
    setFilters((current) => ({ ...current, [key]: value }));
  return (
    <>
      <div className="marketing-filter-grid">
        <MultiSelectFilter
          label="Sales people"
          options={options.employees || []}
          value={filters.sales_employee_ids}
          onChange={set("sales_employee_ids")}
          optionValue={(option) => option.id}
          optionLabel={(option) => option.name}
        />
        <MultiSelectFilter
          label="Products / barcodes"
          options={options.products || []}
          value={filters.barcodes}
          onChange={set("barcodes")}
          optionValue={(option) => option.barcode}
          optionLabel={(option) => `${option.product_name} · ${option.barcode}`}
          searchable
        />
        <MultiSelectFilter
          label="Steadfast statuses"
          options={options.steadfast_statuses || []}
          value={filters.steadfast_statuses}
          onChange={set("steadfast_statuses")}
          optionValue={(option) => option}
          optionLabel={(option) => String(option).replaceAll("_", " ")}
        />
        <button
          className="btn"
          type="button"
          disabled={loading}
          onClick={() => setFilters(emptyMarketingFilters)}
        >
          <RotateCcw size={15} />Clear filters
        </button>
      </div>
      {loading && !data ? (
        <Busy />
      ) : (
        <>
          <div className="report-summary-grid">
            {[
              ["Distinct orders", number(summary.total_order_count || 0)],
              ["Selected products", number(summary.selected_product_count || 0)],
              ["Ad expense (USD)", valueDisplay("total_ad_expense_usd", summary.total_ad_expense_usd)],
              ["Ad expense (BDT)", money(summary.total_ad_expense_bdt || 0)],
              ["Ad expense / order", money(summary.ad_expense_per_order_bdt || 0)],
            ].map(([label, value]) => (
              <div className="report-summary-card" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="marketing-status-summary">
            <strong>Selected-status order breakdown</strong>
            <span>{summary.status_breakdown || "No matching orders"}</span>
          </div>
          <ReportTable
            title="Product overview · all salespeople"
            subtitle="Holistic product performance without splitting results by sales person."
            rows={data?.products}
          />
          <ReportTable
            title="Product and sales-person breakdown"
            subtitle="Ad expense per order uses distinct matching online orders for each actual product and sales person."
            rows={data?.details}
          />
        </>
      )}
    </>
  );
}
function RevenueExpenseSummary({ rows = [] }) {
  const sum = (key) =>
    rows.reduce((total, row) => total + Number(row[key] || 0), 0);
  const salesRevenue = sum("sales_revenue");
  const otherIncome = sum("other_income");
  const totalRevenue = sum("total_revenue");
  const operatingExpenses = sum("operating_expenses");
  const marketingExpenses = sum("marketing_expenses");
  const soldCost = sum("sold_purchase_cost");
  const totalCost = sum("total_cost");
  const netProfit = totalRevenue - totalCost;
  const margin = totalRevenue ? (netProfit / totalRevenue) * 100 : 0;
  return (
    <div className="report-summary-grid">
      {[
        ["Sales revenue", money(salesRevenue)],
        ["Other income", money(otherIncome)],
        ["Total revenue", money(totalRevenue)],
        ["Operating expenses", money(operatingExpenses)],
        ["Marketing expenses", money(marketingExpenses)],
        ["Sold purchase cost", money(soldCost)],
        ["Total cost", money(totalCost)],
        ["Net profit", money(netProfit)],
        ["Net margin", `${number(margin)}%`],
      ].map(([label, value]) => (
        <div className="report-summary-card" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
export default function Reports() {
  const [type, setType] = useState(reports[0][0]);
  const [dates, setDates] = useState(defaultDates);
  const [explorerFilters, setExplorerFilters] = useState(emptyExplorerFilters);
  const [marketingFilters, setMarketingFilters] = useState(emptyMarketingFilters);
  const explorer = type === "sales-explorer";
  const comparison = type === "revenue-expense";
  const marketing = type === "marketing";
  const { data, loading, error } = useData(
    `/analytics/reports/${type}?${qs(
      explorer
        ? { ...dates, ...explorerFilters }
        : marketing
          ? { ...dates, ...marketingFilters }
          : dates,
    )}`,
  );
  const rows = explorer
    ? data?.orders || []
    : marketing
      ? data?.details || []
      : data?.rows || [];
  return (
    <>
      <div className="page-heading reports-page-heading">
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
      <nav className="report-tabs" aria-label="Report types" role="tablist">
        {reports.map(([key, label]) => (
          <button
            className={type === key ? "selected" : ""}
            key={key}
            type="button"
            role="tab"
            aria-selected={type === key}
            onClick={() => setType(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <section className="panel report-panel">
          <div className="panel-heading">
            <div>
              <h3>{reports.find((r) => r[0] === type)[1]}</h3>
              <p>
                {explorer
                  ? `${number(data?.summary?.sale_count || 0)} matching orders · returns excluded`
                  : marketing
                    ? `${number(data?.summary?.total_order_count || 0)} distinct matching online orders`
                  : comparison
                    ? `${rows.length} daily rows · revenue, costs and profit compared`
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
          ) : marketing ? (
            <MarketingReport
              data={data}
              filters={marketingFilters}
              setFilters={setMarketingFilters}
              loading={loading}
            />
          ) : loading ? (
            <Busy />
          ) : rows.length ? (
            <>
              {comparison && <RevenueExpenseSummary rows={rows} />}
              <ReportTable
                title={comparison ? "Daily revenue and expense comparison" : "Report rows"}
                subtitle={comparison ? "Net profit = sales revenue + other income − operating expenses − marketing expenses − sold purchase cost." : undefined}
                rows={rows}
              />
            </>
          ) : (
            <Empty
              title="No sales in this period"
              text="Select another date range or create a sale to see your report."
            />
          )}
          <div className="panel-bottom">
            {comparison
              ? "Sales use order creation dates; income and ordinary expenses use accounting dates; marketing expenses use creation dates. Returned sales are excluded."
              : marketing
                ? "Marketing expenses are converted to BDT using the rate saved on each entry. Combo sales are attributed to their actual component products."
                : <>Discount is allocated to items by their share of the order subtotal.{explorer ? " Delivery is counted once per matching order; sold cost uses sale-time cost snapshots." : " Delivery is excluded from item sales."}</>}
          </div>
      </section>
    </>
  );
}

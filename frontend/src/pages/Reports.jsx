import React, { useState } from "react";
import { Download, ChartNoAxesCombined } from "lucide-react";
import { defaultDates, qs, downloadCsv, money, number } from "../api";
import { useData, DateRange, Busy, ErrorBox, Empty } from "../components";
const reports = [
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
};
export default function Reports() {
  const [type, setType] = useState(reports[0][0]);
  const [dates, setDates] = useState(defaultDates);
  const { data, loading, error } = useData(
    `/analytics/reports/${type}?${qs(dates)}`,
  );
  const rows = data?.rows || [];
  const keys = rows.length ? Object.keys(rows[0]) : [];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">TURN EVERY SALE INTO AN INSIGHT</span>
          <h1>Reports</h1>
          <p>A closer look at what sells, when, and with whom.</p>
        </div>
        <button
          className="btn"
          disabled={!rows.length || loading}
          onClick={() =>
            downloadCsv(rows, `borno-${type}-${dates.from}-${dates.to}.csv`)
          }
        >
          <Download size={16} />
          Export CSV
        </button>
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
              <p>{rows.length} report rows · returns excluded</p>
            </div>
            <DateRange value={dates} onChange={setDates} />
          </div>
          <ErrorBox message={error} />
          {loading ? (
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
            Delivery is excluded from item sales.
          </div>
        </section>
      </div>
    </>
  );
}

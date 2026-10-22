import React, { useState, useRef } from "react";
import {
  Upload,
  Download,
  Truck,
  CheckCircle2,
  ArrowRight,
  FileSpreadsheet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api, money, downloadCsv } from "../api";
import { useApp, ErrorBox, Badge, Empty } from "../components";
import { template, parseSalesCsv } from "../csv";
export default function BulkSales() {
  const { notify } = useApp();
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [send, setSend] = useState(true);
  const [result, setResult] = useState(null);
  const [filename, setFilename] = useState("");
  const lock = useRef(false);
  async function file(e) {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setError("Use a CSV file smaller than 5 MB");
      return;
    }
    setBusy(true);
    setError("");
    setOrders([]);
    setResult(null);
    setFilename(f.name);
    try {
      setOrders(await parseSalesCsv(f));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const data = await api("/sales/online/bulk", {
        method: "POST",
        body: { orders, send_to_steadfast: send },
      });
      setResult(data);
      setOrders([]);
      notify(`${data.orders.length} orders created`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MORE ORDERS, LESS REPETITION</span>
          <h1>Bulk online entry</h1>
          <p>Import, review, and create multiple orders in one go.</p>
        </div>
        <button
          className="btn"
          onClick={() =>
            downloadCsv(template, "borno-online-sales-template.csv")
          }
        >
          <Download size={16} />
          Download CSV template
        </button>
      </div>
      <ErrorBox message={error} />
      <div className="bulk-steps">
        <div className="selected">
          <b>1</b>Upload CSV
        </div>
        <span />
        <div className={orders.length ? "selected" : ""}>
          <b>2</b>Review orders
        </div>
        <span />
        <div className={result ? "selected" : ""}>
          <b>3</b>Create & dispatch
        </div>
      </div>
      <section className="panel panel-content">
        <label className="upload-box bulk-upload">
          <FileSpreadsheet size={37} />
          <strong>
            {busy
              ? "Preparing your orders…"
              : filename || "Choose your online sales CSV"}
          </strong>
          <span>
            One item per row. Use the same order_ref to group multiple items.
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={file}
            disabled={busy}
          />
        </label>
        <div className="info-note">
          <div>
            <strong>A few details before you import</strong>
            <p>
              Keep phone numbers as text to preserve the leading zero.
              Order-level fields must match across rows with the same order_ref.
              A blank rate uses the current sale price. Discount is a fixed
              amount per order. Replace the sample barcodes with your actual
              catalog barcodes.
            </p>
          </div>
        </div>
      </section>
      {orders.length > 0 && (
        <section className="panel space-top">
          <div className="panel-heading">
            <div>
              <h3>Review {orders.length} orders</h3>
              <p>Nothing is saved until you create the batch.</p>
            </div>
            <Badge>Ready to review</Badge>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Subtotal</th>
                  <th>Discount</th>
                  <th>Delivery</th>
                  <th>Paid</th>
                  <th>COD</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const subtotal = o.items.reduce(
                    (s, i) => s + i.quantity * i.rate,
                    0,
                  );
                  return (
                    <tr key={o.order_ref}>
                      <td>
                        <strong>{o.order_ref}</strong>
                      </td>
                      <td>
                        {o.customer.cus_name}
                        <small>{o.customer.cus_phone}</small>
                        <small>{o.customer.cus_address}</small>
                      </td>
                      <td>
                        {o.items.map((i, n) => (
                          <small key={n}>
                            {i.name} × {i.quantity}
                          </small>
                        ))}
                      </td>
                      <td>{money(subtotal)}</td>
                      <td>{money(o.final_discount)}</td>
                      <td>
                        <input
                          className="csv-amount"
                          aria-label={`Delivery charge for ${o.order_ref}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={o.delivery_charge}
                          onChange={(e) =>
                            setOrders((current) =>
                              current.map((order) =>
                                order === o
                                  ? {
                                      ...order,
                                      delivery_charge: Number(e.target.value),
                                    }
                                  : order,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>{money(o.paid_amount)}</td>
                      <td>
                        {money(
                          subtotal -
                            o.final_discount +
                            o.delivery_charge -
                            o.paid_amount,
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="bulk-checkout">
            <label className="toggle-card">
              <Truck size={23} />
              <div>
                <strong>Send this batch to Steadfast</strong>
                <small>Successful orders use their new ORD-ID as invoice</small>
              </div>
              <input
                type="checkbox"
                role="switch"
                checked={send}
                onChange={(e) => setSend(e.target.checked)}
              />
            </label>
            <button className="btn primary" disabled={busy} onClick={create}>
              {busy ? "Creating orders…" : `Create ${orders.length} orders`}
              <ArrowRight size={16} />
            </button>
          </div>
        </section>
      )}
      {result && (
        <section className="panel space-top">
          <div className="success-banner">
            <CheckCircle2 />
            <div>
              <h3>{result.orders.length} orders created</h3>
              <p>Your stock and customer records have been updated.</p>
            </div>
            <Link to="/sales/list" className="btn">
              View online sales <ArrowRight size={16} />
            </Link>
          </div>
          <div className="panel-content">
            <ErrorBox message={result.dispatch?.error} />
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Payable</th>
                    <th>COD / due</th>
                    <th>Courier response</th>
                  </tr>
                </thead>
                <tbody>
                  {result.orders.map((o) => {
                    const courier = result.dispatch?.results?.find(
                      (r) => r.invoice === `ORD-${o.id}`,
                    );
                    return (
                      <tr key={o.id}>
                        <td>ORD-{o.id}</td>
                        <td>{money(o.payable)}</td>
                        <td>{money(o.due)}</td>
                        <td>
                          {courier?.status === "success" ? (
                            <Badge>success</Badge>
                          ) : (
                            courier?.error || "Saved locally — see sales list"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

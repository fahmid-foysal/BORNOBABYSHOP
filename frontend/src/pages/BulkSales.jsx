import React, { useState, useRef } from "react";
import {
  Upload,
  Download,
  Truck,
  CheckCircle2,
  ArrowRight,
  FileSpreadsheet,
  Printer,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api, money, downloadCsv } from "../api";
import { useApp, ErrorBox, Badge, Empty } from "../components";
import { bulkTemplates, parseSalesCsv } from "../csv";
import { StickerSheet, printStickerSheet } from "../delivery-sticker";
export default function BulkSales() {
  const { notify, lookups } = useApp();
  const [importMode, setImportMode] = useState("mode2");
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [send, setSend] = useState(true);
  const [printAfterDispatch, setPrintAfterDispatch] = useState(false);
  const [result, setResult] = useState(null);
  const [stickerOrders, setStickerOrders] = useState([]);
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
    setStickerOrders([]);
    setFilename(f.name);
    try {
      setOrders(await parseSalesCsv(f, importMode, lookups));
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
      const importedOrders = orders;
      const data = await api("/sales/online/bulk", {
        method: "POST",
        body: { orders, send_to_steadfast: send },
      });
      setResult(data);
      const printable = data.orders
        .map((created, index) => {
          const courier = data.dispatch?.results?.find(
            (entry) => entry.invoice === `ORD-${created.id}`,
          );
          if (courier?.status !== "success" || !courier.consignment_id)
            return null;
          return {
            ...importedOrders[index],
            id: created.id,
            due: created.due,
            steadfast_cod_amount: created.due,
            steadfast_consignment_id: courier.consignment_id,
          };
        })
        .filter(Boolean);
      setStickerOrders(printable);
      setOrders([]);
      notify(`${data.orders.length} orders created`);
      if (printAfterDispatch) {
        if (printable.length) setTimeout(printStickerSheet, 250);
        else notify("No Steadfast-accepted orders were available to print", "error");
      }
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
            downloadCsv(
              bulkTemplates[importMode],
              `borno-online-sales-${importMode === "mode1" ? "payable" : "detailed"}-template.csv`,
            )
          }
        >
          <Download size={16} />
          Download CSV template
        </button>
      </div>
      <ErrorBox message={error} />
      <section className="panel panel-content bulk-mode-panel">
        <div>
          <strong>Choose CSV mode</strong>
          <p className="muted">
            {importMode === "mode1"
              ? "Mode 1 uses current sale prices, zero delivery charge, and calculates the bill from total paid + COD amount."
              : "Mode 2 lets the CSV provide rate, discount, delivery charge, paid amount, and notes."}
          </p>
        </div>
        <div className="segmented">
          <button
            type="button"
            className={importMode === "mode1" ? "selected" : ""}
            onClick={() => {
              setImportMode("mode1");
              setOrders([]);
              setResult(null);
              setStickerOrders([]);
              setFilename("");
              setError("");
            }}
          >
            Mode 1 · Paid + COD
          </button>
          <button
            type="button"
            className={importMode === "mode2" ? "selected" : ""}
            onClick={() => {
              setImportMode("mode2");
              setOrders([]);
              setResult(null);
              setStickerOrders([]);
              setFilename("");
              setError("");
            }}
          >
            Mode 2 · Detailed
          </button>
        </div>
      </section>
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
            key={importMode}
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
              In Mode 1, customer details, total_paid, cod_amount and notes may
              be entered on only one row per order; product_name is optional and
              informational only. Item rows beneath may leave those fields blank. In Mode 2,
              order-level fields must match across rows with the same order_ref.
              Payment method and sales employee are matched by name without
              case sensitivity. Replace sample barcodes with actual catalog
              barcodes.
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
                        {importMode === "mode1" ? (
                          money(0)
                        ) : (
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
                        )}
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
                onChange={(e) => {
                  setSend(e.target.checked);
                  if (!e.target.checked) setPrintAfterDispatch(false);
                }}
              />
            </label>
            <label className="toggle-card">
              <Printer size={23} />
              <div>
                <strong>Print stickers after Steadfast</strong>
                <small>Prints only orders accepted by the courier</small>
              </div>
              <input
                type="checkbox"
                role="switch"
                checked={printAfterDispatch}
                disabled={!send}
                onChange={(event) =>
                  setPrintAfterDispatch(event.target.checked)
                }
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
            {stickerOrders.length > 0 && (
              <button className="btn" onClick={printStickerSheet}>
                <Printer size={16} />
                Print {stickerOrders.length} stickers
              </button>
            )}
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
      <StickerSheet orders={stickerOrders} />
    </>
  );
}

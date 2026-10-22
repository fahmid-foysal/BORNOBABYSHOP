import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Eye,
  Wallet,
  Undo2,
  Truck,
  Printer,
  ExternalLink,
  List,
  Link2,
} from "lucide-react";
import { api, qs, money, defaultDates } from "../api";
import {
  useApp,
  useData,
  Modal,
  Field,
  ErrorBox,
  Empty,
  Busy,
  SearchInput,
  Pager,
  Badge,
  DateRange,
} from "../components";
import { Receipt } from "../receipt";
export default function SalesList() {
  const { lookups, notify } = useApp();
  const [channel, setChannel] = useState("offline");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dates, setDates] = useState(defaultDates);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const {
    data,
    loading,
    error: loadError,
  } = useData(
    `/sales/${channel}?${qs({ search, status, ...dates, page })}`,
    version,
  );
  async function send(row) {
    setBusy(true);
    try {
      const d = await api(`/sales/online/${row.id}/send-steadfast`, {
        method: "POST",
      });
      if (d.error) notify(d.error, "error");
      else
        notify("Dispatch attempt completed; check the order’s courier status");
      setVersion((v) => v + 1);
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  function open(mode, row) {
    setDialog({ mode, row });
    setError("");
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = Object.fromEntries(new FormData(e.target));
      const endpoint =
        dialog.mode === "reconcile"
          ? `/sales/online/${dialog.row.id}/reconcile-steadfast`
          : `/sales/${channel}/${dialog.row.id}/${dialog.mode === "return" ? "return" : "payments"}`;
      await api(endpoint, { method: "POST", body });
      notify(
        dialog.mode === "return"
          ? "Order returned and stock restored"
          : dialog.mode === "reconcile"
            ? "Courier details linked"
            : "Payment recorded",
      );
      setDialog(null);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">EVERY SALE, ONE CLEAR PICTURE</span>
          <h1>Sales list</h1>
          <p>Follow orders, collect payments, and manage returns.</p>
        </div>
        <Link className="btn primary" to={`/sales/${channel}`}>
          <Plus size={17} />
          New {channel} sale
        </Link>
      </div>
      <div className="sales-tabs">
        <div className="segmented large">
          {["offline", "online"].map((c) => (
            <button
              key={c}
              className={channel === c ? "selected" : ""}
              onClick={() => {
                setChannel(c);
                setPage(1);
              }}
            >
              {c === "offline" ? "In-store sales" : "Online sales"}
            </button>
          ))}
        </div>
        <DateRange
          value={dates}
          onChange={(v) => {
            setDates(v);
            setPage(1);
          }}
        />
      </div>
      <section className="panel">
        <div className="toolbar">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Find a customer, phone number or order ID…"
          />
          <select
            aria-label="Filter sale status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="paid">Paid</option>
            <option value="due">Due</option>
            <option value="returned">Returned</option>
          </select>
        </div>
        <ErrorBox message={loadError} />
        {loading ? (
          <Busy />
        ) : data?.rows.length ? (
          <div className="table-scroll">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Order / customer</th>
                  <th>Items</th>
                  <th>Payments</th>
                  <th>Sales person</th>
                  <th>Status</th>
                  {channel === "online" && <th>Steadfast</th>}
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>
                        {channel === "online" ? "ORD" : "POS"}-{row.id}
                      </strong>
                      <small>{row.created_at}</small>
                      <div className="customer-name">{row.cus_name}</div>
                      <small>{row.cus_phone}</small>
                      <small className="address">{row.cus_address}</small>
                    </td>
                    <td>
                      <div className="sale-item-list">
                        {row.items.map((i, n) => (
                          <div key={n}>
                            <strong>{i.item_name}</strong>
                            <span>
                              {i.quantity} × {money(i.rate)}{" "}
                              {i.item_type === "combo" && (
                                <b className="tag">Combo</b>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="payment-cell">
                        {[
                          ["Subtotal", row.subtotal],
                          ["Discount", row.discount],
                          ...(channel === "online"
                            ? [["Delivery", row.delivery_charge]]
                            : []),
                          ["Payable", row.payable],
                          ["Paid", row.paid],
                          ["Due", row.status === "returned" ? 0 : row.due],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <span>{k}</span>
                            <b>{money(v)}</b>
                          </div>
                        ))}
                        {row.overpaid > 0 && (
                          <small>Overpaid: {money(row.overpaid)}</small>
                        )}
                      </div>
                    </td>
                    <td>{row.sales_person_name || "Unassigned"}</td>
                    <td>
                      <Badge>{row.status}</Badge>
                    </td>
                    {channel === "online" && (
                      <td>
                        <div className="courier-cell">
                          <Badge>{row.steadfast_status || "pending"}</Badge>
                          <small>
                            Sent: {row.sent_to_steadfast ? "Yes" : "No"}
                          </small>
                          <small>
                            Courier charge:{" "}
                            {money(row.steadfast_delivery_charge)}
                          </small>
                          <small>COD: {money(row.steadfast_cod_amount)}</small>
                          {row.steadfast_tracking_link &&
                            /^https:\/\//.test(row.steadfast_tracking_link) && (
                              <a
                                className="text-link"
                                href={row.steadfast_tracking_link}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Track order <ExternalLink size={12} />
                              </a>
                            )}
                          {row.steadfast_last_error && (
                            <small className="text-danger">
                              {row.steadfast_last_error}
                            </small>
                          )}
                        </div>
                      </td>
                    )}
                    <td>
                      <div className="row-actions wrap">
                        <button
                          className="icon-btn"
                          title="Order details / print receipt"
                          onClick={() => open("detail", row)}
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          className="icon-btn"
                          title="See all payments"
                          onClick={() => open("payments", row)}
                        >
                          <List size={16} />
                        </button>
                        {row.status !== "returned" && (
                          <>
                            <button
                              className="icon-btn"
                              title="Add payment"
                              disabled={row.due <= 0}
                              onClick={() => open("payment", row)}
                            >
                              <Wallet size={16} />
                            </button>
                            <button
                              className="icon-btn danger"
                              title="Return full order"
                              onClick={() => open("return", row)}
                            >
                              <Undo2 size={16} />
                            </button>
                          </>
                        )}
                        {channel === "online" &&
                          !row.sent_to_steadfast &&
                          row.status !== "returned" && (
                            <>
                              {!row.steadfast_submitted_at ? (
                                <button
                                  className="btn small-btn"
                                  disabled={busy}
                                  onClick={() => send(row)}
                                >
                                  <Truck size={14} />
                                  Send
                                </button>
                              ) : (
                                <button
                                  className="btn small-btn"
                                  onClick={() => open("reconcile", row)}
                                >
                                  <Link2 size={14} />
                                  Reconcile
                                </button>
                              )}
                            </>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No orders in this view"
            text="Adjust the dates and filters, or create a new sale."
          />
        )}
        <Pager data={data} onChange={setPage} />
      </section>
      {dialog && (
        <Modal
          title={`${dialog.mode === "detail" ? "Order" : dialog.mode === "payments" ? "Payment history" : dialog.mode === "return" ? "Return order" : dialog.mode === "reconcile" ? "Reconcile Steadfast dispatch" : "Add payment"} · ${channel === "online" ? "ORD" : "POS"}-${dialog.row.id}`}
          onClose={() => !busy && setDialog(null)}
          wide={dialog.mode === "detail" || dialog.mode === "payments"}
        >
          {dialog.mode === "detail" ? (
            <>
              <div className="modal-body">
                <Receipt sale={dialog.row} />
                {channel === "online" && (
                  <div className="detail-grid">
                    {[
                      ["Courier status", dialog.row.steadfast_status],
                      ["Consignment", dialog.row.steadfast_consignment_id],
                      ["Tracking code", dialog.row.steadfast_tracking_code],
                      [
                        "Courier delivery charge",
                        money(dialog.row.steadfast_delivery_charge),
                      ],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <span>{k}</span>
                        <strong>{v || "—"}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn primary" onClick={() => window.print()}>
                  <Printer size={16} />
                  Print receipt
                </button>
              </div>
            </>
          ) : dialog.mode === "payments" ? (
            <div className="modal-body">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Method</th>
                      <th>Amount</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dialog.row.payments.map((p) => (
                      <tr key={p.id}>
                        <td>{p.created_at}</td>
                        <td>{p.method}</td>
                        <td className={p.amount < 0 ? "text-danger" : ""}>
                          {money(p.amount)}
                        </td>
                        <td>{p.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!dialog.row.payments.length && (
                <Empty title="No payments recorded" />
              )}
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="modal-body">
                <ErrorBox message={error} />
                {dialog.mode === "reconcile" ? (
                  <>
                    <div className="info-note">
                      Look up this invoice in the Steadfast merchant portal and
                      enter its confirmed consignment details. This links the
                      existing delivery.
                    </div>
                    <Field
                      label="Consignment ID"
                      type="number"
                      min="1"
                      name="consignment_id"
                      required
                    />
                    <Field
                      label="Tracking code"
                      name="tracking_code"
                      required
                    />
                    <Field
                      label="Tracking link (HTTPS)"
                      type="url"
                      pattern="https://.*"
                      name="tracking_link"
                      required
                    />
                  </>
                ) : (
                  <>
                    {dialog.mode === "return" && (
                      <div className="info-note">
                        This returns every item and restores its stock. The
                        refund defaults to the amount paid.
                      </div>
                    )}
                    <Field
                      label={
                        dialog.mode === "return"
                          ? "Refund amount"
                          : "Payment amount"
                      }
                      name="amount"
                      type="number"
                      step="0.01"
                      min={dialog.mode === "return" ? 0 : 0.01}
                      max={
                        dialog.mode === "return"
                          ? dialog.row.paid
                          : dialog.row.due
                      }
                      defaultValue={Math.max(
                        0,
                        dialog.mode === "return"
                          ? dialog.row.paid
                          : dialog.row.due,
                      )}
                      required
                    />
                    <Field label="Payment method">
                      <select
                        name="payment_method_id"
                        required
                        defaultValue={
                          dialog.row.payments[0]?.payment_method_id || ""
                        }
                      >
                        <option value="">Select…</option>
                        {lookups.payment_methods?.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.method}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {dialog.mode === "payment" && (
                      <Field label="Notes" name="notes" />
                    )}
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setDialog(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  className={`btn ${dialog.mode === "return" ? "danger-btn" : "primary"}`}
                  disabled={busy}
                >
                  {busy
                    ? "Saving…"
                    : dialog.mode === "return"
                      ? "Return & record refund"
                      : dialog.mode === "reconcile"
                        ? "Link confirmed delivery"
                        : "Record payment"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

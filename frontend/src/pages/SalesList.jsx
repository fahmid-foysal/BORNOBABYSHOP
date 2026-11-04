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
  RefreshCw,
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
const returnKey = (item) => `${item.item_type}:${item.line_id}`;
const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;
function estimateReturn(row, selection) {
  const selectedGross = roundMoney(
    row.items.reduce(
      (sum, item) =>
        sum +
        Math.min(
          Number(item.quantity),
          Math.max(0, Number(selection[returnKey(item)]) || 0),
        ) *
          Number(item.rate),
      0,
    ),
  );
  const fullReturn =
    row.items.length > 0 &&
    row.items.every(
      (item) => Number(selection[returnKey(item)]) === Number(item.quantity),
    );
  const allocatedDiscount = fullReturn
    ? Number(row.discount)
    : roundMoney(
        Number(row.discount) *
          (selectedGross / Math.max(Number(row.subtotal), selectedGross || 1)),
      );
  const remainingPayable = roundMoney(
    Math.max(
      0,
      Number(row.subtotal) -
        selectedGross -
        (Number(row.discount) - allocatedDiscount) +
        (fullReturn ? 0 : Number(row.delivery_charge || 0)),
    ),
  );
  return {
    selectedGross,
    allocatedDiscount,
    fullReturn,
    remainingPayable,
    refund: roundMoney(Math.max(0, Number(row.paid) - remainingPayable)),
  };
}
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
  const [refreshingId, setRefreshingId] = useState(null);
  const [returnSelection, setReturnSelection] = useState({});
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
  async function refreshSteadfast(row) {
    setRefreshingId(row.id);
    try {
      const result = await api(`/sales/online/${row.id}/refresh-steadfast`);
      notify(
        `Steadfast status: ${result.delivery_status.replaceAll("_", " ")}`,
      );
      setVersion((v) => v + 1);
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setRefreshingId(null);
    }
  }
  function open(mode, row) {
    setDialog({ mode, row });
    setError("");
    if (mode === "return")
      setReturnSelection(
        Object.fromEntries(row.items.map((item) => [returnKey(item), 0])),
      );
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const fields = new FormData(e.target);
      const body =
        dialog.mode === "return"
          ? {
              items: dialog.row.items
                .map((item) => ({
                  item_type: item.item_type,
                  line_id: item.line_id,
                  quantity: Number(returnSelection[returnKey(item)]) || 0,
                }))
                .filter((item) => item.quantity > 0),
              payment_method_id: fields.get("payment_method_id") || null,
              notes: fields.get("notes") || null,
            }
          : Object.fromEntries(fields);
      const endpoint =
        dialog.mode === "reconcile"
          ? `/sales/online/${dialog.row.id}/reconcile-steadfast`
          : `/sales/${channel}/${dialog.row.id}/${dialog.mode === "return" ? "return" : "payments"}`;
      await api(endpoint, { method: "POST", body });
      notify(
        dialog.mode === "return"
          ? "Selected items returned, refund recorded, and stock restored"
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
                            {Number(i.returned_quantity) > 0 && (
                              <small className="text-danger">
                                Returned: {i.returned_quantity} of{" "}
                                {i.sold_quantity}
                              </small>
                            )}
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
                      <Badge>
                        {row.return_status === "partial"
                          ? "partial_return"
                          : row.status}
                      </Badge>
                      {row.return_status === "partial" && (
                        <small>Payment: {row.status}</small>
                      )}
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
                          {row.steadfast_consignment_id && (
                            <button
                              className="btn small-btn courier-refresh"
                              disabled={refreshingId === row.id}
                              onClick={() => refreshSteadfast(row)}
                            >
                              <RefreshCw
                                size={12}
                                className={
                                  refreshingId === row.id ? "spin" : ""
                                }
                              />
                              {refreshingId === row.id
                                ? "Refreshing"
                                : "Refresh status"}
                            </button>
                          )}
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
                              title="Return selected items"
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
          wide={
            dialog.mode === "detail" ||
            dialog.mode === "payments" ||
            dialog.mode === "return"
          }
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
                ) : dialog.mode === "return" ? (
                  (() => {
                    const estimate = estimateReturn(
                      dialog.row,
                      returnSelection,
                    );
                    return (
                      <>
                        <div className="info-note">
                          Select the products or combos and quantities being
                          returned. Stock and the proportional order discount
                          are recalculated automatically.
                        </div>
                        <div className="table-scroll return-items">
                          <table>
                            <thead>
                              <tr>
                                <th>Item</th>
                                <th>Available</th>
                                <th>Return quantity</th>
                                <th>Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dialog.row.items
                                .filter((item) => Number(item.quantity) > 0)
                                .map((item) => {
                                  const key = returnKey(item);
                                  const quantity =
                                    Number(returnSelection[key]) || 0;
                                  return (
                                    <tr key={key}>
                                      <td>
                                        <strong>{item.item_name}</strong>
                                        {item.item_type === "combo" && (
                                          <small>Combo</small>
                                        )}
                                      </td>
                                      <td>{item.quantity}</td>
                                      <td>
                                        <input
                                          aria-label={`Return quantity for ${item.item_name}`}
                                          type="number"
                                          min="0"
                                          max={item.quantity}
                                          step="0.001"
                                          value={returnSelection[key] ?? 0}
                                          onChange={(event) =>
                                            setReturnSelection((current) => ({
                                              ...current,
                                              [key]: Math.min(
                                                Number(item.quantity),
                                                Math.max(
                                                  0,
                                                  Number(event.target.value) ||
                                                    0,
                                                ),
                                              ),
                                            }))
                                          }
                                        />
                                      </td>
                                      <td>
                                        {money(quantity * Number(item.rate))}
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                        <div className="return-summary">
                          <div>
                            <span>Selected merchandise</span>
                            <strong>{money(estimate.selectedGross)}</strong>
                          </div>
                          <div>
                            <span>Allocated discount</span>
                            <strong>{money(estimate.allocatedDiscount)}</strong>
                          </div>
                          <div>
                            <span>Remaining payable</span>
                            <strong>{money(estimate.remainingPayable)}</strong>
                          </div>
                          <div className="refund-total">
                            <span>Refund to record</span>
                            <strong>{money(estimate.refund)}</strong>
                          </div>
                        </div>
                        <Field
                          label="Refund payment method"
                          hint={
                            estimate.refund > 0
                              ? "Required because money will be refunded."
                              : "No payment entry is created when the calculated refund is zero."
                          }
                        >
                          <select
                            name="payment_method_id"
                            required={estimate.refund > 0}
                            defaultValue={
                              dialog.row.payments[0]?.payment_method_id || ""
                            }
                          >
                            <option value="">Select…</option>
                            {lookups.payment_methods?.map((method) => (
                              <option key={method.id} value={method.id}>
                                {method.method}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Return notes" name="notes" />
                      </>
                    );
                  })()
                ) : (
                  <>
                    <Field
                      label="Payment amount"
                      name="amount"
                      type="number"
                      step="0.01"
                      min={0.01}
                      max={dialog.row.due}
                      defaultValue={Math.max(0, dialog.row.due)}
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
                    <Field label="Notes" name="notes" />
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
                  disabled={
                    busy ||
                    (dialog.mode === "return" &&
                      estimateReturn(dialog.row, returnSelection)
                        .selectedGross <= 0)
                  }
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

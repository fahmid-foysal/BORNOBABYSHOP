import React, { useState, useRef } from "react";
import {
  Plus,
  ShoppingCart,
  ArrowRight,
  Search,
  Truck,
  Printer,
  CheckCircle2,
  Package,
  Banknote,
  RotateCcw,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api, money } from "../api";
import {
  useApp,
  Modal,
  Field,
  Select,
  ErrorBox,
  Empty,
  ItemPicker,
  BarcodeInput,
  ItemTable,
} from "../components";
import { Receipt } from "../receipt";
export default function SaleEntry({ channel }) {
  const online = channel === "online";
  const { lookups, notify } = useApp();
  const [items, setItems] = useState([]);
  const [customer, setCustomer] = useState({
    cus_name: "",
    cus_phone: "",
    cus_address: "",
  });
  const [employee, setEmployee] = useState("");
  const [notes, setNotes] = useState("");
  const [ordererNum, setOrdererNum] = useState("");
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState("amount");
  const [picker, setPicker] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [delivery, setDelivery] = useState(0);
  const [paid, setPaid] = useState(0);
  const [cashTendered, setCashTendered] = useState(0);
  const [method, setMethod] = useState("");
  const [send, setSend] = useState(true);
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(null);
  const submitLock = useRef(false);
  const subtotal = items.reduce(
    (s, i) => s + Number(i.quantity) * Number(i.rate),
    0,
  );
  const finalDiscount =
    Math.round(
      (discountType === "percentage"
        ? (subtotal * Number(discount)) / 100
        : Number(discount)) * 100,
    ) / 100;
  const payable =
    Math.round(
      (subtotal - finalDiscount + (online ? Number(delivery) : 0)) * 100,
    ) / 100;
  const cashReceived = Math.max(0, Number(cashTendered) || 0);
  const changeDue =
    Math.round(Math.max(0, cashReceived - payable) * 100) / 100;
  const cashShort = Math.round(Math.max(0, payable - cashReceived) * 100) / 100;
  function updateCashTendered(value) {
    const amount = Math.max(0, Number(value) || 0);
    setCashTendered(value === "" ? "" : amount);
    setPaid(Math.min(amount, payable));
  }
  function addCashNote(value) {
    updateCashTendered(Math.round((cashReceived + value) * 100) / 100);
  }
  function add(item) {
    const type = item.item_type || item.kind;
    setItems((current) => {
      const found = current.find(
        (i) => i.item_type === type && String(i.item_id) === String(item.id),
      );
      return found
        ? current.map((i) =>
            i === found ? { ...i, quantity: Number(i.quantity) + 1 } : i,
          )
        : [
            ...current,
            {
              item_type: type,
              item_id: item.id,
              name: item.name,
              barcode: item.barcode,
              quantity: 1,
              rate: Number(item.sale_price),
              delivery_charge: Number(
                item.default_delivery_charge ?? item.delivery_charge ?? 0,
              ),
            },
          ];
    });
  }
  async function findCustomer() {
    if (!customer.cus_phone) return;
    setFinding(true);
    try {
      const c = await api(
        `/sales/customer?phone=${encodeURIComponent(customer.cus_phone)}`,
      );
      if (c) {
        setCustomer({
          cus_name: c.cus_name,
          cus_phone: c.cus_phone,
          cus_address: c.cus_address || "",
        });
        notify("Customer found");
      } else notify("New customer — add their details below.");
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setFinding(false);
    }
  }
  function proceed(e) {
    e.preventDefault();
    setError("");
    if (!items.length) {
      setError("Select at least one item");
      return;
    }
    if (items.some((i) => !(Number(i.quantity) > 0) || Number(i.rate) < 0)) {
      setError("Enter valid quantities and rates");
      return;
    }
    if (finalDiscount > subtotal) {
      setError("Discount cannot exceed the subtotal");
      return;
    }
    const defaultDelivery = online
      ? items.reduce(
          (s, i) => s + Number(i.delivery_charge || 0) * Number(i.quantity),
          0,
        )
      : 0;
    setDelivery(defaultDelivery);
    setPaid(0);
    setCashTendered(0);
    setMethod(lookups.payment_methods?.[0]?.id || "");
    setCheckout(true);
  }
  async function create(e) {
    e.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setError("");
    try {
      const sale = await api(`/sales/${channel}`, {
        method: "POST",
        body: {
          customer,
          items: items.map((i) => ({
            item_type: i.item_type,
            item_id: Number(i.item_id),
            quantity: Number(i.quantity),
            rate: Number(i.rate),
          })),
          final_discount: finalDiscount,
          delivery_charge: online ? Number(delivery) : 0,
          paid_amount: Number(paid),
          payment_method_id: method ? Number(method) : null,
          sales_employee_id: employee ? Number(employee) : null,
          orderer_num: online ? ordererNum.trim() || null : null,
          notes,
          send_to_steadfast: send,
        },
      });
      setCompleted(
        online
          ? sale
          : {
              ...sale,
              cash_tendered: cashReceived,
              change_due: changeDue,
            },
      );
      setCheckout(false);
      if (sale.dispatch?.error)
        notify(`Order saved. ${sale.dispatch.error}`, "error");
      else notify("Order created");
      if (!online) setTimeout(() => window.print(), 350);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }
  function reset() {
    setCompleted(null);
    setItems([]);
    setCustomer({ cus_name: "", cus_phone: "", cus_address: "" });
    setDiscount(0);
    setCashTendered(0);
    setPaid(0);
    setNotes("");
    setOrdererNum("");
    setError("");
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {online
              ? "FROM YOUR SHOP TO THEIR DOOR"
              : "A LITTLE JOY AT CHECKOUT"}
          </span>
          <h1>{online ? "Online sale" : "Point of sale"}</h1>
          <p>
            {online
              ? "Build an order and send it straight to Steadfast."
              : "Scan, select, and send them home smiling."}
          </p>
        </div>
        <Link className="btn" to="/sales/list">
          View sales <ArrowRight size={16} />
        </Link>
      </div>
      <form onSubmit={proceed} className="sale-layout">
        <section className="panel sale-items">
          <div className="panel-heading">
            <div>
              <h3>Build your order</h3>
              <p>Scan a 5-character barcode and press Enter</p>
            </div>
            <span className="count">{items.length} items</span>
          </div>
          <div className="sale-scan">
            <BarcodeInput onSelect={add} />
            <button
              type="button"
              className="btn"
              onClick={() => setPicker(true)}
            >
              <Plus size={16} />
              Browse catalog
            </button>
          </div>
          <ErrorBox message={!checkout ? error : ""} />
          {items.length ? (
            <ItemTable items={items} onChange={setItems} />
          ) : (
            <Empty
              title="A basket full of possibilities"
              text="Scan a toy’s barcode or browse your catalog to add your first item."
              action={
                <button
                  type="button"
                  className="btn"
                  onClick={() => setPicker(true)}
                >
                  <Package size={16} />
                  Find products & combos
                </button>
              }
            />
          )}
          <div className="sale-notes">
            <Field label="Order notes (optional)">
              <textarea
                placeholder="Anything we should know about this order?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </div>
        </section>
        <aside className="sale-summary">
          <section className="panel customer-panel">
            <div className="panel-heading">
              <h3>Customer details</h3>
              <span className="tag">Saved by phone</span>
            </div>
            <div className="panel-content">
              <Field label="Phone number" required>
                <div className="input-action">
                  <input
                    type="tel"
                    required
                    minLength={7}
                    value={customer.cus_phone}
                    onChange={(e) =>
                      setCustomer({ ...customer, cus_phone: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        findCustomer();
                      }
                    }}
                    placeholder="01XXXXXXXXX"
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Find customer by phone"
                    disabled={finding}
                    onClick={findCustomer}
                  >
                    <Search size={17} />
                  </button>
                </div>
              </Field>
              <Field
                label="Customer name"
                required
                value={customer.cus_name}
                onChange={(e) =>
                  setCustomer({ ...customer, cus_name: e.target.value })
                }
                placeholder="Full name"
              />
              {online && (
                <Field
                  label="Orderer number (optional)"
                  value={ordererNum}
                  maxLength={100}
                  onChange={(e) => setOrdererNum(e.target.value)}
                  placeholder="External order/customer reference"
                />
              )}
              <Field label={`Address${online ? "" : " (optional)"}`}>
                <textarea
                  required={online}
                  value={customer.cus_address}
                  onChange={(e) =>
                    setCustomer({ ...customer, cus_address: e.target.value })
                  }
                  placeholder="Delivery address"
                />
              </Field>
              <Select
                label="Sales person (optional)"
                value={employee}
                onChange={setEmployee}
                options={lookups.employees || []}
              />
            </div>
          </section>
          <section className="panel order-summary">
            <div className="panel-heading">
              <h3>Order summary</h3>
            </div>
            <div className="panel-content">
              <div className="discount-label">
                <span>Discount</span>
                <div className="segmented">
                  <button
                    type="button"
                    className={discountType === "amount" ? "selected" : ""}
                    onClick={() => {
                      setDiscountType("amount");
                      setDiscount(0);
                    }}
                  >
                    ৳ Amount
                  </button>
                  <button
                    type="button"
                    className={discountType === "percentage" ? "selected" : ""}
                    onClick={() => {
                      setDiscountType("percentage");
                      setDiscount(0);
                    }}
                  >
                    %
                  </button>
                </div>
              </div>
              <input
                aria-label="Discount"
                type="number"
                min="0"
                step="0.01"
                max={discountType === "percentage" ? 100 : subtotal}
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
              <div className="summary-lines">
                <div>
                  <span>Subtotal</span>
                  <b>{money(subtotal)}</b>
                </div>
                <div>
                  <span>
                    Discount
                    {discountType === "percentage" ? ` (${discount}%)` : ""}
                  </span>
                  <b>− {money(finalDiscount)}</b>
                </div>
                {online && (
                  <small className="muted">
                    Delivery and advance payment are set at checkout.
                  </small>
                )}
                <div className="summary-total">
                  <span>Total</span>
                  <strong>
                    {money(Math.max(0, subtotal - finalDiscount))}
                  </strong>
                </div>
              </div>
              <button
                className="btn primary checkout-btn"
                disabled={!items.length}
              >
                Continue to checkout <ArrowRight size={17} />
              </button>
              <small className="checkout-hint">
                {online
                  ? "Review delivery & Steadfast before creating"
                  : "Select a payment method and print your receipt"}
              </small>
            </div>
          </section>
        </aside>
      </form>
      {picker && (
        <ItemPicker
          selected={items}
          onChange={setItems}
          onClose={() => setPicker(false)}
        />
      )}
      {checkout && (
        <Modal
          title="Ready for checkout"
          onClose={() => !busy && setCheckout(false)}
        >
          <form onSubmit={create}>
            <div className="modal-body">
              <ErrorBox message={error} />
              <div className="checkout-customer">
                <span className="avatar">
                  {customer.cus_name.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <strong>{customer.cus_name}</strong>
                  <small>
                    {customer.cus_phone} · {items.length} items
                  </small>
                </div>
              </div>
              {online && (
                <Field
                  label="Delivery charge"
                  type="number"
                  min="0"
                  step="0.01"
                  value={delivery}
                  onChange={(e) => setDelivery(e.target.value)}
                  required
                  hint="Pre-filled from item defaults; adjust for this delivery."
                />
              )}
              <Select
                label="Payment method"
                required={Number(paid) > 0}
                value={method}
                onChange={setMethod}
                options={lookups.payment_methods || []}
              />
              {online ? (
                <Field
                  label="Advance payment"
                  type="number"
                  min="0"
                  max={payable}
                  step="0.01"
                  value={paid}
                  onChange={(e) => setPaid(e.target.value)}
                  required
                />
              ) : (
                <section className="cash-calculator" aria-label="Cash calculator">
                  <div className="cash-calculator-heading">
                    <div>
                      <span className="cash-icon"><Banknote size={20} /></span>
                      <div>
                        <strong>Cash calculator</strong>
                        <small>Click a note more than once to add it again.</small>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Clear cash received"
                      aria-label="Clear cash received"
                      onClick={() => updateCashTendered(0)}
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                  <Field label="Cash received" required>
                    <div className="cash-input-wrap">
                      <span>৳</span>
                      <input
                        data-autofocus="true"
                        type="number"
                        min="0"
                        step="0.01"
                        value={cashTendered}
                        onChange={(event) => updateCashTendered(event.target.value)}
                        required
                      />
                    </div>
                  </Field>
                  <div className="cash-notes" aria-label="Add cash notes">
                    {[20, 50, 100, 200, 500, 1000].map((note) => (
                      <button
                        type="button"
                        key={note}
                        onClick={() => addCashNote(note)}
                        title={`Add ${note} taka`}
                      >
                        + ৳{note}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="exact-cash"
                      onClick={() => updateCashTendered(payable)}
                    >
                      Exact
                    </button>
                  </div>
                  <div className={`cash-result ${changeDue > 0 ? "has-change" : cashShort > 0 ? "is-short" : "is-exact"}`}>
                    <span>{changeDue > 0 ? "Cashback" : cashShort > 0 ? "Still due" : "Exact cash"}</span>
                    <strong>{money(changeDue > 0 ? changeDue : cashShort)}</strong>
                  </div>
                </section>
              )}
              {online && (
                <label className="toggle-card">
                  <Truck size={23} />
                  <div>
                    <strong>Send to Steadfast</strong>
                    <small>Book delivery when this order is created</small>
                  </div>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={send}
                    onChange={(e) => setSend(e.target.checked)}
                  />
                </label>
              )}
              <div className="summary-lines">
                <div>
                  <span>Subtotal</span>
                  <b>{money(subtotal)}</b>
                </div>
                <div>
                  <span>Discount</span>
                  <b>− {money(finalDiscount)}</b>
                </div>
                {online && (
                  <div>
                    <span>Delivery charge</span>
                    <b>{money(delivery)}</b>
                  </div>
                )}
                <div className="summary-total">
                  <span>Payable</span>
                  <strong>{money(payable)}</strong>
                </div>
                <div>
                  <span>{online ? "Cash on delivery" : "Remaining due"}</span>
                  <b>{money(Math.max(0, payable - Number(paid)))}</b>
                </div>
                {!online && (
                  <>
                    <div>
                      <span>Cash received</span>
                      <b>{money(cashReceived)}</b>
                    </div>
                    <div className="checkout-change-line">
                      <span>Cashback</span>
                      <b>{money(changeDue)}</b>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => setCheckout(false)}
              >
                Back
              </button>
              <button className="btn primary" disabled={busy}>
                {busy ? "Creating order…" : "Create order"}
                <CheckCircle2 size={17} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {completed && (
        <Modal title="A little joy, on its way" onClose={reset}>
          <div className="modal-body">
            <div className="success-banner">
              <CheckCircle2 size={22} />
              <div>
                <strong>
                  Order {online ? "ORD" : "POS"}-{completed.id} created
                </strong>
                <p>
                  {online
                    ? completed.sent_to_steadfast
                      ? "Sent to Steadfast successfully."
                      : "Saved locally. Check dispatch status in the sales list."
                    : "Your stock and payments are up to date."}
                </p>
              </div>
            </div>
            <Receipt sale={completed} />
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={() => window.print()}>
              <Printer size={16} />
              Print receipt
            </button>
            <button className="btn primary" onClick={reset}>
              <Plus size={16} />
              New sale
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

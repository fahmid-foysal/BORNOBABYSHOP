import React, { useState } from "react";
import { Plus, Eye, Pencil, Trash2, Wallet } from "lucide-react";
import { api, qs, money } from "../api";
import {
  useApp,
  useData,
  Modal,
  Field,
  Select,
  SearchInput,
  Pager,
  Busy,
  Empty,
  ErrorBox,
  Badge,
  ItemPicker,
  ItemTable,
} from "../components";
export default function Purchases() {
  const { lookups, notify } = useApp();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [items, setItems] = useState([]);
  const [picker, setPicker] = useState(false);
  const [detail, setDetail] = useState(null);
  const [payment, setPayment] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const {
    data,
    loading,
    error: loadError,
  } = useData(`/purchases?${qs({ search, page })}`, version);
  const total = items.reduce((s, i) => s + i.quantity * i.rate, 0);
  function edit(row) {
    setEditing(row || {});
    setForm({
      supplier_id: row?.supplier_id || "",
      notes: row?.notes || "",
      paid_amount: 0,
      payment_method_id: "",
    });
    setItems(
      (row?.items || []).map((i) => ({
        item_id: i.product_id,
        item_type: "product",
        name: i.product_name,
        barcode: i.barcode,
        quantity: Number(i.quantity),
        rate: Number(i.rate),
      })),
    );
    setError("");
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!items.length) throw new Error("Add at least one product");
      await api(`/purchases${editing.id ? `/${editing.id}` : ""}`, {
        method: editing.id ? "PUT" : "POST",
        body: {
          ...form,
          supplier_id: Number(form.supplier_id),
          payment_method_id: form.payment_method_id
            ? Number(form.payment_method_id)
            : null,
          items: items.map((i) => ({
            product_id: Number(i.item_id),
            quantity: Number(i.quantity),
            rate: Number(i.rate),
          })),
        },
      });
      setEditing(null);
      setVersion((v) => v + 1);
      notify("Purchase saved and stock updated");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(row) {
    if (!window.confirm(`Delete purchase #${row.id}?`)) return;
    try {
      await api(`/purchases/${row.id}`, { method: "DELETE" });
      setVersion((v) => v + 1);
      notify("Purchase deleted");
    } catch (e) {
      notify(e.message, "error");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">KEEP THE SHELVES FULL</span>
          <h1>Purchases</h1>
          <p>Receive stock, track supplier payments, and keep costs current.</p>
        </div>
        <button className="btn primary" onClick={() => edit(null)}>
          <Plus size={17} />
          New purchase
        </button>
      </div>
      <section className="panel">
        <div className="toolbar">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by supplier, notes or purchase ID…"
          />
        </div>
        <ErrorBox message={loadError} />
        {loading ? (
          <Busy />
        ) : data?.rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Purchase</th>
                  <th>Supplier</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Due</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>PUR-{row.id}</strong>
                      <small>{row.created_at}</small>
                    </td>
                    <td>{row.supplier_name}</td>
                    <td>{row.items.length} products</td>
                    <td>{money(row.total)}</td>
                    <td>{money(row.paid)}</td>
                    <td>{money(row.total - row.paid)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-btn"
                          title="Details and payments"
                          onClick={() => setDetail(row)}
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          className="icon-btn"
                          title="Edit purchase"
                          onClick={() => edit(row)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-btn"
                          title="Add supplier payment"
                          onClick={() => {
                            setPayment(row);
                            setError("");
                          }}
                        >
                          <Wallet size={16} />
                        </button>
                        <button
                          className="icon-btn danger"
                          title="Delete purchase"
                          onClick={() => remove(row)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Your next delivery starts here"
            text="Create a purchase to bring new toys into stock."
          />
        )}
        <Pager data={data} onChange={setPage} />
      </section>
      {editing && (
        <Modal
          title={`${editing.id ? "Edit" : "New"} purchase`}
          onClose={() => !busy && setEditing(null)}
          wide
        >
          <form onSubmit={save}>
            <div className="modal-body">
              <ErrorBox message={error} />
              <div className="form-grid">
                <Select
                  label="Supplier"
                  required
                  value={form.supplier_id}
                  onChange={(v) => setForm({ ...form, supplier_id: v })}
                  options={lookups.suppliers || []}
                />
                <Field
                  label="Notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <div className="section-heading">
                <h3>Purchase items</h3>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setPicker(true)}
                >
                  <Plus size={16} />
                  Find products
                </button>
              </div>
              {items.length ? (
                <ItemTable items={items} onChange={setItems} purchase />
              ) : (
                <Empty
                  title="Add products to this purchase"
                  text="Scan a barcode or browse your catalog."
                />
              )}
              <div className="purchase-total">
                <span>Purchase total</span>
                <strong>{money(total)}</strong>
              </div>
              {!editing.id && (
                <div className="form-grid">
                  <Field
                    label="Paid amount"
                    type="number"
                    min="0"
                    max={total}
                    step="0.01"
                    value={form.paid_amount}
                    onChange={(e) =>
                      setForm({ ...form, paid_amount: e.target.value })
                    }
                  />
                  <Select
                    label="Payment method"
                    required={Number(form.paid_amount) > 0}
                    value={form.payment_method_id}
                    onChange={(v) => setForm({ ...form, payment_method_id: v })}
                    options={lookups.payment_methods || []}
                  />
                </div>
              )}
              <div className="info-note">
                Saving updates each product’s purchase price to the rate entered
                here.
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn"
                type="button"
                onClick={() => setEditing(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={busy}>
                {busy ? "Saving…" : "Save purchase"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {picker && (
        <ItemPicker
          productsOnly
          selected={items}
          onChange={(next) =>
            setItems(
              next.map((i) => ({
                ...i,
                rate:
                  items.find((x) => x.item_id === i.item_id)?.rate ??
                  i.purchase_price ??
                  0,
              })),
            )
          }
          onClose={() => setPicker(false)}
        />
      )}
      {detail && (
        <Modal
          title={`Purchase PUR-${detail.id}`}
          onClose={() => setDetail(null)}
          wide
        >
          <div className="modal-body">
            <div className="detail-grid">
              {[
                ["Supplier", detail.supplier_name],
                ["Total", money(detail.total)],
                ["Paid", money(detail.paid)],
                ["Due", money(detail.total - detail.paid)],
                ["Notes", detail.notes],
              ].map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <strong>{v || "—"}</strong>
                </div>
              ))}
            </div>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      {i.product_name}
                      <small>{i.barcode}</small>
                    </td>
                    <td>{i.quantity}</td>
                    <td>{money(i.rate)}</td>
                    <td>{money(i.quantity * i.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 className="space-top">Supplier payments</h3>
            <table>
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {detail.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.created_at}</td>
                    <td>{p.method}</td>
                    <td>{money(p.amount)}</td>
                    <td>{p.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
      {payment && (
        <Modal
          title={`Pay supplier · PUR-${payment.id}`}
          onClose={() => !busy && setPayment(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const body = Object.fromEntries(new FormData(e.target));
                await api(`/purchases/${payment.id}/payments`, {
                  method: "POST",
                  body,
                });
                setPayment(null);
                setVersion((v) => v + 1);
                notify("Supplier payment recorded");
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="modal-body">
              <ErrorBox message={error} />
              <p>
                Outstanding balance:{" "}
                <strong>{money(payment.total - payment.paid)}</strong>
              </p>
              <Field
                label="Amount"
                type="number"
                name="amount"
                min="0.01"
                max={payment.total - payment.paid}
                step="0.01"
                defaultValue={Math.max(0, payment.total - payment.paid)}
                required
              />
              <Field label="Payment method">
                <select name="payment_method_id" required>
                  <option value="">Select…</option>
                  {lookups.payment_methods?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.method}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Notes" name="notes" />
            </div>
            <div className="modal-footer">
              <button className="btn primary" disabled={busy}>
                Record payment
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

import React, { useState } from "react";
import { Download, Truck, Eye, RefreshCw, ArrowRight } from "lucide-react";
import { api, qs, money } from "../api";
import {
  useApp,
  useData,
  ErrorBox,
  Empty,
  Busy,
  Modal,
  SearchInput,
  Pager,
  Badge,
  Field,
} from "../components";
export default function Steadfast() {
  const { notify } = useApp();
  const [paymentId, setPaymentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState(null);
  const [detail, setDetail] = useState(null);
  const {
    data,
    loading,
    error: loadError,
  } = useData(`/steadfast/payments?${qs({ search, page })}`, version);
  async function importPayment(e, key) {
    e?.preventDefault();
    setError("");
    setBusy(true);
    try {
      const d = await api("/steadfast/payments/import", {
        method: "POST",
        body: { payment_id: key || paymentId.trim() },
      });
      setResult(d);
      setVersion((v) => v + 1);
      notify(
        `${d.matched} new order payments recorded; ${d.already_applied} already applied`,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function inspect(row) {
    const response =
      typeof row.steadfast_settled_orders_details === "string"
        ? JSON.parse(row.steadfast_settled_orders_details)
        : row.steadfast_settled_orders_details;
    setDetail({ ...row, response });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DELIVERED, COLLECTED, RECONCILED</span>
          <h1>Steadfast payments</h1>
          <p>Connect courier settlements to your orders and accounts.</p>
        </div>
        <span className="courier-brand">
          <Truck size={20} />
          Steadfast integration
        </span>
      </div>
      <section className="panel settlement-entry">
        <span className="settlement-icon">
          <Download size={26} />
        </span>
        <div>
          <h3>Bring a settlement into your books</h3>
          <p>
            Enter the Steadfast payment ID. We’ll match its orders and record
            courier charges.
          </p>
          <form onSubmit={importPayment}>
            <input
              autoFocus
              required
              value={paymentId}
              onChange={(e) => setPaymentId(e.target.value.toUpperCase())}
              placeholder="SFC-23510236"
              pattern="SFC-[A-Za-z0-9-]+"
              aria-label="Steadfast payment ID"
            />
            <button className="btn primary" disabled={busy}>
              {busy ? "Importing…" : "Fetch & import"}
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </section>
      <ErrorBox message={error} />
      {result && (
        <div className="info-note">
          <div>
            <strong>
              {result.matched} new payments · {result.already_applied} already
              applied · {result.unmatched.length} unmatched consignments
            </strong>
            <p>
              {result.unmatched.length
                ? "Unmatched consignments remain in the stored response. Re-import this payment after linking the relevant orders to apply them."
                : "Order payments and courier charges are recorded. Re-importing this settlement will not duplicate entries."}
            </p>
            {result.unmatched.map((c) => (
              <small key={c.consignment_id}>
                {c.invoice} · {c.consignment_id} · {money(c.cod_amount)}
                <br />
              </small>
            ))}
          </div>
        </div>
      )}
      <section className="panel space-top">
        <div className="toolbar">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search payment IDs…"
          />
          <span className="muted">Stored settlements</span>
        </div>
        <ErrorBox message={loadError} />
        {loading ? (
          <Busy />
        ) : data?.rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Payment ID</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Courier paid at</th>
                  <th>Imported at</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.steadfast_payment_id}</strong>
                    </td>
                    <td>{row.method}</td>
                    <td>{money(row.amount)}</td>
                    <td>
                      <Badge>{row.steadfast_status_label}</Badge>
                    </td>
                    <td>{row.steadfast_paid_at || "—"}</td>
                    <td>{row.created_at}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-btn"
                          title="View stored response"
                          onClick={() => inspect(row)}
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          className="icon-btn"
                          title="Reapply unmatched consignments"
                          disabled={busy}
                          onClick={() =>
                            importPayment(null, row.steadfast_payment_id)
                          }
                        >
                          <RefreshCw size={16} />
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
            title="Your settlements, all in one place"
            text="Import your first Steadfast payment to reconcile delivered orders."
          />
        )}
        <Pager data={data} onChange={setPage} />
      </section>
      {detail && (
        <Modal
          title={detail.steadfast_payment_id}
          onClose={() => setDetail(null)}
          wide
        >
          <div className="modal-body">
            <div className="detail-grid">
              {[
                ["Courier amount", money(detail.response.payment.amount)],
                ["Net settlement", money(detail.response.payment.total)],
                [
                  "Recorded expense",
                  money(
                    detail.response.payment.amount -
                      detail.response.payment.total,
                  ),
                ],
                ["Status", detail.steadfast_status_label],
              ].map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
            <h3>Full stored API response</h3>
            <pre className="json-view">
              {JSON.stringify(detail.response, null, 2)}
            </pre>
          </div>
        </Modal>
      )}
    </>
  );
}

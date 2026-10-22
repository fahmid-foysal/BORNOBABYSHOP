import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  SlidersHorizontal,
} from "lucide-react";
import { api, qs, money, number, today } from "../api";
import {
  useApp,
  useData,
  Busy,
  ErrorBox,
  Empty,
  Modal,
  Field,
  Select,
  SearchInput,
  Pager,
  Badge,
  ItemPicker,
  moduleLabels,
} from "../components";
const defs = {
  suppliers: {
    title: "Suppliers",
    description: "Good relationships start with the right details.",
    fields: [
      ["supplier_name", "Supplier name", "text", true],
      ["supplier_phone", "Phone", "tel"],
    ],
  },
  categories: {
    title: "Categories",
    description: "Give every toy a place in your catalog.",
    fields: [
      ["category_name", "Category name", "text", true],
      ["parent_category_id", "Parent category", "categories"],
    ],
  },
  payment_methods: {
    title: "Payment methods",
    description: "The ways your customers and suppliers pay.",
    fields: [["method", "Method name", "text", true]],
  },
  expense_accounts: {
    title: "Expense accounts",
    description: "Keep your shop’s spending organized.",
    fields: [["title", "Account title", "text", true]],
  },
  income_accounts: {
    title: "Income accounts",
    description: "Organize income beyond your everyday sales.",
    fields: [["title", "Account title", "text", true]],
  },
  employees: {
    title: "Sales team",
    description: "The people behind every happy customer.",
    fields: [
      ["name", "Full name", "text", true],
      ["phone", "Phone", "tel"],
      ["rank", "Position", "text"],
      ["salary", "Salary", "number"],
    ],
  },
  expenses: {
    title: "Expenses",
    description: "A clear view of what keeps your shop running.",
    fields: [
      ["expense_account_id", "Expense account", "expense_accounts", true],
      ["amount", "Amount", "number", true],
      ["expense_date", "Expense date", "date", true],
      ["narration", "Narration", "textarea"],
    ],
  },
  incomes: {
    title: "Income",
    description: "Record the other income coming into your shop.",
    fields: [
      ["income_account_id", "Income account", "income_accounts", true],
      ["amount", "Amount", "number", true],
      ["income_date", "Income date", "date", true],
      ["narration", "Narration", "textarea"],
    ],
  },
  stock_adjustments: {
    title: "Stock adjustments",
    description: "Bring your inventory in line with the shelf.",
    fields: [
      ["product_id", "Product", "product", true],
      ["quantity", "Quantity change", "signed", true],
      ["reason", "Reason", "textarea", true],
    ],
  },
  users: {
    title: "Users & permissions",
    description: "The right tools, for the right people.",
    fields: [
      ["name", "Full name", "text", true],
      ["email", "Email address", "email", true],
      ["password", "Password", "password"],
    ],
  },
};
export default function Records({ resource: given }) {
  const params = useParams();
  const resource = given || params.resource;
  const def = defs[resource];
  const { lookups, notify, refreshLookups } = useApp();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [passwordUser, setPasswordUser] = useState(null);
  const endpoint = resource === "users" ? "/auth/users" : `/master/${resource}`;
  const {
    data,
    loading,
    error: loadError,
  } = useData(`${endpoint}?${qs({ search, page })}`, version);
  useEffect(() => {
    setSearch("");
    setPage(1);
    setEditing(null);
  }, [resource]);
  if (!def) return <Empty title="Module not found" />;
  const change = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  function edit(row) {
    setError("");
    setForm(
      row
        ? { ...row, password: "", permissions: row.permissions || [] }
        : {
            permissions: [],
            expense_date: today(),
            income_date: today(),
            quantity: 1,
            salary: 0,
          },
    );
    setEditing(row || {});
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = {};
      for (const [key, label, type] of def.fields) {
        let value = form[key];
        if (type === "password" && !value) {
          if (!editing.id)
            throw new Error("Enter a password of at least 8 characters");
          continue;
        }
        if (
          [
            "categories",
            "expense_accounts",
            "income_accounts",
            "product",
          ].includes(type)
        )
          value = value ? Number(value) : null;
        if (["number", "signed"].includes(type)) value = Number(value || 0);
        if (value !== undefined) body[key] = value;
      }
      if (resource === "users") body.permissions = form.permissions || [];
      await api(`${endpoint}${editing.id ? `/${editing.id}` : ""}`, {
        method: editing.id ? "PUT" : "POST",
        body,
      });
      notify(`${def.title} saved`);
      setEditing(null);
      setVersion((v) => v + 1);
      refreshLookups();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(row) {
    if (!window.confirm(`Delete this ${def.title.toLowerCase()} record?`))
      return;
    try {
      await api(`${endpoint}/${row.id}`, { method: "DELETE" });
      notify("Record deleted");
      setVersion((v) => v + 1);
      refreshLookups();
    } catch (e) {
      notify(e.message, "error");
    }
  }
  const labelValue = (row, key, type) => {
    if (type === "product") return row.product_name || `Product #${row[key]}`;
    if (lookups[type])
      return (
        lookups[type].find((i) => String(i.id) === String(row[key]))?.label ||
        lookups[type].find((i) => String(i.id) === String(row[key]))
          ?.category_name ||
        lookups[type].find((i) => String(i.id) === String(row[key]))?.title ||
        "—"
      );
    if (type === "number") return money(row[key]);
    if (type === "signed") return number(row[key]);
    return row[key] || "—";
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {resource === "users"
              ? "WORKSPACE"
              : resource === "stock_adjustments"
                ? "INVENTORY"
                : resource === "expenses" || resource === "incomes"
                  ? "FINANCE"
                  : "MASTER DATA"}
          </span>
          <h1>{def.title}</h1>
          <p>{def.description}</p>
        </div>
        <button className="btn primary" onClick={() => edit(null)}>
          <Plus size={17} />
          Add {resource === "users" ? "user" : "record"}
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
          />
          <span className="muted">{data?.total || 0} records</span>
        </div>
        <ErrorBox message={loadError} />
        {loading ? (
          <Busy />
        ) : data?.rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  {def.fields
                    .filter((f) => f[2] !== "password")
                    .map((f) => (
                      <th key={f[0]}>{f[1]}</th>
                    ))}
                  {resource === "users" && (
                    <>
                      <th>Role</th>
                      <th>Module access</th>
                    </>
                  )}
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="muted">#{row.id}</td>
                    {def.fields
                      .filter((f) => f[2] !== "password")
                      .map(([key, label, type]) => (
                        <td key={key}>{labelValue(row, key, type)}</td>
                      ))}
                    {resource === "users" && (
                      <>
                        <td>
                          <Badge>{row.role}</Badge>
                        </td>
                        <td>
                          <div className="permission-tags">
                            {row.role === "admin" ? (
                              <Badge>All modules</Badge>
                            ) : (
                              row.permissions.map((m) => (
                                <span className="tag" key={m}>
                                  {moduleLabels[m]}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                      </>
                    )}
                    <td>
                      <div className="row-actions">
                        {resource === "users" && (
                          <button
                            className="icon-btn"
                            title="Change password"
                            onClick={() => {
                              setPasswordUser(row);
                              setError("");
                            }}
                          >
                            <KeyRound size={16} />
                          </button>
                        )}
                        {row.role !== "admin" && (
                          <button
                            className="icon-btn"
                            title="Edit record"
                            onClick={() => edit(row)}
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                        {resource !== "users" &&
                          !(
                            resource === "expenses" &&
                            row.narration?.startsWith("STEADFAST_CHARGES ")
                          ) && (
                            <button
                              className="icon-btn danger"
                              title="Delete record"
                              onClick={() => remove(row)}
                            >
                              <Trash2 size={16} />
                            </button>
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
            title={`No ${def.title.toLowerCase()} yet`}
            text="Add a record to start organizing your workspace."
          />
        )}
        <Pager data={data} onChange={setPage} />
      </section>
      {editing && (
        <Modal
          title={`${editing.id ? "Edit" : "Add"} ${def.title.toLowerCase()}`}
          onClose={() => !busy && setEditing(null)}
        >
          <form onSubmit={save}>
            <div className="modal-body">
              <ErrorBox message={error} />
              <div className="form-grid">
                {def.fields.map(([key, label, type, required]) =>
                  type === "product" ? (
                    <div className="field" key={key}>
                      <span>{label}</span>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setPicker(true)}
                      >
                        {form.product_name ||
                          `Select product${form.product_id ? ` #${form.product_id}` : ""}`}
                      </button>
                      <small>
                        Use a negative quantity to remove damaged or missing
                        stock.
                      </small>
                    </div>
                  ) : lookups[type] ? (
                    <Select
                      key={key}
                      label={label}
                      value={form[key]}
                      required={required}
                      onChange={(v) => change(key, v)}
                      options={lookups[type].filter(
                        (i) =>
                          !(
                            resource === "categories" &&
                            String(i.id) === String(editing.id)
                          ),
                      )}
                    />
                  ) : type === "textarea" ? (
                    <Field key={key} label={label}>
                      <textarea
                        required={required}
                        value={form[key] || ""}
                        onChange={(e) => change(key, e.target.value)}
                      />
                    </Field>
                  ) : (
                    <Field
                      key={key}
                      label={label}
                      type={type === "signed" ? "number" : type}
                      required={
                        required || (type === "password" && !editing.id)
                      }
                      min={type === "number" ? 0 : undefined}
                      minLength={type === "password" ? 8 : undefined}
                      step={
                        type === "number" || type === "signed"
                          ? "0.001"
                          : undefined
                      }
                      value={form[key] ?? ""}
                      onChange={(e) => change(key, e.target.value)}
                      hint={
                        type === "password" && editing.id
                          ? "Leave empty to keep the current password."
                          : undefined
                      }
                    />
                  ),
                )}
              </div>
              {resource === "users" && (
                <div className="permission-list">
                  <h3>Module permissions</h3>
                  <p className="muted">
                    New users have the user role. Check each module they may
                    access.
                  </p>
                  {Object.entries(moduleLabels).map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={form.permissions?.includes(key) || false}
                        onChange={(e) =>
                          change(
                            "permissions",
                            e.target.checked
                              ? [...(form.permissions || []), key]
                              : form.permissions.filter((m) => m !== key),
                          )
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn"
                onClick={() => setEditing(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={busy}>
                {busy ? "Saving…" : "Save record"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {picker && (
        <ItemPicker
          productsOnly
          selected={[]}
          onChange={(items) => {
            const item = items.at(-1);
            if (item) {
              change("product_id", item.item_id);
              change("product_name", item.name);
              setPicker(false);
            }
          }}
          onClose={() => setPicker(false)}
        />
      )}
      {passwordUser && (
        <Modal
          title={`Change password · ${passwordUser.name}`}
          onClose={() => !busy && setPasswordUser(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await api(`/auth/users/${passwordUser.id}/password`, {
                  method: "PUT",
                  body: { password: new FormData(e.target).get("password") },
                });
                notify(
                  "Password updated. Previous sessions have been invalidated.",
                );
                setPasswordUser(null);
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="modal-body">
              <ErrorBox message={error} />
              <Field
                label="New password"
                type="password"
                name="password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </div>
            <div className="modal-footer">
              <button className="btn primary" disabled={busy}>
                Update password
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

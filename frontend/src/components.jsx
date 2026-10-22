import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  Package,
  ScanBarcode,
  Plus,
  Minus,
  LoaderCircle,
  AlertCircle,
} from "lucide-react";
import { api, qs, money, number, asset } from "./api";
export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);
export function useData(path, version = 0) {
  const [state, set] = useState({ data: null, loading: true, error: "" });
  useEffect(() => {
    let alive = true;
    set((v) => ({ ...v, loading: true, error: "" }));
    api(path)
      .then((data) => alive && set({ data, loading: false, error: "" }))
      .catch(
        (e) =>
          alive && set((v) => ({ ...v, loading: false, error: e.message })),
      );
    return () => {
      alive = false;
    };
  }, [path, version]);
  return state;
}
export function Busy() {
  return (
    <div className="empty">
      <LoaderCircle className="spin" size={26} />
      <p>Loading your workspace…</p>
    </div>
  );
}
export function ErrorBox({ message }) {
  return message ? (
    <div className="error" role="alert">
      <AlertCircle size={18} />
      {message}
    </div>
  ) : null;
}
export function Empty({
  title = "Nothing here yet",
  text = "Create your first record to get started.",
  action,
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Package size={28} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = ref.current;
    const focus = () =>
      [
        ...dialog.querySelectorAll("button,input,select,textarea,a[href]"),
      ].filter((el) => !el.disabled && el.offsetParent !== null);
    const initial =
      dialog.querySelector('[data-autofocus="true"]') ||
      dialog.querySelector('input:not([type="checkbox"]),select,textarea') ||
      focus()[0];
    initial?.focus();
    const key = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const list = focus();
        if (!list.length) return;
        const first = list[0],
          last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    dialog.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      dialog.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <header>
          <div>
            <span className="eyebrow">BORNO BABY SHOP</span>
            <h2>{title}</h2>
          </div>
          <button
            className="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Field({ label, children, hint, ...props }) {
  return (
    <label className="field">
      <span>
        {label}
        {props.required && <b className="required"> *</b>}
      </span>
      {children || <input {...props} />} {hint && <small>{hint}</small>}
    </label>
  );
}
export function Select({
  label,
  value,
  onChange,
  options,
  required = false,
  placeholder = "Select…",
}) {
  return (
    <Field label={label} required={required}>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label ||
              o.name ||
              o.title ||
              o.category_name ||
              o.supplier_name ||
              o.method}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = "Search records…",
}) {
  return (
    <div className="search-input">
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button
          className="icon-btn"
          aria-label="Clear search"
          onClick={() => onChange("")}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
export function Pager({ data, onChange }) {
  if (!data) return null;
  return (
    <div className="pagination">
      <span>
        {data.total
          ? `${(data.page - 1) * data.limit + 1}–${Math.min(data.page * data.limit, data.total)} of ${number(data.total)} records`
          : "0 records"}
      </span>
      <div>
        <button
          className="icon-btn"
          aria-label="Previous page"
          disabled={data.page <= 1}
          onClick={() => onChange(data.page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <span>
          Page {data.page} of {Math.max(1, data.pages)}
        </span>
        <button
          className="icon-btn"
          aria-label="Next page"
          disabled={data.page >= data.pages}
          onClick={() => onChange(data.page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
export function Badge({ children }) {
  const value = String(children ?? "");
  return (
    <span
      className={`badge ${["active", "paid", "delivered", "success"].includes(value) ? "green" : ["due", "pending", "in_review"].includes(value) ? "amber" : ["returned", "inactive", "cancelled"].includes(value) ? "red" : ""}`}
    >
      {value.replaceAll("_", " ") || "—"}
    </span>
  );
}
export function DateRange({ value, onChange }) {
  return (
    <div className="date-range">
      <input
        type="date"
        aria-label="From date"
        value={value.from}
        max={value.to}
        onChange={(e) =>
          e.target.value && onChange({ ...value, from: e.target.value })
        }
      />
      <span>—</span>
      <input
        type="date"
        aria-label="To date"
        value={value.to}
        min={value.from}
        onChange={(e) =>
          e.target.value && onChange({ ...value, to: e.target.value })
        }
      />
    </div>
  );
}
export const moduleLabels = {
  USER_MODULE: "Users & permissions",
  MASTER_DATA: "Master data",
  PRODUCTS: "Products",
  PRODUCT_COMBOS: "Product combos",
  PURCHASES: "Purchases",
  SALES: "Sales",
  STOCK_ADJUSTMENTS: "Stock adjustments",
  STEADFAST_PAYMENTS: "Steadfast payments",
  INCOME: "Income",
  EXPENSE: "Expenses",
  REPORTS: "Reports & dashboard",
};
export function CategoryFilter({ value, onChange, categories }) {
  const root = value.category_id;
  const descendants = [];
  const walk = (key, depth = 0, seen = new Set()) => {
    for (const c of categories.filter(
      (c) => String(c.parent_category_id) === String(key),
    )) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      descendants.push({ ...c, depth });
      walk(c.id, depth + 1, seen);
    }
  };
  if (root) walk(root);
  return (
    <div className="category-filter">
      <select
        aria-label="Filter by category"
        value={root || ""}
        onChange={(e) => {
          const category_id = e.target.value;
          const all = [];
          const collect = (k) => {
            for (const c of categories.filter(
              (c) => String(c.parent_category_id) === String(k),
            )) {
              if (all.includes(String(c.id))) continue;
              all.push(String(c.id));
              collect(c.id);
            }
          };
          collect(category_id);
          onChange({ category_id, category_ids: all.join(",") });
        }}
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.category_name}
          </option>
        ))}
      </select>
      {descendants.length > 0 && (
        <div className="category-checks">
          {descendants.map((c) => (
            <label key={c.id}>
              <input
                type="checkbox"
                checked={String(value.category_ids || "")
                  .split(",")
                  .includes(String(c.id))}
                onChange={(e) => {
                  const ids = new Set(
                    String(value.category_ids || "")
                      .split(",")
                      .filter(Boolean),
                  );
                  e.target.checked
                    ? ids.add(String(c.id))
                    : ids.delete(String(c.id));
                  onChange({ ...value, category_ids: [...ids].join(",") });
                }}
              />
              {c.depth > 0 ? "↳ " : ""}
              {c.category_name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
export function BarcodeInput({
  onSelect,
  productsOnly = false,
  autoFocus = true,
}) {
  const [value, set] = useState("");
  const [suggestion, setSuggestion] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(null);
  const latest = useRef("");
  const ref = useRef();
  function change(code) {
    code = code
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 5);
    latest.current = code;
    set(code);
    setSuggestion(null);
    setError("");
    if (code.length === 5) {
      setBusy(true);
      const task = api(
        `/catalog/search?${qs({ barcode: code, products_only: productsOnly ? "1" : undefined })}`,
      )
        .then((d) => {
          const item = d.rows[0] || null;
          if (latest.current === code) {
            setSuggestion(item);
            setError(item ? "" : "No matching barcode found");
          }
          return item;
        })
        .catch((e) => {
          if (latest.current === code) setError(e.message);
          return null;
        })
        .finally(() => {
          if (latest.current === code) setBusy(false);
        });
      pending.current = { code, task };
    } else {
      pending.current = null;
      setBusy(false);
    }
  }
  async function enter(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (value.length !== 5) return;
    const code = value;
    const item = suggestion || (await pending.current?.task);
    if (item && latest.current === code) {
      onSelect(item);
      change("");
      ref.current?.focus();
    }
  }
  return (
    <div className="barcode-wrap">
      <div className="barcode-input">
        <ScanBarcode size={22} />
        <input
          ref={ref}
          data-autofocus="true"
          autoFocus={autoFocus}
          aria-label="Scan five-character barcode"
          value={value}
          placeholder="Scan or enter a barcode"
          onChange={(e) => change(e.target.value)}
          onKeyDown={enter}
          autoComplete="off"
        />
        <kbd>ENTER ↵</kbd>
        {busy && <LoaderCircle className="spin" size={17} />}
      </div>
      {suggestion && (
        <div className="barcode-suggestion">
          <strong>{suggestion.name}</strong>
          <span>
            {money(suggestion.sale_price)} · {number(suggestion.stock)} in stock
            · press Enter to add
          </span>
        </div>
      )}
      {error && <small className="text-danger">{error}</small>}
    </div>
  );
}
export function ItemPicker({
  onClose,
  selected,
  onChange,
  productsOnly = false,
}) {
  const { lookups } = useApp();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState({});
  const [page, setPage] = useState(1);
  const { data, loading, error } = useData(
    `/catalog/search?${qs({ search, ...filter, page, limit: 12, products_only: productsOnly ? "1" : undefined })}`,
  );
  function add(item) {
    const type = item.item_type || item.kind;
    const found = selected.find(
      (i) => i.item_type === type && String(i.item_id) === String(item.id),
    );
    if (found)
      onChange(
        selected.map((i) =>
          i === found ? { ...i, quantity: Number(i.quantity) + 1 } : i,
        ),
      );
    else
      onChange([
        ...selected,
        {
          item_type: type,
          item_id: item.id,
          name: item.name,
          barcode: item.barcode,
          quantity: 1,
          rate: Number(item.sale_price),
          purchase_price: Number(item.purchase_price || 0),
          delivery_charge: Number(
            item.default_delivery_charge ?? item.delivery_charge ?? 0,
          ),
          image: item.image,
        },
      ]);
  }
  return (
    <Modal title="Find the right toy" onClose={onClose} wide>
      <div className="picker-layout">
        <div className="picker-catalog">
          <BarcodeInput productsOnly={productsOnly} onSelect={add} />
          <div className="toolbar">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search toys, combos or barcodes…"
            />
          </div>
          <CategoryFilter
            categories={lookups.categories || []}
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setPage(1);
            }}
          />
          <ErrorBox message={error} />
          {loading ? (
            <Busy />
          ) : (
            <div className="product-grid">
              {data?.rows.map((item) => (
                <button
                  className="product-card"
                  key={`${item.item_type}:${item.id}`}
                  onClick={() => add(item)}
                >
                  <div className="product-art">
                    {item.image ? (
                      <img src={asset(item.image)} alt="" />
                    ) : (
                      <Package size={36} />
                    )}
                    <span className="add-bubble">
                      <Plus size={16} />
                    </span>
                  </div>
                  <small>
                    {item.barcode} {item.item_type === "combo" && " · COMBO"}
                  </small>
                  <strong>{item.name}</strong>
                  <div>
                    <b>{money(item.sale_price)}</b>
                    <span>{number(item.stock)} left</span>
                  </div>
                </button>
              ))}
              {!data?.rows.length && (
                <Empty
                  title="No matching toys"
                  text="Try another barcode, name or category."
                />
              )}
            </div>
          )}
          <Pager data={data} onChange={setPage} />
        </div>
        <aside className="picker-selected">
          <h3>
            Selected items <span className="count">{selected.length}</span>
          </h3>
          <p className="muted">Keep browsing to build your selection.</p>
          {selected.length === 0 ? (
            <Empty
              title="Your selection starts here"
              text="Scan a barcode or choose a toy."
            />
          ) : (
            selected.map((i, index) => (
              <div
                className="selected-item"
                key={`${i.item_type}:${i.item_id}`}
              >
                <div>
                  <strong>{i.name}</strong>
                  <small>{i.barcode}</small>
                </div>
                <div className="quantity">
                  <button
                    type="button"
                    aria-label={`Decrease ${i.name}`}
                    onClick={() =>
                      onChange(
                        selected.flatMap((x, n) =>
                          n !== index
                            ? [x]
                            : x.quantity > 1
                              ? [{ ...x, quantity: Number(x.quantity) - 1 }]
                              : [],
                        ),
                      )
                    }
                  >
                    <Minus size={13} />
                  </button>
                  <b>{i.quantity}</b>
                  <button
                    type="button"
                    aria-label={`Increase ${i.name}`}
                    onClick={() =>
                      onChange(
                        selected.map((x, n) =>
                          n === index
                            ? { ...x, quantity: Number(x.quantity) + 1 }
                            : x,
                        ),
                      )
                    }
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
          <button className="btn primary" onClick={onClose}>
            Use {selected.length} selected items
          </button>
        </aside>
      </div>
    </Modal>
  );
}
export function ItemTable({ items, onChange, purchase = false }) {
  const update = (index, key, value) =>
    onChange(items.map((i, n) => (n === index ? { ...i, [key]: value } : i)));
  return (
    <div className="table-scroll">
      <table className="items-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Quantity</th>
            <th>{purchase ? "Purchase rate" : "Unit price"}</th>
            <th>Total</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((i, n) => (
            <tr key={`${i.item_type}:${i.item_id}`}>
              <td>
                <strong>{i.name}</strong>
                <small>
                  {i.barcode} · {i.item_type}
                </small>
              </td>
              <td>
                <input
                  aria-label={`Quantity for ${i.name}`}
                  type="number"
                  min="0.001"
                  step="0.001"
                  required
                  value={i.quantity}
                  onChange={(e) => update(n, "quantity", e.target.value)}
                />
              </td>
              <td>
                <input
                  aria-label={`Rate for ${i.name}`}
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={i.rate}
                  onChange={(e) => update(n, "rate", e.target.value)}
                />
              </td>
              <td className="nowrap">{money(i.quantity * i.rate)}</td>
              <td>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove ${i.name}`}
                  onClick={() => onChange(items.filter((_, idx) => idx !== n))}
                >
                  <X size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

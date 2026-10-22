import React, { useState } from "react";
import {
  Plus,
  Eye,
  Pencil,
  Trash2,
  Package,
  ImagePlus,
  X,
  ScanBarcode,
} from "lucide-react";
import { api, qs, money, number, asset } from "../api";
import {
  useApp,
  useData,
  Modal,
  Field,
  Select,
  SearchInput,
  CategoryFilter,
  Pager,
  Busy,
  Empty,
  ErrorBox,
  Badge,
  ItemPicker,
} from "../components";
export default function Catalog({ type }) {
  const combo = type === "combos";
  const { lookups, notify } = useApp();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState({});
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({});
  const [files, setFiles] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [items, setItems] = useState([]);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endpoint = `/catalog/${type}`;
  const {
    data,
    loading,
    error: loadError,
  } = useData(
    `${endpoint}?${qs({ search, ...filter, status, page })}`,
    version,
  );
  async function edit(row) {
    try {
      const d = row ? await api(`${endpoint}/${row.id}`) : {};
      setEditing(d);
      setForm({
        ...d,
        sale_price: d.sale_price || 0,
        purchase_price: d.purchase_price || 0,
        avg_weight: d.avg_weight || 0,
        default_delivery_charge: d.default_delivery_charge || 0,
        delivery_charge: d.delivery_charge || 0,
        status: d.status || "active",
      });
      setItems(
        (d.items || []).map((i) => ({
          item_type: "product",
          item_id: i.product_id,
          name: i.product_name,
          barcode: i.barcode,
          quantity: Number(i.quantity),
        })),
      );
      setFiles([]);
      setRemoved([]);
      setError("");
    } catch (e) {
      notify(e.message, "error");
    }
  }
  const change = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (combo && !items.length)
        throw new Error("Select at least one product for this combo");
      const body = {
        ...form,
        category_id: form.category_id ? Number(form.category_id) : null,
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
        remove_image_ids: removed,
      };
      if (combo)
        body.items = items.map((i) => ({
          product_id: Number(i.item_id),
          quantity: Number(i.quantity),
        }));
      const fd = new FormData();
      fd.set("data", JSON.stringify(body));
      files.forEach((f) => fd.append("images", f));
      await api(`${endpoint}${editing.id ? `/${editing.id}` : ""}`, {
        method: editing.id ? "PUT" : "POST",
        body: fd,
      });
      setEditing(null);
      setVersion((v) => v + 1);
      notify(`${combo ? "Combo" : "Product"} saved`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function show(row) {
    try {
      setDetail(await api(`${endpoint}/${row.id}`));
    } catch (e) {
      notify(e.message, "error");
    }
  }
  async function remove(row) {
    if (!window.confirm(`Delete ${row.name}?`)) return;
    try {
      await api(`${endpoint}/${row.id}`, { method: "DELETE" });
      setVersion((v) => v + 1);
      notify("Record deleted");
    } catch (e) {
      notify(e.message, "error");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR INVENTORY, ORGANIZED</span>
          <h1>
            {combo ? "Product combos" : "Products"}{" "}
            <span className="heading-count">{data?.total || 0}</span>
          </h1>
          <p>
            {combo
              ? "Thoughtful bundles. More play, together."
              : "A home for every toy, from shelf to doorstep."}
          </p>
        </div>
        <button className="btn primary" onClick={() => edit(null)}>
          <Plus size={17} />
          Create {combo ? "combo" : "product"}
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
            placeholder={`Search ${combo ? "combos" : "products"} by name or barcode…`}
          />
          {!combo && (
            <select
              aria-label="Filter by status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          )}
        </div>
        <div className="filter-row">
          <CategoryFilter
            categories={lookups.categories || []}
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setPage(1);
            }}
          />
          <span className="muted small-text">
            Stock includes combo component quantities
          </span>
        </div>
        <ErrorBox message={loadError} />
        {loading ? (
          <Busy />
        ) : data?.rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{combo ? "Combo" : "Product"}</th>
                  <th>Barcode</th>
                  {!combo && (
                    <>
                      <th>Category</th>
                      <th>Avg. weight</th>
                    </>
                  )}
                  <th>Sale price</th>
                  <th>Stock</th>
                  {!combo && <th>Status</th>}
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="product-cell">
                        <span className="thumb">
                          {row.image ? (
                            <img src={asset(row.image)} alt="" />
                          ) : (
                            <Package size={22} />
                          )}
                        </span>
                        <div>
                          <strong>{row.name}</strong>
                          <small>#{row.id}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <code>{row.barcode}</code>
                    </td>
                    {!combo && (
                      <>
                        <td>{row.category_name || "Uncategorized"}</td>
                        <td>{number(row.avg_weight)} kg</td>
                      </>
                    )}
                    <td>
                      <strong>{money(row.sale_price)}</strong>
                    </td>
                    <td>
                      <span
                        className={`stock-label ${row.stock <= 5 ? "low" : ""}`}
                      >
                        <i />
                        {number(row.stock)}
                      </span>
                    </td>
                    {!combo && (
                      <td>
                        <Badge>{row.status}</Badge>
                      </td>
                    )}
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-btn"
                          title="View details"
                          onClick={() => show(row)}
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          className="icon-btn"
                          title="Edit"
                          onClick={() => edit(row)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-btn danger"
                          title="Delete"
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
            title={`No ${combo ? "combos" : "products"} found`}
            text="Try adjusting your filters or create your first catalog item."
          />
        )}
        <Pager data={data} onChange={setPage} />
      </section>
      {editing && (
        <Modal
          title={`${editing.id ? "Edit" : "Create"} ${combo ? "combo" : "product"}`}
          onClose={() => !busy && setEditing(null)}
          wide
        >
          <form onSubmit={save}>
            <div className="modal-body">
              <ErrorBox message={error} />
              <div className="form-grid three">
                <Field
                  label={combo ? "Combo name" : "Product name"}
                  value={form[combo ? "combo_name" : "product_name"] || ""}
                  onChange={(e) =>
                    change(
                      combo ? "combo_name" : "product_name",
                      e.target.value,
                    )
                  }
                  required
                />
                <Field
                  label="Sale price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.sale_price}
                  onChange={(e) => change("sale_price", e.target.value)}
                  required
                />
                {combo ? (
                  <Field
                    label="Default delivery charge"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.delivery_charge}
                    onChange={(e) => change("delivery_charge", e.target.value)}
                  />
                ) : (
                  <>
                    <Field
                      label="Purchase price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.purchase_price}
                      onChange={(e) => change("purchase_price", e.target.value)}
                    />
                    <Select
                      label="Category"
                      value={form.category_id}
                      onChange={(v) => change("category_id", v)}
                      options={lookups.categories || []}
                    />
                    <Select
                      label="Supplier"
                      value={form.supplier_id}
                      onChange={(v) => change("supplier_id", v)}
                      options={lookups.suppliers || []}
                    />
                    <Field
                      label="Average weight (kg)"
                      type="number"
                      min="0"
                      step="0.001"
                      value={form.avg_weight}
                      onChange={(e) => change("avg_weight", e.target.value)}
                    />
                    <Field
                      label="Default delivery charge"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.default_delivery_charge}
                      onChange={(e) =>
                        change("default_delivery_charge", e.target.value)
                      }
                    />
                    <Select
                      label="Status"
                      value={form.status}
                      onChange={(v) => change("status", v)}
                      options={[
                        { id: "active", label: "Active" },
                        { id: "inactive", label: "Inactive" },
                      ]}
                      required
                    />
                  </>
                )}
              </div>
              <Field label="Description">
                <textarea
                  value={form.description || ""}
                  onChange={(e) => change("description", e.target.value)}
                />
              </Field>
              {combo && (
                <div className="combo-builder">
                  <div className="section-heading">
                    <div>
                      <h3>Products in this combo</h3>
                      <small>
                        Quantities are deducted for every combo sold.
                      </small>
                    </div>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setPicker(true)}
                    >
                      <Plus size={16} />
                      Select products
                    </button>
                  </div>
                  {items.map((item, index) => (
                    <div className="combo-row" key={item.item_id}>
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.barcode}</small>
                      </span>
                      <Field
                        label="Quantity"
                        type="number"
                        min="0.001"
                        step="0.001"
                        required
                        value={item.quantity}
                        onChange={(e) =>
                          setItems(
                            items.map((i, n) =>
                              n === index
                                ? { ...i, quantity: e.target.value }
                                : i,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="icon-btn"
                        title="Remove product"
                        onClick={() =>
                          setItems(items.filter((_, n) => n !== index))
                        }
                      >
                        <X size={17} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="upload-section">
                <h3>Product images</h3>
                <p className="muted">
                  JPEG, PNG or WebP · up to 5 MB each · 10 images per upload
                </p>
                <div className="image-previews">
                  {(editing.images || [])
                    .filter((i) => !removed.includes(i.id))
                    .map((i) => (
                      <div key={i.id}>
                        <img src={asset(i.img_path)} alt="Product" />
                        <button
                          type="button"
                          aria-label="Remove image"
                          onClick={() => setRemoved([...removed, i.id])}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                </div>
                <label className="upload-box">
                  <ImagePlus size={25} />
                  <strong>Choose product images</strong>
                  <span>
                    {files.length
                      ? files.map((f) => f.name).join(", ")
                      : "Choose multiple images from your device"}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={(e) => {
                      const chosen = [...e.target.files];
                      if (
                        chosen.length > 10 ||
                        chosen.some((f) => f.size > 5 * 1024 * 1024)
                      ) {
                        setError(
                          "Choose up to 10 images, no larger than 5 MB each",
                        );
                        return;
                      }
                      setFiles(chosen);
                    }}
                  />
                </label>
              </div>
              <div className="info-note">
                <ScanBarcode size={17} />
                {editing.barcode
                  ? `Barcode: ${editing.barcode}`
                  : "A unique 5-character barcode will be generated when you save."}
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={busy}>
                {busy ? "Saving…" : `Save ${combo ? "combo" : "product"}`}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {picker && (
        <ItemPicker
          productsOnly
          selected={items}
          onChange={setItems}
          onClose={() => setPicker(false)}
        />
      )}
      {detail && (
        <Modal title={detail.name} onClose={() => setDetail(null)} wide>
          <div className="modal-body">
            <div className="detail-gallery">
              {detail.images?.length ? (
                detail.images.map((i) => (
                  <img key={i.id} src={asset(i.img_path)} alt={detail.name} />
                ))
              ) : (
                <Package size={70} />
              )}
            </div>
            <div className="detail-grid">
              {[
                ["Barcode", detail.barcode],
                ["Sale price", money(detail.sale_price)],
                ["Available stock", number(detail.stock)],
                [
                  "Purchase price",
                  !combo ? money(detail.purchase_price) : null,
                ],
                [
                  "Average weight",
                  !combo ? `${number(detail.avg_weight)} kg` : null,
                ],
                [
                  "Delivery charge",
                  money(
                    detail.default_delivery_charge ?? detail.delivery_charge,
                  ),
                ],
                [
                  "Category",
                  detail.category_chain
                    ?.map((c) => c.category_name)
                    .join(" › "),
                ],
                ["Status", detail.status],
                ["Description", detail.description],
              ]
                .filter(([, v]) => v !== undefined && v !== null)
                .map(([k, v]) => (
                  <div key={k}>
                    <span>{k}</span>
                    <strong>{v || "—"}</strong>
                  </div>
                ))}
            </div>
            {combo && (
              <>
                <h3>Combo contents</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Barcode</th>
                        <th>Category chain</th>
                        <th>Quantity</th>
                        <th>Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map((i) => (
                        <tr key={i.id}>
                          <td>{i.product_name}</td>
                          <td>
                            <code>{i.barcode}</code>
                          </td>
                          <td>
                            {i.category_chain
                              ?.map((c) => c.category_name)
                              .join(" › ") || "—"}
                          </td>
                          <td>{number(i.quantity)}</td>
                          <td>{number(i.stock)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

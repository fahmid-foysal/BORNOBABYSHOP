import React, { useEffect, useState, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
  useLocation,
  Link,
} from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Layers,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Truck,
  ArrowDownLeft,
  ArrowUpRight,
  ChartNoAxesCombined,
  Users,
  Database,
  ChevronDown,
  ChevronRight,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
  Search,
  ArrowRight,
  ShieldCheck,
  ScanBarcode,
  CheckCircle2,
} from "lucide-react";
import { api, today } from "./api";
import { AppContext, ErrorBox, Busy, moduleLabels, useApp } from "./components";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Records = lazy(() => import("./pages/Records"));
const Catalog = lazy(() => import("./pages/Catalog"));
const Purchases = lazy(() => import("./pages/Purchases"));
const SaleEntry = lazy(() => import("./pages/SaleEntry"));
const SalesList = lazy(() => import("./pages/SalesList"));
const BulkSales = lazy(() => import("./pages/BulkSales"));
const Reports = lazy(() => import("./pages/Reports"));
const Steadfast = lazy(() => import("./pages/Steadfast"));
import "./style.css";
const groups = [
  {
    label: "Overview",
    items: [["Dashboard", "/", LayoutDashboard, "REPORTS"]],
  },
  {
    label: "SHOP OPERATIONS",
    items: [
      ["Products", "/products", Package, "PRODUCTS"],
      ["Product combos", "/combos", Layers, "PRODUCT_COMBOS"],
      ["Purchases", "/purchases", ShoppingBag, "PURCHASES"],
      [
        "Sales",
        null,
        ShoppingCart,
        "SALES",
        [
          ["Offline sale", "/sales/offline"],
          ["Online sale", "/sales/online"],
          ["Bulk online entry", "/sales/bulk"],
          ["Sales list", "/sales/list"],
        ],
      ],
      ["Stock adjustments", "/stock", SlidersHorizontal, "STOCK_ADJUSTMENTS"],
    ],
  },
  {
    label: "FINANCE & INSIGHTS",
    items: [
      ["Steadfast payments", "/steadfast", Truck, "STEADFAST_PAYMENTS"],
      ["Income", "/income", ArrowDownLeft, "INCOME"],
      ["Expenses", "/expenses", ArrowUpRight, "EXPENSE"],
      ["Reports", "/reports", ChartNoAxesCombined, "REPORTS"],
    ],
  },
  {
    label: "WORKSPACE",
    items: [
      [
        "Master data",
        null,
        Database,
        "MASTER_DATA",
        [
          ["Suppliers", "/master/suppliers"],
          ["Categories", "/master/categories"],
          ["Payment methods", "/master/payment_methods"],
          ["Expense accounts", "/master/expense_accounts"],
          ["Income accounts", "/master/income_accounts"],
          ["Sales team", "/master/employees"],
        ],
      ],
      ["Users & permissions", "/users", Users, "USER_MODULE"],
    ],
  },
];
function Login({ onLogin }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const b = Object.fromEntries(new FormData(e.target));
    try {
      const result = await api("/auth/login", { method: "POST", body: b });
      sessionStorage.setItem("bbs-token", result.token);
      onLogin(result.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <aside>
        <div className="login-brand">
          <img src="/logo.png" alt="Borno Baby Shop" />
          <span>BORNO BABY SHOP</span>
        </div>
        <span className="eyebrow">A LITTLE JOY. A LOT OF POSSIBILITIES.</span>
        <h1>
          A happier shop.
          <br />A clearer picture.
        </h1>
        <p>
          From the first barcode scan to the last doorstep delivery, bring every
          part of your shop together.
        </p>
        <div className="login-tiles">
          <span>
            <Package />
            Your inventory, in sync
          </span>
          <span>
            <Truck />
            Every delivery, connected
          </span>
          <span>
            <ChartNoAxesCombined />
            Your business, at a glance
          </span>
        </div>
        <small>Made for the everyday magic of Borno Baby Shop.</small>
      </aside>
      <main>
        <div className="login-form">
          <span className="login-mark">
            <ShoppingBag size={26} />
          </span>
          <h2>Welcome back</h2>
          <p className="muted">Sign in to your Borno Baby Shop workspace.</p>
          <form onSubmit={submit}>
            <ErrorBox message={error} />
            <label className="field">
              <span>Email address</span>
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="you@bornobabyshop.com"
                autoFocus
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Enter your password"
              />
            </label>
            <button className="btn primary" disabled={busy}>
              {busy ? "Signing in…" : "Sign in to workspace"}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="login-note">
            <ShieldCheck size={16} />
            Your shop. Your team. One secure workspace.
          </div>
        </div>
      </main>
    </div>
  );
}
function Protected({ module, children }) {
  const { can, landing } = useApp();
  return can(module) ? (
    children
  ) : (
    <Navigate to={landing || "/no-access"} replace />
  );
}
function Shell() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [lookups, setLookups] = useState({});
  const [toast, setToast] = useState(null);
  const [theme, setTheme] = useState(
    localStorage.getItem("bbs-theme") || "light",
  );
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState({ Sales: true });
  const [navSearch, setNavSearch] = useState("");
  const location = useLocation();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("bbs-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!sessionStorage.getItem("bbs-token")) {
      setReady(true);
      return;
    }
    api("/auth/me")
      .then(setUser)
      .catch(() => sessionStorage.removeItem("bbs-token"))
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    const fn = () => setUser(null);
    window.addEventListener("bbs-logout", fn);
    return () => window.removeEventListener("bbs-logout", fn);
  }, []);
  const notify = (message, type = "success") => setToast({ message, type });
  async function refreshLookups() {
    try {
      setLookups(await api("/master/lookups"));
    } catch (e) {
      notify(e.message, "error");
    }
  }
  useEffect(() => {
    if (user) refreshLookups();
  }, [user]);
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(timer);
  }, [toast]);
  if (!ready) return <Busy />;
  if (!user) return <Login onLogin={setUser} />;
  const can = (m) => user.role === "admin" || user.permissions?.includes(m);
  const all = groups.flatMap((g) => g.items);
  const current =
    all
      .flatMap((i) => (i[4] ? i[4] : [[i[0], i[1]]]))
      .find((i) => i[1] === location.pathname)?.[0] || "Workspace";
  const first = all.find((i) => can(i[3]));
  const landing = first?.[1] || first?.[4]?.[0][1];
  return (
    <AppContext.Provider
      value={{ user, can, lookups, refreshLookups, notify, landing }}
    >
      <div className="app-shell">
        {open && (
          <div className="sidebar-scrim" onClick={() => setOpen(false)} />
        )}
        <aside className={`sidebar ${open ? "is-open" : ""}`}>
          <Link to={landing || "/no-access"} className="brand">
            <img src="/logo.png" alt="Borno Baby Shop" />
            <div>
              <strong>Borno Baby Shop</strong>
              <small>SHOP WORKSPACE</small>
            </div>
          </Link>
          <div className="workspace-select">
            <span className="workspace-avatar">B</span>
            <div>
              <strong>BornoBabyShop</strong>
              <small>Retail & online operations</small>
            </div>
            <span className="status-dot" />
          </div>
          <div className="side-nav">
            {groups.map((group) => {
              const items = group.items.filter(
                (i) =>
                  can(i[3]) &&
                  (!navSearch ||
                    i[0].toLowerCase().includes(navSearch.toLowerCase()) ||
                    i[4]?.some((s) =>
                      s[0].toLowerCase().includes(navSearch.toLowerCase()),
                    )),
              );
              if (!items.length) return null;
              return (
                <div className="nav-group" key={group.label}>
                  <p>{group.label}</p>
                  {items.map(([label, path, Icon, module, children]) => (
                    <React.Fragment key={label}>
                      {children ? (
                        <>
                          <button
                            className={`nav-link ${children.some((c) => c[1] === location.pathname) ? "parent-active" : ""}`}
                            onClick={() =>
                              setExpanded((v) => ({ ...v, [label]: !v[label] }))
                            }
                          >
                            <Icon size={18} />
                            <span>{label}</span>
                            {expanded[label] ? (
                              <ChevronDown size={15} />
                            ) : (
                              <ChevronRight size={15} />
                            )}
                          </button>
                          {(expanded[label] || navSearch) && (
                            <div className="subnav">
                              {children.map(([label, path]) => (
                                <NavLink key={path} to={path}>
                                  {label}
                                </NavLink>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <NavLink
                          to={path}
                          end
                          className={({ isActive }) =>
                            `nav-link ${isActive ? "active" : ""}`
                          }
                        >
                          <Icon size={18} />
                          <span>{label}</span>
                          {path === "/products" && (
                            <span className="tiny-tag">CATALOG</span>
                          )}
                        </NavLink>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="sidebar-foot">
            <div className="shop-note">
              <span>✦</span>
              <p>
                A little joy, every day.
                <small>Let’s make today a good shop day.</small>
              </p>
            </div>
            <button
              className="profile"
              onClick={() => {
                sessionStorage.removeItem("bbs-token");
                setUser(null);
              }}
              title="Sign out"
            >
              <span className="avatar">
                {user.name?.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <strong>{user.name}</strong>
                <small>
                  {user.role === "admin" ? "Administrator" : "Team member"}
                </small>
              </div>
              <LogOut size={17} />
            </button>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <button
              className="icon-btn mobile-menu"
              aria-label="Open navigation"
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </button>
            <div className="breadcrumb">
              Workspace <ChevronRight size={14} />
              <strong>{current}</strong>
            </div>
            <div className="top-actions">
              <div className="nav-search">
                <Search size={15} />
                <input
                  value={navSearch}
                  onChange={(e) => setNavSearch(e.target.value)}
                  placeholder="Find a module…"
                  aria-label="Find a module"
                />
              </div>
              <span className="live-indicator">
                <i />
                Workspace
              </span>
              <button
                className="icon-btn"
                aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              >
                {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
              </button>
              <span className="avatar small">
                {user.name?.slice(0, 2).toUpperCase()}
              </span>
            </div>
          </header>
          <main className="page">
            <Routes>
              <Route
                path="/"
                element={
                  <Protected module="REPORTS">
                    <Dashboard />
                  </Protected>
                }
              />
              <Route
                path="/products"
                element={
                  <Protected module="PRODUCTS">
                    <Catalog key="products" type="products" />
                  </Protected>
                }
              />
              <Route
                path="/combos"
                element={
                  <Protected module="PRODUCT_COMBOS">
                    <Catalog key="combos" type="combos" />
                  </Protected>
                }
              />
              <Route
                path="/purchases"
                element={
                  <Protected module="PURCHASES">
                    <Purchases />
                  </Protected>
                }
              />
              <Route
                path="/sales/offline"
                element={
                  <Protected module="SALES">
                    <SaleEntry key="offline" channel="offline" />
                  </Protected>
                }
              />
              <Route
                path="/sales/online"
                element={
                  <Protected module="SALES">
                    <SaleEntry key="online" channel="online" />
                  </Protected>
                }
              />
              <Route
                path="/sales/list"
                element={
                  <Protected module="SALES">
                    <SalesList />
                  </Protected>
                }
              />
              <Route
                path="/sales/bulk"
                element={
                  <Protected module="SALES">
                    <BulkSales />
                  </Protected>
                }
              />
              <Route
                path="/stock"
                element={
                  <Protected module="STOCK_ADJUSTMENTS">
                    <Records key="stock" resource="stock_adjustments" />
                  </Protected>
                }
              />
              <Route
                path="/income"
                element={
                  <Protected module="INCOME">
                    <Records key="income" resource="incomes" />
                  </Protected>
                }
              />
              <Route
                path="/expenses"
                element={
                  <Protected module="EXPENSE">
                    <Records key="expenses" resource="expenses" />
                  </Protected>
                }
              />
              <Route
                path="/master/:resource"
                element={
                  <Protected module="MASTER_DATA">
                    <Records />
                  </Protected>
                }
              />
              <Route
                path="/users"
                element={
                  <Protected module="USER_MODULE">
                    <Records key="users" resource="users" />
                  </Protected>
                }
              />
              <Route
                path="/steadfast"
                element={
                  <Protected module="STEADFAST_PAYMENTS">
                    <Steadfast />
                  </Protected>
                }
              />
              <Route
                path="/reports"
                element={
                  <Protected module="REPORTS">
                    <Reports />
                  </Protected>
                }
              />
              <Route
                path="/no-access"
                element={
                  <div className="empty">
                    <ShieldCheck size={40} />
                    <h2>Your workspace is ready</h2>
                    <p>
                      Ask your administrator to assign your module permissions.
                    </p>
                  </div>
                }
              />
              <Route
                path="*"
                element={<Navigate to={landing || "/no-access"} replace />}
              />
            </Routes>
          </main>
          <footer className="page-footer">
            <span>© {today().slice(0, 4)} Borno Baby Shop</span>
            <span>A little joy, beautifully managed.</span>
          </footer>
        </div>
      </div>
      {toast && (
        <div role="status" className={`toast ${toast.type}`}>
          <CheckCircle2 size={19} />
          <span>{toast.message}</span>
          <button
            className="icon-btn"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </AppContext.Provider>
  );
}
class Boundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="empty">
        <h2>The workspace could not be displayed</h2>
        <button className="btn" onClick={() => window.location.reload()}>
          Reload workspace
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Boundary>
      <BrowserRouter>
        <Suspense fallback={<Busy />}>
          <Shell />
        </Suspense>
      </BrowserRouter>
    </Boundary>
  </React.StrictMode>,
);

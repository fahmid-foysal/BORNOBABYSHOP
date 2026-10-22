import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Wallet,
  ShoppingBag,
  ChartNoAxesCombined,
  Package,
  Plus,
  CalendarDays,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  useApp,
  useData,
  DateRange,
  Busy,
  ErrorBox,
  Empty,
  Badge,
} from "../components";
import { defaultDates, qs, money, number, today } from "../api";
const colors = [
  "#0e8f92",
  "#6c78c7",
  "#f2b66c",
  "#93c9b7",
  "#dc8eac",
  "#a4adbd",
];
export default function Dashboard() {
  const { user, can } = useApp();
  const [dates, setDates] = useState(defaultDates);
  const {
    data: d,
    loading,
    error,
  } = useData(`/analytics/dashboard?${qs(dates)}`);
  const [metric, setMetric] = useState("revenue");
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR SHOP, AT A GLANCE</span>
          <h1>
            Good to see you, {user.name.split(" ")[0]}{" "}
            <span className="wave">✦</span>
          </h1>
          <p>Here’s how things are going at Borno Baby Shop.</p>
        </div>
        {can("SALES") && (
          <Link to="/sales/offline" className="btn primary">
            <Plus size={17} />
            New sale
          </Link>
        )}
      </div>
      <div className="page-tabs">
        <span className="selected">Overview</span>
        <Link to="/reports">
          Sales reports <ArrowUpRight size={13} />
        </Link>
        <div className="tabs-right">
          <CalendarDays size={15} />
          {new Date(`${today()}T12:00:00`).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </div>
      </div>
      <div className="section-heading">
        <div>
          <h3>
            Business overview <span className="live-dot" />
          </h3>
          <small>Every number, connected to your shop.</small>
        </div>
        <DateRange value={dates} onChange={setDates} />
      </div>
      <ErrorBox message={error} />
      {loading ? (
        <Busy />
      ) : (
        d && (
          <>
            <div className="stats-grid">
              {[
                {
                  label: "Sales revenue",
                  value: money(d.revenue),
                  detail: "Net sales + delivery, excluding returns",
                  icon: Wallet,
                  color: "teal",
                },
                {
                  label: "Cash profit",
                  value: money(d.profit),
                  detail: "Income & receipts − expenses & payouts",
                  icon: TrendingUp,
                  color: "purple",
                },
                {
                  label: "Orders placed",
                  value: number(d.orders),
                  detail: "Online and in-store orders",
                  icon: ShoppingBag,
                  color: "orange",
                },
                {
                  label: "Items sold",
                  value: number(d.units),
                  detail: "Products and combos sold",
                  icon: Package,
                  color: "blue",
                },
              ].map((s) => (
                <article className="stat-card" key={s.label}>
                  <div>
                    <span>{s.label}</span>
                    <span className={`stat-icon ${s.color}`}>
                      <s.icon size={18} />
                    </span>
                  </div>
                  <strong>{s.value}</strong>
                  <small>{s.detail}</small>
                </article>
              ))}
            </div>
            <div className="dashboard-charts">
              <section className="panel revenue-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Sales performance</h3>
                    <p>A closer look at your shop’s momentum</p>
                  </div>
                  <div className="segmented">
                    <button
                      className={metric === "revenue" ? "selected" : ""}
                      onClick={() => setMetric("revenue")}
                    >
                      Revenue
                    </button>
                    <button
                      className={metric === "orders" ? "selected" : ""}
                      onClick={() => setMetric("orders")}
                    >
                      Orders
                    </button>
                  </div>
                </div>
                <div className="chart-headline">
                  <strong>
                    {metric === "revenue" ? money(d.revenue) : number(d.orders)}
                  </strong>
                  <span>in selected period</span>
                </div>
                {d.trend.length ? (
                  <div className="chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={d.trend}
                        margin={{ top: 15, right: 10, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="revenueFade"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#0e8f92"
                              stopOpacity={0.2}
                            />
                            <stop
                              offset="95%"
                              stopColor="#0e8f92"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          stroke="var(--border)"
                          strokeDasharray="3 4"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(v) => v.slice(5)}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "var(--muted)", fontSize: 11 }}
                          minTickGap={30}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "var(--muted)", fontSize: 11 }}
                          width={55}
                          tickFormatter={(n) =>
                            n >= 1000 ? `${n / 1000}k` : n
                          }
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: 10,
                          }}
                          formatter={(v) =>
                            metric === "revenue" ? money(v) : number(v)
                          }
                        />
                        <Area
                          isAnimationActive={false}
                          type="monotone"
                          dataKey={metric}
                          stroke="#0e8f92"
                          strokeWidth={3}
                          fill="url(#revenueFade)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty
                    title="Ready for your next chapter"
                    text="Sales activity will appear here as orders are recorded."
                  />
                )}
                <div className="panel-bottom">
                  <span>
                    <i className="legend teal" />
                    {metric === "revenue" ? "Sales revenue" : "Orders placed"}
                  </span>
                  <span>
                    {dates.from} — {dates.to}
                  </span>
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>What’s bringing joy?</h3>
                    <p>Units sold by product category</p>
                  </div>
                  <Package size={17} />
                </div>
                {d.categories.length ? (
                  <>
                    <div className="donut-chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            isAnimationActive={false}
                            data={d.categories}
                            dataKey="quantity"
                            nameKey="name"
                            innerRadius={67}
                            outerRadius={93}
                            paddingAngle={4}
                            stroke="none"
                          >
                            {d.categories.map((c, i) => (
                              <Cell
                                key={c.name}
                                fill={colors[i % colors.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              borderRadius: 10,
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="donut-center">
                        <strong>
                          {number(
                            d.categories.reduce(
                              (s, c) => s + Number(c.quantity),
                              0,
                            ),
                          )}
                        </strong>
                        <small>product units</small>
                      </div>
                    </div>
                    <div className="chart-legend">
                      {d.categories.map((c, i) => (
                        <div key={c.name}>
                          <span>
                            <i
                              className="legend"
                              style={{ background: colors[i % colors.length] }}
                            />
                            {c.name}
                          </span>
                          <b>{number(c.quantity)}</b>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <Empty
                    title="Every toy has a story"
                    text="Category insights appear after your first sale."
                  />
                )}
                <div className="panel-bottom">
                  Combo components count in their own categories.
                </div>
              </section>
            </div>
            <div className="dashboard-charts second">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>Your team in action</h3>
                    <p>Items sold by sales person · selected period</p>
                  </div>
                  <ChartNoAxesCombined size={18} />
                </div>
                {d.people.length ? (
                  <div className="chart compact">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={d.people}
                        layout="vertical"
                        margin={{ left: 0, right: 25, top: 10, bottom: 0 }}
                      >
                        <CartesianGrid
                          horizontal={false}
                          stroke="var(--border)"
                          strokeDasharray="3 4"
                        />
                        <XAxis
                          type="number"
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={100}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "var(--muted)", fontSize: 11 }}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                          }}
                        />
                        <Bar
                          isAnimationActive={false}
                          dataKey="quantity"
                          name="Items sold"
                          fill="#0e8f92"
                          radius={[0, 5, 5, 0]}
                          maxBarSize={24}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty
                    title="A team effort"
                    text="Your sales team’s activity will appear here."
                  />
                )}
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>Today’s shop floor</h3>
                    <p>Orders by sales person · today in Dhaka</p>
                  </div>
                  <span className="badge green">Today</span>
                </div>
                {d.todayPeople.length ? (
                  <div className="today-team">
                    {d.todayPeople.map((p, i) => (
                      <div key={p.name}>
                        <span
                          className="avatar"
                          style={{
                            background: `${colors[i % colors.length]}20`,
                            color: colors[i % colors.length],
                          }}
                        >
                          {p.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <strong>{p.name}</strong>
                          <div className="mini-track">
                            <span
                              style={{
                                width: `${(p.orders / Math.max(...d.todayPeople.map((x) => x.orders))) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                        <b>
                          {number(p.orders)} <small>orders</small>
                        </b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="A fresh start today"
                    text="Today’s orders will show up as your team checks out."
                  />
                )}
              </section>
            </div>
            <div className="finance-strip">
              {[
                ["Sale receipts", d.sale_payments],
                ["Other income", d.other_income],
                ["Purchase payouts", d.purchase_payments],
                ["Expenses", d.expenses],
                ["Gross trading profit", d.gross_profit],
                ["Net operating profit", d.net_operating_profit],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{money(value)}</strong>
                </div>
              ))}
            </div>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Recent orders</h3>
                  <p>The latest little moments of joy</p>
                </div>
                {can("SALES") && (
                  <Link to="/sales/list" className="text-link">
                    View all sales <ArrowRight size={15} />
                  </Link>
                )}
              </div>
              {d.recent.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Customer</th>
                        <th>Channel</th>
                        <th>Sales person</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.recent.map((s) => (
                        <tr key={`${s.channel}:${s.id}`}>
                          <td>
                            <strong>
                              {s.channel === "online" ? "ORD" : "POS"}-{s.id}
                            </strong>
                            <small>{s.created_at.slice(0, 16)}</small>
                          </td>
                          <td>{s.cus_name}</td>
                          <td>
                            <Badge>{s.channel}</Badge>
                          </td>
                          <td>{s.sales_person_name}</td>
                          <td>{money(s.payable)}</td>
                          <td>
                            <Badge>{s.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="Your first sale is the beginning"
                  text="Create a sale and your recent orders will appear here."
                />
              )}
            </section>
            <p className="calculation-note">
              Cash profit uses receipt and payout creation dates. Gross trading
              profit uses sale-time product cost snapshots; net operating profit
              adds other income and deducts expenses. Purchase payouts affect
              cash profit only.
            </p>
          </>
        )
      )}
    </>
  );
}

const { pool } = require("../../config/database");
const { z, HttpError } = require("../../lib/http");
const { round } = require("../../lib/sale-math");
function range(q) {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Dhaka",
  });
  const from = z
    .string()
    .date()
    .parse(q.from || `${today.slice(0, 7)}-01`);
  const to = z
    .string()
    .date()
    .parse(q.to || today);
  if (from > to) throw new HttpError(400, "Start date must be before end date");
  return { from, to };
}
async function query(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}
const dateFilter = "created_at>=? AND created_at<DATE_ADD(?,INTERVAL 1 DAY)";
exports.dashboard = async (q) => {
  const { from, to } = range(q);
  const dates = [from, to];
  const [
    sales,
    cash,
    expenses,
    incomes,
    purchasePayments,
    trend,
    people,
    categories,
    todayPeople,
    recent,
    stockValue,
  ] = await Promise.all([
    query(
      `SELECT COUNT(*) orders,COALESCE(SUM(v.subtotal-s.final_discount+s.delivery_charge),0) revenue,COALESCE(SUM(v.quantity),0) units,COALESCE(SUM(v.subtotal+s.delivery_charge-s.final_discount-sc.cost),0) gross_profit FROM all_sales s JOIN (SELECT channel,sale_id,SUM(quantity*rate) subtotal,SUM(quantity) quantity FROM sale_lines GROUP BY channel,sale_id) v ON BINARY v.channel=BINARY s.channel AND v.sale_id=s.id JOIN (SELECT channel,sale_id,SUM(GREATEST(quantity-returned_quantity,0)*cost_rate) cost FROM sale_components WHERE active=1 GROUP BY channel,sale_id) sc ON BINARY sc.channel=BINARY s.channel AND sc.sale_id=s.id WHERE s.status<>'returned' AND s.${dateFilter}`,
      dates,
    ),
    query(
      `SELECT COALESCE(SUM(amount),0) total FROM (SELECT amount,created_at FROM offline_sale_payments UNION ALL SELECT amount,created_at FROM online_sale_payments) p WHERE ${dateFilter}`,
      dates,
    ),
    query(
      `SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE ${dateFilter}`,
      dates,
    ),
    query(
      `SELECT COALESCE(SUM(amount),0) total FROM incomes WHERE ${dateFilter}`,
      dates,
    ),
    query(
      `SELECT COALESCE(SUM(amount),0) total FROM purchase_payouts WHERE ${dateFilter}`,
      dates,
    ),
    query(
      `SELECT DATE(s.created_at) date,COUNT(*) orders,SUM(l.subtotal-s.final_discount+s.delivery_charge) revenue FROM all_sales s JOIN (SELECT channel,sale_id,SUM(quantity*rate) subtotal FROM sale_lines GROUP BY channel,sale_id) l ON BINARY l.channel=BINARY s.channel AND l.sale_id=s.id WHERE s.status<>'returned' AND s.${dateFilter} GROUP BY DATE(s.created_at) ORDER BY date`,
      dates,
    ),
    query(
      `SELECT COALESCE(e.name,'Unassigned') name,COUNT(*) orders,SUM(l.units) quantity,SUM(l.subtotal-s.final_discount+s.delivery_charge) revenue FROM all_sales s LEFT JOIN employees e ON e.id=s.sales_employee_id JOIN (SELECT channel,sale_id,SUM(quantity) units,SUM(quantity*rate) subtotal FROM sale_lines GROUP BY channel,sale_id) l ON BINARY l.channel=BINARY s.channel AND l.sale_id=s.id WHERE s.status<>'returned' AND s.${dateFilter} GROUP BY s.sales_employee_id,e.name ORDER BY quantity DESC`,
      dates,
    ),
    query(
      `SELECT COALESCE(c.category_name,'Uncategorized') name,SUM(GREATEST(sc.quantity-sc.returned_quantity,0)) quantity FROM sale_components sc JOIN all_sales s ON BINARY s.channel=BINARY sc.channel AND s.id=sc.sale_id LEFT JOIN categories c ON c.id=sc.category_id WHERE sc.active=1 AND s.${dateFilter} GROUP BY sc.category_id,c.category_name ORDER BY quantity DESC`,
      dates,
    ),
    query(
      "SELECT COALESCE(e.name,'Unassigned') name,COUNT(*) orders FROM all_sales s LEFT JOIN employees e ON e.id=s.sales_employee_id WHERE s.status<>'returned' AND DATE(s.created_at)=CURDATE() GROUP BY s.sales_employee_id,e.name ORDER BY orders DESC",
    ),
    query(
      `SELECT s.channel,s.id,s.status,s.created_at,c.cus_name,COALESCE(e.name,'Unassigned') sales_person_name,l.subtotal-s.final_discount+s.delivery_charge payable FROM all_sales s JOIN customers c ON c.id=s.customer_id LEFT JOIN employees e ON e.id=s.sales_employee_id JOIN (SELECT channel,sale_id,SUM(quantity*rate) subtotal FROM sale_lines GROUP BY channel,sale_id) l ON BINARY l.channel=BINARY s.channel AND l.sale_id=s.id WHERE s.${dateFilter} ORDER BY s.created_at DESC,s.id DESC LIMIT 6`,
      dates,
    ),
    query(
      "SELECT COALESCE(SUM(GREATEST(ps.stock,0)*p.purchase_price),0) total FROM product_stock ps JOIN products p ON p.id=ps.product_id",
    ),
  ]);
  const salePayments = cash[0].total;
  const cashIn = round(salePayments + incomes[0].total);
  const cashOut = round(expenses[0].total + purchasePayments[0].total);
  let dailyTrend = trend;
  const dayCount =
    Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (trend.length && dayCount <= 730) {
    const byDate = new Map(trend.map((row) => [row.date, row]));
    dailyTrend = Array.from({ length: dayCount }, (_, index) => {
      const date = new Date(Date.parse(`${from}T00:00:00Z`) + index * 86400000)
        .toISOString()
        .slice(0, 10);
      return byDate.get(date) || { date, orders: 0, revenue: 0 };
    });
  }
  return {
    from,
    to,
    ...sales[0],
    sale_payments: salePayments,
    other_income: incomes[0].total,
    expenses: expenses[0].total,
    purchase_payments: purchasePayments[0].total,
    cash_in: cashIn,
    cash_out: cashOut,
    profit: round(cashIn - cashOut),
    net_operating_profit: round(
      sales[0].gross_profit + incomes[0].total - expenses[0].total,
    ),
    current_stock_value: stockValue[0].total,
    trend: dailyTrend,
    people,
    categories,
    todayPeople,
    recent,
  };
};
const reports = {
  "daily-salesperson": { period: "DATE(s.created_at)", person: true },
  "monthly-salesperson": {
    period: "DATE_FORMAT(s.created_at,'%Y-%m')",
    person: true,
  },
  "daily-product": { period: "DATE(s.created_at)", item: true },
  "salesperson-count": { period: "'Selected period'", person: true },
  "monthly-product-salesperson": {
    period: "DATE_FORMAT(s.created_at,'%Y-%m')",
    person: true,
    item: true,
  },
  "monthly-product": {
    period: "DATE_FORMAT(s.created_at,'%Y-%m')",
    item: true,
  },
};

const optionalReportId = (value) =>
  value == null || value === ""
    ? null
    : z.coerce.number().int().positive().parse(value);

async function salesExplorer(q) {
  const { from, to } = range(q);
  const employeeId = optionalReportId(q.sales_employee_id);
  const categoryId = optionalReportId(q.category_id);
  const paymentMethodId = optionalReportId(q.payment_method_id);
  const channelFilter = q.channel
    ? z.enum(["offline", "online"]).parse(q.channel)
    : null;
  const statusFilter = q.status
    ? z.enum(["paid", "due"]).parse(q.status)
    : null;
  const customerSearch = String(q.customer || "").trim().slice(0, 100);
  let itemType = null;
  let itemId = null;
  if (q.item) {
    const match = /^(product|combo):(\d+)$/.exec(String(q.item));
    if (!match) throw new HttpError(400, "Invalid product filter");
    itemType = match[1];
    itemId = z.coerce.number().int().positive().parse(match[2]);
  }

  const conditions = [
    "s.status<>'returned'",
    `s.${dateFilter}`,
  ];
  const params = [from, to];
  if (employeeId) {
    conditions.push("s.sales_employee_id=?");
    params.push(employeeId);
  }
  if (channelFilter) {
    conditions.push("s.channel=?");
    params.push(channelFilter);
  }
  if (statusFilter) {
    conditions.push("s.status=?");
    params.push(statusFilter);
  }
  if (itemType) {
    conditions.push("l.item_type=?", "l.item_id=?");
    params.push(itemType, itemId);
  }
  if (categoryId) {
    conditions.push(
      "EXISTS(SELECT 1 FROM sale_line_components fsc JOIN products fp ON fp.id=fsc.product_id WHERE BINARY fsc.channel=BINARY l.channel AND fsc.sale_id=l.sale_id AND BINARY fsc.item_type=BINARY l.item_type AND fsc.sale_line_id=l.line_id AND fp.category_id=?)",
    );
    params.push(categoryId);
  }
  if (paymentMethodId) {
    conditions.push(
      "EXISTS(SELECT 1 FROM offline_sale_payments ofp WHERE s.channel='offline' AND ofp.offline_sale_id=s.id AND ofp.payment_method_id=? AND ofp.status='active' UNION ALL SELECT 1 FROM online_sale_payments onp WHERE s.channel='online' AND onp.online_sale_id=s.id AND onp.payment_method_id=? AND onp.status='active')",
    );
    params.push(paymentMethodId, paymentMethodId);
  }
  if (customerSearch) {
    conditions.push("(cu.cus_name LIKE ? OR cu.cus_phone LIKE ?)");
    params.push(`%${customerSearch}%`, `%${customerSearch}%`);
  }

  const where = conditions.join(" AND ");
  const lineCost = `LEFT JOIN (
    SELECT slc.channel,slc.sale_id,slc.item_type,slc.sale_line_id,
      SUM(slc.component_quantity*sc.cost_rate) unit_cost
    FROM sale_line_components slc
    JOIN sale_components sc ON BINARY sc.channel=BINARY slc.channel AND sc.sale_id=slc.sale_id AND sc.product_id=slc.product_id
    GROUP BY slc.channel,slc.sale_id,slc.item_type,slc.sale_line_id
  ) lc ON BINARY lc.channel=BINARY l.channel AND lc.sale_id=l.sale_id AND BINARY lc.item_type=BINARY l.item_type AND lc.sale_line_id=l.line_id`;
  const base = `SELECT s.channel,s.id sale_id,s.created_at,s.status,s.delivery_charge,
    s.sales_employee_id,COALESCE(e.name,'Unassigned') sales_person,
    cu.id customer_id,cu.cus_name customer_name,cu.cus_phone customer_phone,
    l.item_type,l.item_id,l.item_name,l.quantity,l.rate,
    l.quantity*l.rate gross_sales,
    COALESCE(s.final_discount/NULLIF(st.subtotal,0),0)*l.quantity*l.rate allocated_discount,
    l.quantity*l.rate-COALESCE(s.final_discount/NULLIF(st.subtotal,0),0)*l.quantity*l.rate net_sales,
    l.quantity*COALESCE(lc.unit_cost,0) sold_cost
    FROM all_sales s
    JOIN customers cu ON cu.id=s.customer_id
    LEFT JOIN employees e ON e.id=s.sales_employee_id
    JOIN sale_lines l ON BINARY l.channel=BINARY s.channel AND l.sale_id=s.id
    JOIN (SELECT channel,sale_id,SUM(quantity*rate) subtotal FROM sale_lines GROUP BY channel,sale_id) st ON BINARY st.channel=BINARY s.channel AND st.sale_id=s.id
    ${lineCost}
    WHERE ${where}`;

  const baseParams = () => [...params];
  const [lineSummary, orderSummary, daily, people, products, channels, customers, orders, categories, optionRows] =
    await Promise.all([
      query(
        `SELECT COALESCE(SUM(quantity),0) quantity,COALESCE(SUM(gross_sales),0) gross_sales,COALESCE(SUM(allocated_discount),0) allocated_discount,COALESCE(SUM(net_sales),0) net_product_sales,COALESCE(SUM(sold_cost),0) sold_cost FROM (${base}) filtered_lines`,
        baseParams(),
      ),
      query(
        `SELECT COUNT(*) sale_count,COALESCE(SUM(delivery_charge),0) delivery_charge FROM (SELECT channel,sale_id,MAX(delivery_charge) delivery_charge FROM (${base}) filtered_lines GROUP BY channel,sale_id) filtered_orders`,
        baseParams(),
      ),
      query(
        `SELECT DATE(created_at) period,COUNT(DISTINCT CONCAT(channel,':',sale_id)) sale_count,SUM(quantity) quantity,SUM(net_sales) net_sales,SUM(sold_cost) sold_cost FROM (${base}) filtered_lines GROUP BY DATE(created_at) ORDER BY period`,
        baseParams(),
      ),
      query(
        `SELECT sales_person,COUNT(DISTINCT CONCAT(channel,':',sale_id)) sale_count,SUM(quantity) quantity,SUM(net_sales) net_sales,SUM(sold_cost) sold_cost FROM (${base}) filtered_lines GROUP BY sales_employee_id,sales_person ORDER BY net_sales DESC`,
        baseParams(),
      ),
      query(
        `SELECT item_type,item_id,item_name,COUNT(DISTINCT CONCAT(channel,':',sale_id)) sale_count,SUM(quantity) quantity,SUM(gross_sales) gross_sales,SUM(allocated_discount) allocated_discount,SUM(net_sales) net_sales,SUM(sold_cost) sold_cost FROM (${base}) filtered_lines GROUP BY item_type,item_id,item_name ORDER BY net_sales DESC`,
        baseParams(),
      ),
      query(
        `SELECT channel,COUNT(DISTINCT CONCAT(channel,':',sale_id)) sale_count,SUM(quantity) quantity,SUM(net_sales) net_sales,SUM(sold_cost) sold_cost FROM (${base}) filtered_lines GROUP BY channel ORDER BY net_sales DESC`,
        baseParams(),
      ),
      query(
        `SELECT customer_id,customer_name,customer_phone,COUNT(DISTINCT CONCAT(channel,':',sale_id)) sale_count,SUM(quantity) quantity,SUM(net_sales) net_sales FROM (${base}) filtered_lines GROUP BY customer_id,customer_name,customer_phone ORDER BY net_sales DESC LIMIT 100`,
        baseParams(),
      ),
      query(
        `SELECT channel,sale_id,MAX(created_at) created_at,MAX(status) status,MAX(customer_name) customer_name,MAX(customer_phone) customer_phone,MAX(sales_person) sales_person,SUM(quantity) quantity,SUM(net_sales) net_product_sales,MAX(delivery_charge) delivery_charge,SUM(net_sales)+MAX(delivery_charge) payable,SUM(sold_cost) sold_cost FROM (${base}) filtered_lines GROUP BY channel,sale_id ORDER BY created_at DESC,sale_id DESC LIMIT 500`,
        baseParams(),
      ),
      query(
        `SELECT COALESCE(c.category_name,'Uncategorized') category,COUNT(DISTINCT CONCAT(s.channel,':',s.id)) sale_count,SUM(l.quantity*ac.component_quantity) component_quantity,SUM(l.quantity*ac.unit_cost) sold_cost
         FROM all_sales s JOIN customers cu ON cu.id=s.customer_id LEFT JOIN employees e ON e.id=s.sales_employee_id
         JOIN sale_lines l ON BINARY l.channel=BINARY s.channel AND l.sale_id=s.id
         JOIN (
           SELECT slc.channel,slc.sale_id,slc.item_type,slc.sale_line_id,p.category_id,
             SUM(slc.component_quantity) component_quantity,
             SUM(slc.component_quantity*COALESCE(sc.cost_rate,0)) unit_cost
           FROM sale_line_components slc
           JOIN products p ON p.id=slc.product_id
           LEFT JOIN sale_components sc ON BINARY sc.channel=BINARY slc.channel AND sc.sale_id=slc.sale_id AND sc.product_id=slc.product_id
           GROUP BY slc.channel,slc.sale_id,slc.item_type,slc.sale_line_id,p.category_id
         ) ac ON BINARY ac.channel=BINARY l.channel AND ac.sale_id=l.sale_id AND BINARY ac.item_type=BINARY l.item_type AND ac.sale_line_id=l.line_id
         LEFT JOIN categories c ON c.id=ac.category_id
         WHERE ${where}${categoryId ? " AND ac.category_id=?" : ""}
         GROUP BY ac.category_id,c.category_name ORDER BY component_quantity DESC`,
        categoryId ? [...params, categoryId] : baseParams(),
      ),
      Promise.all([
        query("SELECT id,name FROM employees ORDER BY name"),
        query("SELECT id,category_name name FROM categories ORDER BY category_name"),
        query("SELECT id,method name FROM payment_methods ORDER BY method"),
        query("SELECT CONCAT('product:',id) value,product_name name,barcode,'product' item_type FROM products WHERE status='active' UNION ALL SELECT CONCAT('combo:',id),combo_name,barcode,'combo' FROM product_combos ORDER BY name"),
      ]),
    ]);

  const summary = {
    ...lineSummary[0],
    ...orderSummary[0],
  };
  summary.gross_profit = round(
    Number(summary.net_product_sales) +
      Number(summary.delivery_charge) -
      Number(summary.sold_cost),
  );
  return {
    from,
    to,
    summary,
    daily,
    salespeople: people,
    categories,
    products,
    channels,
    customers,
    orders,
    options: {
      employees: optionRows[0],
      categories: optionRows[1],
      payment_methods: optionRows[2],
      items: optionRows[3],
    },
  };
}

exports.report = async (type, q) => {
  if (type === "sales-explorer") return salesExplorer(q);
  const config = reports[type];
  if (!config) throw new HttpError(404, "Unknown report");
  const { from, to } = range(q);
  const select = [`${config.period} period`];
  const group = ["period"];
  if (config.person) {
    select.push("COALESCE(e.name,'Unassigned') sales_person");
    group.push("s.sales_employee_id", "e.name");
  }
  if (config.item) {
    select.push("l.item_type", "l.item_id", "l.item_name");
    group.push("l.item_type", "l.item_id", "l.item_name");
  }
  const rows = await query(
    `SELECT ${select.join(",")},COUNT(DISTINCT CONCAT(s.channel,':',s.id)) sale_count,SUM(l.quantity) quantity,SUM(l.quantity*l.rate) gross_sales,SUM(COALESCE(s.final_discount/NULLIF(st.subtotal,0),0)*l.quantity*l.rate) allocated_discount,SUM(l.quantity*l.rate-COALESCE(s.final_discount/NULLIF(st.subtotal,0),0)*l.quantity*l.rate) net_sales FROM all_sales s JOIN sale_lines l ON BINARY l.channel=BINARY s.channel AND l.sale_id=s.id JOIN (SELECT channel,sale_id,SUM(quantity*rate) subtotal FROM sale_lines GROUP BY channel,sale_id) st ON BINARY st.channel=BINARY s.channel AND st.sale_id=s.id LEFT JOIN employees e ON e.id=s.sales_employee_id WHERE s.status<>'returned' AND s.${dateFilter} GROUP BY ${group.join(",")} ORDER BY period DESC,net_sales DESC`,
    [from, to],
  );
  return { from, to, rows };
};

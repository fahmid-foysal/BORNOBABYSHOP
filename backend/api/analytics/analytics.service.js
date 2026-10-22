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
  ] = await Promise.all([
    query(
      `SELECT COUNT(*) orders,COALESCE(SUM(v.subtotal-s.final_discount+s.delivery_charge),0) revenue,COALESCE(SUM(v.quantity),0) units,COALESCE(SUM(v.subtotal-s.final_discount-sc.cost),0) gross_profit FROM all_sales s JOIN (SELECT channel,sale_id,SUM(quantity*rate) subtotal,SUM(quantity) quantity FROM sale_lines GROUP BY channel,sale_id) v ON v.channel=s.channel AND v.sale_id=s.id JOIN (SELECT channel,sale_id,SUM(quantity*cost_rate) cost FROM sale_components GROUP BY channel,sale_id) sc ON sc.channel=s.channel AND sc.sale_id=s.id WHERE s.status<>'returned' AND s.${dateFilter}`,
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
      `SELECT DATE(s.created_at) date,COUNT(*) orders,SUM(l.subtotal-s.final_discount+s.delivery_charge) revenue FROM all_sales s JOIN (SELECT channel,sale_id,SUM(quantity*rate) subtotal FROM sale_lines GROUP BY channel,sale_id) l ON l.channel=s.channel AND l.sale_id=s.id WHERE s.status<>'returned' AND s.${dateFilter} GROUP BY DATE(s.created_at) ORDER BY date`,
      dates,
    ),
    query(
      `SELECT COALESCE(e.name,'Unassigned') name,COUNT(*) orders,SUM(l.units) quantity,SUM(l.subtotal-s.final_discount+s.delivery_charge) revenue FROM all_sales s LEFT JOIN employees e ON e.id=s.sales_employee_id JOIN (SELECT channel,sale_id,SUM(quantity) units,SUM(quantity*rate) subtotal FROM sale_lines GROUP BY channel,sale_id) l ON l.channel=s.channel AND l.sale_id=s.id WHERE s.status<>'returned' AND s.${dateFilter} GROUP BY s.sales_employee_id,e.name ORDER BY quantity DESC`,
      dates,
    ),
    query(
      `SELECT COALESCE(c.category_name,'Uncategorized') name,SUM(sc.quantity) quantity FROM sale_components sc JOIN all_sales s ON s.channel=sc.channel AND s.id=sc.sale_id LEFT JOIN categories c ON c.id=sc.category_id WHERE sc.active=1 AND s.${dateFilter} GROUP BY sc.category_id,c.category_name ORDER BY quantity DESC`,
      dates,
    ),
    query(
      "SELECT COALESCE(e.name,'Unassigned') name,COUNT(*) orders FROM all_sales s LEFT JOIN employees e ON e.id=s.sales_employee_id WHERE s.status<>'returned' AND DATE(s.created_at)=CURDATE() GROUP BY s.sales_employee_id,e.name ORDER BY orders DESC",
    ),
    query(
      `SELECT s.channel,s.id,s.status,s.created_at,c.cus_name,COALESCE(e.name,'Unassigned') sales_person_name,l.subtotal-s.final_discount+s.delivery_charge payable FROM all_sales s JOIN customers c ON c.id=s.customer_id LEFT JOIN employees e ON e.id=s.sales_employee_id JOIN (SELECT channel,sale_id,SUM(quantity*rate) subtotal FROM sale_lines GROUP BY channel,sale_id) l ON l.channel=s.channel AND l.sale_id=s.id WHERE s.${dateFilter} ORDER BY s.created_at DESC,s.id DESC LIMIT 6`,
      dates,
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
exports.report = async (type, q) => {
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
    `SELECT ${select.join(",")},COUNT(DISTINCT CONCAT(s.channel,':',s.id)) sale_count,SUM(l.quantity) quantity,SUM(l.quantity*l.rate) gross_sales,SUM(COALESCE(s.final_discount/NULLIF(st.subtotal,0),0)*l.quantity*l.rate) allocated_discount,SUM(l.quantity*l.rate-COALESCE(s.final_discount/NULLIF(st.subtotal,0),0)*l.quantity*l.rate) net_sales FROM all_sales s JOIN sale_lines l ON l.channel=s.channel AND l.sale_id=s.id JOIN (SELECT channel,sale_id,SUM(quantity*rate) subtotal FROM sale_lines GROUP BY channel,sale_id) st ON st.channel=s.channel AND st.sale_id=s.id LEFT JOIN employees e ON e.id=s.sales_employee_id WHERE s.status<>'returned' AND s.${dateFilter} GROUP BY ${group.join(",")} ORDER BY period DESC,net_sales DESC`,
    [from, to],
  );
  return { from, to, rows };
};

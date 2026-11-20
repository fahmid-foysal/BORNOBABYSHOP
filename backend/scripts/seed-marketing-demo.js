const { pool } = require("../config/database");

const demoRows = [
  { daysAgo: 0, amountUsd: 12.5, rate: 130 },
  { daysAgo: 1, amountUsd: 18, rate: 130 },
  { daysAgo: 3, amountUsd: 9.75, rate: 129.5 },
  { daysAgo: 5, amountUsd: 22, rate: 130 },
  { daysAgo: 7, amountUsd: 15.25, rate: 131 },
  { daysAgo: 9, amountUsd: 27.5, rate: 130 },
  { daysAgo: 12, amountUsd: 11, rate: 129.75 },
  { daysAgo: 15, amountUsd: 20, rate: 130 },
];

async function main() {
  const db = await pool.getConnection();
  try {
    const [tables] = await db.query(
      "SELECT COUNT(*) present FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='marketing_expenses'",
    );
    if (!tables[0].present)
      throw new Error("Migration 008 must be applied before seeding marketing expenses");

    const [users] = await db.query(
      "SELECT id FROM users ORDER BY role='admin' DESC,id LIMIT 1",
    );
    if (!users.length) throw new Error("Create a user before seeding demo data");

    const [salePairs] = await db.query(
      `SELECT p.barcode,p.product_name,s.sales_employee_id,e.name sales_person,
         MAX(s.created_at) last_sale
       FROM online_sales s
       JOIN (SELECT DISTINCT sale_id,product_id FROM sale_line_components WHERE channel='online') sp ON sp.sale_id=s.id
       JOIN products p ON p.id=sp.product_id
       JOIN employees e ON e.id=s.sales_employee_id
       WHERE s.status<>'returned' AND p.barcode IS NOT NULL
       GROUP BY p.barcode,p.product_name,s.sales_employee_id,e.name
       ORDER BY last_sale DESC LIMIT 8`,
    );
    let pairs = salePairs;
    if (!pairs.length) {
      const [fallback] = await db.query(
        `SELECT p.barcode,p.product_name,e.id sales_employee_id,e.name sales_person
         FROM products p CROSS JOIN employees e
         WHERE p.status='active' AND p.barcode IS NOT NULL
         ORDER BY p.id,e.id LIMIT 8`,
      );
      pairs = fallback;
    }
    if (!pairs.length)
      throw new Error("Create at least one active product and sales person before seeding demo data");

    await db.beginTransaction();
    let inserted = 0;
    let skipped = 0;
    for (const [index, demo] of demoRows.entries()) {
      const pair = pairs[index % pairs.length];
      const [existing] = await db.query(
        `SELECT id FROM marketing_expenses
         WHERE barcode=? AND sales_person_id=? AND amount_usd=? AND conversion_rate=?
           AND created_at=TIMESTAMP(DATE_SUB(CURDATE(),INTERVAL ? DAY),'10:00:00')
         LIMIT 1`,
        [pair.barcode, pair.sales_employee_id, demo.amountUsd, demo.rate, demo.daysAgo],
      );
      if (existing.length) {
        skipped += 1;
        continue;
      }
      await db.query(
        `INSERT INTO marketing_expenses
          (barcode,sales_person_id,amount_usd,conversion_rate,created_at,created_by)
         VALUES (?,?,?,?,TIMESTAMP(DATE_SUB(CURDATE(),INTERVAL ? DAY),'10:00:00'),?)`,
        [
          pair.barcode,
          pair.sales_employee_id,
          demo.amountUsd,
          demo.rate,
          demo.daysAgo,
          users[0].id,
        ],
      );
      inserted += 1;
    }
    await db.commit();

    const [summary] = await db.query(
      `SELECT COUNT(*) records,
        ROUND(SUM(amount_usd),2) total_usd,
        ROUND(SUM(amount_usd*conversion_rate),2) total_bdt,
        COUNT(DISTINCT barcode) products,
        COUNT(DISTINCT sales_person_id) sales_people
       FROM marketing_expenses`,
    );
    console.log(JSON.stringify({ inserted, skipped, ...summary[0] }, null, 2));
  } catch (error) {
    await db.rollback().catch(() => {});
    throw error;
  } finally {
    db.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

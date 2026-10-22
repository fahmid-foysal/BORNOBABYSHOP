require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mysql = require("mysql2/promise");
const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 4406),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  supportBigNumbers: true,
  bigNumberStrings: true,
  dateStrings: true,
  charset: "utf8mb4",
  timezone: "+06:00",
});
pool.on("connection", (connection) =>
  connection.query("SET time_zone = '+06:00'"),
);
async function transaction(work) {
  const db = await pool.getConnection();
  try {
    await db.query("SET time_zone = '+06:00'");
    await db.beginTransaction();
    await db.query("SELECT id FROM erp_write_lock WHERE id=1 FOR UPDATE");
    const value = await work(db);
    await db.commit();
    return value;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
module.exports = { pool, transaction };

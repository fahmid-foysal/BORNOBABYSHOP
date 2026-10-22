const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pool } = require("../config/database");
async function run() {
  const db = await pool.getConnection();
  try {
    const [[lock]] = await db.query(
      "SELECT GET_LOCK('bornobabyshop_migrations',30) acquired",
    );
    if (!lock.acquired) throw new Error("Migration lock is busy");
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
    );
    const dir = path.join(__dirname, "../../migrations");
    for (const name of fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      const sql = fs.readFileSync(path.join(dir, name), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      const [done] = await db.query(
        "SELECT * FROM schema_migrations WHERE name=?",
        [name],
      );
      if (done.length) {
        if (done[0].checksum !== checksum)
          throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      if (name === "001.sql") {
        const [tables] = await db.query("SHOW TABLES LIKE 'users'");
        if (tables.length) {
          const expected = [...sql.matchAll(/CREATE TABLE (\w+)/g)].map(
            (m) => m[1],
          );
          for (const table of expected)
            await db.query("SELECT 1 FROM ?? LIMIT 0", [table]);
          console.log("Recognized existing 001 schema");
          await db.query(
            "INSERT INTO schema_migrations(name,checksum) VALUES (?,?)",
            [name, checksum],
          );
          continue;
        }
      }
      // MySQL DDL implicitly commits. Back up production before applying migrations.
      for (const statement of sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await db.query(statement);
      await db.query(
        "INSERT INTO schema_migrations(name,checksum) VALUES (?,?)",
        [name, checksum],
      );
      console.log(`Applied ${name}`);
    }
  } finally {
    await db.query("SELECT RELEASE_LOCK('bornobabyshop_migrations')");
    db.release();
    await pool.end();
  }
}
run().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});

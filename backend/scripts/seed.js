const bcrypt = require("bcryptjs");
const { pool, transaction } = require("../config/database");
async function run() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12)
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) in backend/.env",
    );
  await transaction(async (db) => {
    const [users] = await db.query("SELECT id FROM users WHERE email=?", [
      email,
    ]);
    if (!users.length)
      await db.query(
        "INSERT INTO users(name,email,password,role) VALUES (?,?,?,'admin')",
        [
          process.env.ADMIN_NAME || "Shop administrator",
          email,
          await bcrypt.hash(password, 12),
        ],
      );
    for (const method of ["Cash", "bKash", "Nagad", "Bank", "Steadfast"])
      await db.query(
        "INSERT INTO payment_methods(method) SELECT ? WHERE NOT EXISTS(SELECT 1 FROM payment_methods WHERE method=?)",
        [method, method],
      );
  });
  console.log(
    "Administrator and payment methods ready. Existing passwords were preserved.",
  );
}
run()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

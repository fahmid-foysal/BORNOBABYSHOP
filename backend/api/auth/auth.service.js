const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool, transaction } = require("../../config/database");
const {
  z,
  id,
  HttpError,
  insert,
  one,
  pagination,
  pageResult,
} = require("../../lib/http");
const modules = require("../../lib/modules");
const userSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128).optional(),
  permissions: z.array(z.enum(modules)).default([]),
});
exports.login = async (body) => {
  const b = z
    .object({ email: z.string().email(), password: z.string().min(1) })
    .parse(body);
  const [rows] = await pool.query("SELECT * FROM users WHERE email=?", [
    b.email,
  ]);
  if (!rows.length || !(await bcrypt.compare(b.password, rows[0].password)))
    throw new HttpError(401, "Email or password is incorrect");
  const user = rows[0];
  delete user.password;
  const [permissions] = await pool.query(
    "SELECT module_name FROM user_permissions WHERE user_id=?",
    [user.id],
  );
  user.permissions =
    user.role === "admin" ? modules : permissions.map((p) => p.module_name);
  return {
    token: jwt.sign(
      { user: { id: user.id }, version: user.token_version },
      process.env.JWT_SECRET,
      { expiresIn: "12h" },
    ),
    user,
  };
};
exports.list = async (q) => {
  const p = pagination(q);
  const where = q.search ? " WHERE name LIKE ? OR email LIKE ?" : "";
  const params = q.search
    ? [
        `%${String(q.search).slice(0, 255)}%`,
        `%${String(q.search).slice(0, 255)}%`,
      ]
    : [];
  const [rows] = await pool.query(
    `SELECT id,name,email,role,created_at FROM users${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, p.limit, p.offset],
  );
  for (const u of rows) {
    const [ps] = await pool.query(
      "SELECT module_name FROM user_permissions WHERE user_id=?",
      [u.id],
    );
    u.permissions = ps.map((p) => p.module_name);
  }
  const [count] = await pool.query(
    `SELECT COUNT(*) total FROM users${where}`,
    params,
  );
  return pageResult(rows, count[0].total, p);
};
exports.save = async (raw, userId) => {
  const b = userSchema.parse(raw);
  if (!userId && !b.password) throw new HttpError(400, "Password is required");
  return transaction(async (db) => {
    const values = { name: b.name, email: b.email };
    if (b.password) values.password = await bcrypt.hash(b.password, 12);
    let key;
    if (userId) {
      key = id.parse(userId);
      const existing = await one(
        db,
        "SELECT role FROM users WHERE id=? FOR UPDATE",
        [key],
      );
      if (existing.role === "admin")
        throw new HttpError(
          400,
          "Administrator accounts are managed by the seed command",
        );
      await db.query(
        "UPDATE users SET ?,token_version=token_version+1 WHERE id=?",
        [values, key],
      );
    } else key = await insert(db, "users", { ...values, role: "user" });
    await db.query("DELETE FROM user_permissions WHERE user_id=?", [key]);
    for (const module_name of new Set(b.permissions))
      await insert(db, "user_permissions", { user_id: key, module_name });
    return { id: key };
  });
};
exports.password = async (userId, body) => {
  const password = z.string().min(8).max(128).parse(body.password);
  await one(pool, "SELECT id FROM users WHERE id=?", [id.parse(userId)]);
  await pool.query(
    "UPDATE users SET password=?,token_version=token_version+1 WHERE id=?",
    [await bcrypt.hash(password, 12), userId],
  );
  return { message: "Password changed" };
};

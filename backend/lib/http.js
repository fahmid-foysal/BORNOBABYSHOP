const { z } = require("zod");
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const action = (fn) => async (req, res, next) => {
  try {
    const data = await fn(req, res);
    if (!res.headersSent) res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
const id = z.coerce.number().int().positive().safe();
const amount = z.coerce
  .number()
  .finite()
  .min(0)
  .max(999999999999)
  .multipleOf(0.01);
const positive = z.coerce
  .number()
  .finite()
  .positive()
  .max(999999999)
  .multipleOf(0.001);
function pagination(q) {
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(1000000)
    .default(1)
    .parse(q.page);
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .parse(q.limit);
  return { page, limit, offset: (page - 1) * limit };
}
function pageResult(data, total, p) {
  return {
    rows: data,
    total: Number(total),
    page: p.page,
    pages: Math.ceil(total / p.limit),
    limit: p.limit,
  };
}
async function one(db, sql, params = []) {
  const [rows] = await db.query(sql, params);
  if (!rows.length) throw new HttpError(404, "Record not found");
  return rows[0];
}
async function insert(db, table, values) {
  const [result] = await db.query("INSERT INTO ?? SET ?", [table, values]);
  return result.insertId;
}
module.exports = {
  z,
  HttpError,
  action,
  id,
  amount,
  positive,
  pagination,
  pageResult,
  one,
  insert,
};

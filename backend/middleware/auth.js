const jwt = require("jsonwebtoken");
const { pool } = require("../config/database");
const { HttpError } = require("../lib/http");
async function checkToken(req, res, next) {
  try {
    const token = req.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new HttpError(401, "Please sign in");
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      throw new HttpError(401, "Session expired. Please sign in again");
    }
    const [users] = await pool.query(
      "SELECT id,name,email,role,token_version FROM users WHERE id=?",
      [decoded.user.id],
    );
    if (!users.length || users[0].token_version !== decoded.version)
      throw new HttpError(401, "Session expired");
    req.user = users[0];
    const [permissions] = await pool.query(
      "SELECT module_name FROM user_permissions WHERE user_id=?",
      [req.user.id],
    );
    req.user.permissions = permissions.map((p) => p.module_name);
    next();
  } catch (e) {
    next(e);
  }
}
const authorize = (moduleName) => (req, res, next) =>
  req.user.role === "admin" || req.user.permissions.includes(moduleName)
    ? next()
    : next(new HttpError(403, "You do not have permission for this module"));
module.exports = { checkToken, checkUser: checkToken, authorize };

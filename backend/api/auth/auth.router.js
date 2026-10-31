const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const c = require("./auth.controller");
const { action } = require("../../lib/http");
const { checkToken, authorize } = require("../../middleware/auth");
router.post(
  "/login",
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }),
  action(c.login),
);
router.post(
  "/bootstrap-admin",
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 5 }),
  action(c.bootstrapAdmin),
);
router.use(checkToken);
router.get("/me", action(c.profile));
router.get("/modules", action(c.modules));
router.use(authorize("USER_MODULE"));
router.get("/users", action(c.list));
router.post("/users", action(c.create));
router.put("/users/:id", action(c.update));
router.put("/users/:id/password", action(c.password));
module.exports = router;

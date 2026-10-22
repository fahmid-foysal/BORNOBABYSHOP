const router = require("express").Router();
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { action, HttpError } = require("../../lib/http");
const { checkToken, authorize } = require("../../middleware/auth");
const c = require("./steadfast.controller");
router.post(
  "/webhooks/steadfast",
  rateLimit({ windowMs: 60000, limit: 300 }),
  (req, res, next) => {
    const expected = process.env.STEADFAST_WEBHOOK_TOKEN;
    const actual = req.get("authorization")?.replace(/^Bearer /, "") || "";
    if (!expected)
      return next(new HttpError(503, "Webhook token is not configured"));
    const a = Buffer.from(actual),
      b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
      return next(new HttpError(401, "Invalid webhook token"));
    next();
  },
  action(c.webhook),
);
router.post(
  "/sales/online/:id/send-steadfast",
  checkToken,
  authorize("SALES"),
  action(c.send),
);
router.post(
  "/sales/online/:id/reconcile-steadfast",
  checkToken,
  authorize("SALES"),
  action(c.reconcile),
);
router.get(
  "/steadfast/payments",
  checkToken,
  authorize("STEADFAST_PAYMENTS"),
  action(c.list),
);
router.post(
  "/steadfast/payments/import",
  checkToken,
  authorize("STEADFAST_PAYMENTS"),
  action(c.importPayment),
);
module.exports = router;

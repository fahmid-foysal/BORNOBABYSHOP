const router = require("express").Router();
const { action } = require("../../lib/http");
const { checkToken, authorize } = require("../../middleware/auth");
const c = require("./sales.controller");
const s = require("./sales.service");
router.use(checkToken, authorize("SALES"));
router.get("/customer", action(c.customer));
router.post("/online/bulk", action(c.bulk));
router.param("channel", (req, res, next, value) => {
  try {
    s.channel(value);
    next();
  } catch (e) {
    next(e);
  }
});
router.get("/:channel", action(c.list));
router.get("/:channel/:id", action(c.detail));
router.post("/:channel", action(c.create));
router.post("/:channel/:id/payments", action(c.payment));
router.post("/:channel/:id/return", action(c.returnSale));
module.exports = router;

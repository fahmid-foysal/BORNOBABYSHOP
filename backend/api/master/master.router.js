const router = require("express").Router();
const { action } = require("../../lib/http");
const { checkToken, authorize } = require("../../middleware/auth");
const s = require("./master.service");
const c = require("./master.controller");
router.use(checkToken);
router.get("/lookups", action(c.lookups));
router.use("/:resource", (req, res, next) => {
  try {
    authorize(s.config(req.params.resource).module)(req, res, next);
  } catch (e) {
    next(e);
  }
});
router.get("/:resource", action(c.list));
router.post("/:resource", action(c.create));
router.put("/:resource/:id", action(c.update));
router.delete("/:resource/:id", action(c.remove));
module.exports = router;

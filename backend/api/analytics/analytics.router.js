const router = require("express").Router();
const { action } = require("../../lib/http");
const { checkToken, authorize } = require("../../middleware/auth");
const c = require("./analytics.controller");
router.use(checkToken, authorize("REPORTS"));
router.get("/dashboard", action(c.dashboard));
router.get("/reports/:type", action(c.report));
module.exports = router;

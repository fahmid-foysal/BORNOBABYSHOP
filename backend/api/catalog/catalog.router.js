const router = require("express").Router();
const { action, HttpError } = require("../../lib/http");
const { checkToken, authorize } = require("../../middleware/auth");
const { upload, verifyImages } = require("../../middleware/upload");
const c = require("./catalog.controller");
router.use(checkToken);
router.use((req, res, next) =>
  req.user.role === "admin" ||
  [
    "PRODUCTS",
    "PRODUCT_COMBOS",
    "SALES",
    "PURCHASES",
    "STOCK_ADJUSTMENTS",
  ].some((m) => req.user.permissions.includes(m))
    ? next()
    : next(new HttpError(403, "Catalog permission required")),
);
router.get("/search", action(c.search));
router.get("/categories", action(c.categories));
router.param("type", (req, res, next, type) =>
  ["products", "combos"].includes(type)
    ? next()
    : next(new HttpError(404, "Unknown catalog type")),
);
router.get("/:type", action(c.list));
router.get("/:type/:id", action(c.detail));
router.use("/:type", (req, res, next) =>
  authorize(req.params.type === "combos" ? "PRODUCT_COMBOS" : "PRODUCTS")(
    req,
    res,
    next,
  ),
);
router.post("/:type", upload.array("images", 10), verifyImages, action(c.save));
router.put(
  "/:type/:id",
  upload.array("images", 10),
  verifyImages,
  action(c.save),
);
router.delete("/:type/:id", action(c.remove));
module.exports = router;

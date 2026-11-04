const router = require("express").Router();
const { action } = require("../../lib/http");
const { checkToken, authorize } = require("../../middleware/auth");
const c = require("./steadfast.controller");
router.post("/webhooks/steadfast", async (req, res) => {
  let data;
  try {
    data = await c.webhook(req);
  } catch (error) {
    console.error("Unable to process Steadfast webhook:", error.message);
    data = {
      status: "success",
      message: "Webhook received successfully",
      processed: false,
      reason: "Event processing failed",
    };
  }
  res.status(200).json({ success: true, data });
});
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
  "/sales/online/:id/refresh-steadfast",
  checkToken,
  authorize("SALES"),
  action(c.refreshStatus),
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

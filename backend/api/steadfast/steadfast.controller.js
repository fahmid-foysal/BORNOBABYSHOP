const s = require("./steadfast.service");
exports.webhook = (req) => s.webhook(req.body);
exports.send = (req) => s.send([req.params.id]);
exports.reconcile = (req) => s.reconcile(req.params.id, req.body);
exports.list = (req) => s.list(req.query);
exports.importPayment = (req) => s.importPayment(req.body.payment_id, req.user);

const s = require("./purchases.service");
exports.list = (req) => s.list(req.query);
exports.detail = (req) => s.detail(req.params.id);
exports.create = (req) => s.save(req.body, null, req.user);
exports.update = (req) => s.save(req.body, req.params.id, req.user);
exports.remove = (req) => s.remove(req.params.id);
exports.payment = (req) => s.payment(req.params.id, req.body, req.user);

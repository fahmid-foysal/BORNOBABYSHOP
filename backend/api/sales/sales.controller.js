const s = require("./sales.service");
exports.list = (req) => s.list(req.params.channel, req.query);
exports.detail = (req) => s.detail(req.params.channel, req.params.id);
exports.create = (req) => s.create(req.params.channel, req.body, req.user);
exports.bulk = (req) => s.bulk(req.body, req.user);
exports.customer = (req) => s.customer(req.query.phone);
exports.payment = (req) =>
  s.addPayment(req.params.channel, req.params.id, req.body, req.user);
exports.returnSale = (req) =>
  s.returnSale(req.params.channel, req.params.id, req.body, req.user);

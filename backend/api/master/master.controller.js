const s = require("./master.service");
exports.list = (req) => s.list(req.params.resource, req.query);
exports.create = (req) => s.save(req.params.resource, req.body, null, req.user);
exports.update = (req) =>
  s.save(req.params.resource, req.body, req.params.id, req.user);
exports.remove = (req) => s.remove(req.params.resource, req.params.id);
exports.lookups = (req) => s.lookups(req.user);

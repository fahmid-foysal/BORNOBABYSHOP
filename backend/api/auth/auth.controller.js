const s = require("./auth.service");
exports.login = (req) => s.login(req.body);
exports.profile = (req) => req.user;
exports.modules = () => require("../../lib/modules");
exports.list = (req) => s.list(req.query);
exports.create = (req) => s.save(req.body);
exports.update = (req) => s.save(req.body, req.params.id);
exports.password = (req) => s.password(req.params.id, req.body);

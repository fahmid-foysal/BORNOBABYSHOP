const s = require("./analytics.service");
exports.dashboard = (req) => s.dashboard(req.query);
exports.report = (req) => s.report(req.params.type, req.query);

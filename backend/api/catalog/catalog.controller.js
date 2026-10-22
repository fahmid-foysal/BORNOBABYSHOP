const s = require("./catalog.service");
const { HttpError } = require("../../lib/http");
const { cleanup } = require("../../middleware/upload");
exports.list = (req) => s.list(req.params.type, req.query);
exports.search = (req) => s.search(req.query);
exports.categories = () => s.categories();
exports.detail = (req) => s.detail(req.params.type, req.params.id);
exports.save = async (req) => {
  let body = req.body;
  try {
    if (body.data) body = JSON.parse(body.data);
  } catch {
    await cleanup(req.files);
    throw new HttpError(400, "Invalid product form data");
  }
  return s.save(req.params.type, body, req.params.id, req.files);
};
exports.remove = (req) => s.remove(req.params.type, req.params.id);

const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const directory = path.join(__dirname, "../uploads");
fs.mkdirSync(directory, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: directory,
    filename: (req, file, cb) =>
      cb(
        null,
        `${crypto.randomUUID()}${{ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }[file.mimetype]}`,
      ),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) =>
    cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});
async function verifyImages(req, res, next) {
  try {
    for (const file of req.files || []) {
      const handle = await fs.promises.open(file.path, "r");
      const bytes = Buffer.alloc(12);
      await handle.read(bytes, 0, 12, 0);
      await handle.close();
      const valid =
        file.mimetype === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : file.mimetype === "image/png"
            ? bytes
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : bytes.toString("ascii", 0, 4) === "RIFF" &&
              bytes.toString("ascii", 8, 12) === "WEBP";
      if (!valid)
        throw Object.assign(new Error("Invalid image contents"), {
          status: 400,
        });
    }
    next();
  } catch (e) {
    await cleanup(req.files);
    next(e);
  }
}
async function cleanup(files) {
  await Promise.all(
    (files || []).map((f) => fs.promises.unlink(f.path).catch(() => {})),
  );
}
module.exports = { upload, verifyImages, cleanup };

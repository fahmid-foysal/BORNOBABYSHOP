require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const { pool } = require("./config/database");
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
  throw new Error("JWT_SECRET must contain at least 32 characters");
const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY)
  app.set("trust proxy", Number(process.env.TRUST_PROXY));
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "img-src": ["'self'", "data:", "blob:"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "connect-src": [
          "'self'",
          ...(process.env.CORS_ORIGINS || "").split(",").filter(Boolean),
        ],
      },
    },
  }),
);
const origins = (process.env.CORS_ORIGINS || "http://localhost:5173").split(
  ",",
);
app.use(
  cors((req, done) =>
    done(null, {
      origin: (origin, cb) => {
        const sameOrigin = origin === `${req.protocol}://${req.get("host")}`;
        cb(
          origin && !sameOrigin && !origins.includes(origin)
            ? Object.assign(new Error("Origin not allowed"), { status: 403 })
            : null,
          true,
        );
      },
    }),
  ),
);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), { dotfiles: "deny" }),
);
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", database: "unavailable" });
  }
});
app.use("/api/auth", require("./api/auth/auth.router"));
app.use("/api/master", require("./api/master/master.router"));
app.use("/api/catalog", require("./api/catalog/catalog.router"));
app.use("/api/purchases", require("./api/purchases/purchases.router"));
app.use("/api/sales", require("./api/sales/sales.router"));
app.use("/api", require("./api/steadfast/steadfast.router"));
app.use("/api/analytics", require("./api/analytics/analytics.router"));
app.use("/api", (req, res) =>
  res.status(404).json({ success: false, message: "API route not found" }),
);
app.use(express.static(path.join(__dirname, "dist")));
app.get("*", (req, res, next) =>
  res.sendFile(path.join(__dirname, "dist/index.html"), (err) =>
    err
      ? next(
          Object.assign(
            new Error("Frontend build missing. Run npm run build in frontend."),
            { status: 404 },
          ),
        )
      : undefined,
  ),
);
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  let status = err.status || 500;
  let message = err.message;
  if (err.name === "ZodError") {
    status = 400;
    message = err.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
  }
  if (err.code === "ER_DUP_ENTRY") {
    status = 409;
    message = "A record with this unique value already exists";
  }
  if (["ER_ROW_IS_REFERENCED_2", "ER_NO_REFERENCED_ROW_2"].includes(err.code)) {
    status = 409;
    message =
      "This record is referenced elsewhere, or a selected related record no longer exists";
  }
  if (err.name === "MulterError") {
    status = 400;
  }
  if (status >= 500) {
    console.error(err);
    message =
      "Unable to complete the request. Check the server configuration and try again.";
  }
  res.status(status).json({ success: false, message });
});
if (require.main === module)
  app.listen(process.env.PORT || 3000, () =>
    console.log(
      `BornoBabyShop running on http://localhost:${process.env.PORT || 3000}`,
    ),
  );
module.exports = app;

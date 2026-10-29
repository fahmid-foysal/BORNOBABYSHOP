require("dotenv").config({
  path: require("path").join(__dirname, ".env"),
});

const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const { pool } = require("./config/database");

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must contain at least 32 characters");
}

const app = express();

app.disable("x-powered-by");

// Hostinger / Cloudflare reverse proxy.
// Trust only the first proxy hop when enabled.
if (process.env.TRUST_PROXY) {
  const trustProxy = Number(process.env.TRUST_PROXY);

  if (!Number.isInteger(trustProxy) || trustProxy < 0) {
    throw new Error("TRUST_PROXY must be a non-negative integer");
  }

  app.set("trust proxy", trustProxy);
}

const frontendDir = path.join(__dirname, "dist");
const frontendIndex = path.join(frontendDir, "index.html");

const allowedOrigins = new Set(
  [
    "https://erp.bornobabyshop.com",
    "http://localhost:5173",
    ...(process.env.CORS_ORIGINS || "").split(","),
  ]
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
);

// Normalize an Origin header into a valid origin string.
function normalizeOrigin(value) {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

// CORS: permit configured origins and requests without Origin headers.
// We deliberately do not infer allowed origins from Host or
// X-Forwarded-* headers, which may be attacker-controlled.
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      const normalized = normalizeOrigin(origin);

      if (normalized && allowedOrigins.has(normalized)) {
        return callback(null, true);
      }

      return callback(
        Object.assign(new Error("Origin not allowed"), {
          status: 403,
        }),
      );
    },
  }),
);

// Security headers.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:", "blob:"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "connect-src": [
          "'self'",
          ...allowedOrigins,
        ],
      },
    },
  }),
);

// Request parsing.
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false }));

// Uploaded files.
// NOTE: On managed hosting, ensure uploads are stored persistently.
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    dotfiles: "deny",
    index: false,
  }),
);

// Health check.
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    console.error("Health check database error:", error);

    res.status(503).json({
      status: "degraded",
      database: "unavailable",
    });
  }
});

// API routes — unchanged.
app.use("/api/auth", require("./api/auth/auth.router"));
app.use("/api/master", require("./api/master/master.router"));
app.use("/api/catalog", require("./api/catalog/catalog.router"));
app.use("/api/purchases", require("./api/purchases/purchases.router"));
app.use("/api/sales", require("./api/sales/sales.router"));
app.use("/api", require("./api/steadfast/steadfast.router"));
app.use("/api/analytics", require("./api/analytics/analytics.router"));

// Return JSON for unknown API routes.
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

// Serve the compiled React application.
app.use(
  express.static(frontendDir, {
    index: false,
    dotfiles: "deny",
  }),
);

// React Router SPA fallback.
// Only return index.html for browser page navigation.
// Missing JS/CSS/assets must return 404 instead of HTML.
app.get("*", (req, res, next) => {
  const acceptsHtml = req.accepts("html");

  const hasFileExtension = path.extname(req.path) !== "";

  if (!acceptsHtml || hasFileExtension) {
    return res.status(404).json({
      success: false,
      message: "Resource not found",
    });
  }

  res.sendFile(frontendIndex, (error) => {
    if (error) {
      next(
        Object.assign(
          new Error(
            "Frontend build missing. Run npm run build in frontend.",
          ),
          { status: 404 },
        ),
      );
    }
  });
});

// Centralized error handler.
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  let status = err.status || 500;
  let message = err.message;

  if (err.name === "ZodError") {
    status = 400;
    message = err.issues
      .map((issue) => {
        return `${issue.path.join(".")}: ${issue.message}`;
      })
      .join("; ");
  }

  if (err.code === "ER_DUP_ENTRY") {
    status = 409;
    message = "A record with this unique value already exists";
  }

  if (
    ["ER_ROW_IS_REFERENCED_2", "ER_NO_REFERENCED_ROW_2"].includes(
      err.code,
    )
  ) {
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

  res.status(status).json({
    success: false,
    message,
  });
});

// Start server.
if (require.main === module) {
  const port = process.env.PORT || 3000;

  app.listen(port, () => {
    console.log(`BornoBabyShop running on port ${port}`);
  });
}

module.exports = app;
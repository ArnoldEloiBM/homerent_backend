import "express-async-errors";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import path from "path";
import { env } from "./config/env";
import authRoutes from "./routes/authRoutes";
import applicationRoutes from "./routes/applicationRoutes";
import propertyRoutes from "./routes/propertyRoutes";
import rentalRoutes from "./routes/rentalRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import messageRoutes from "./routes/messageRoutes";
import uploadRoutes from "./routes/uploadRoutes";
import userRoutes from "./routes/userRoutes";
import { errorHandler, notFound } from "./middleware/errorHandler";

const app = express();
const swaggerPath = path.join(__dirname, "../docs/swagger.yaml");
const swaggerDocument = YAML.load(swaggerPath);
/** Repo root `frontend/` — sibling of `backend/` (works locally and on Render full-repo clone). */
const frontendRoot = path.join(__dirname, "..", "..", "frontend");
const localhostOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const allowedOrigins = new Set(env.clientUrls);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.tailwindcss.com"
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: ["'self'"]
      }
    }
  })
);
app.use(
  cors({
    origin(origin, callback) {
      // Allow server-to-server/curl requests without Origin.
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin) || localhostOrigin.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true
  })
);
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use("/auth", authRoutes);
app.use("/applications", applicationRoutes);
app.use("/properties", propertyRoutes);
app.use("/rentals", rentalRoutes);
app.use("/payments", paymentRoutes);
app.use("/messages", messageRoutes);
app.use("/upload", uploadRoutes);
app.use("/users", userRoutes);

/** Static HTML/CSS/JS: same process + same origin as the API on Render (include this origin in CLIENT_URL). */
for (const base of ["/admin", "/landlord", "/tenant", "/HomeRent"] as const) {
  app.get(base, (_req, res) => res.redirect(302, `${base}/`));
}
app.use(
  express.static(frontendRoot, {
    index: "index.html",
    extensions: ["html"]
  })
);

app.use(notFound);
app.use(errorHandler);

export default app;

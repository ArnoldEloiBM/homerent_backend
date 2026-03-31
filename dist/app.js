"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("express-async-errors");
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const yamljs_1 = __importDefault(require("yamljs"));
const path_1 = __importDefault(require("path"));
const env_1 = require("./config/env");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const applicationRoutes_1 = __importDefault(require("./routes/applicationRoutes"));
const propertyRoutes_1 = __importDefault(require("./routes/propertyRoutes"));
const rentalRoutes_1 = __importDefault(require("./routes/rentalRoutes"));
const paymentRoutes_1 = __importDefault(require("./routes/paymentRoutes"));
const messageRoutes_1 = __importDefault(require("./routes/messageRoutes"));
const uploadRoutes_1 = __importDefault(require("./routes/uploadRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const errorHandler_1 = require("./middleware/errorHandler");
const app = (0, express_1.default)();
const swaggerPath = path_1.default.join(__dirname, "../docs/swagger.yaml");
const swaggerDocument = yamljs_1.default.load(swaggerPath);
/** Repo root `frontend/` — sibling of `backend/` (works locally and on Render full-repo clone). */
const frontendRoot = path_1.default.join(__dirname, "..", "..", "frontend");
const localhostOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const allowedOrigins = new Set(env_1.env.clientUrls);
app.use((0, helmet_1.default)({
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
}));
app.use((0, cors_1.default)({
    origin(origin, callback) {
        // Allow server-to-server/curl requests without Origin.
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.has(origin) || localhostOrigin.test(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true
}));
app.use(express_1.default.json());
app.use((0, morgan_1.default)("dev"));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerDocument));
app.use("/auth", authRoutes_1.default);
app.use("/applications", applicationRoutes_1.default);
app.use("/properties", propertyRoutes_1.default);
app.use("/rentals", rentalRoutes_1.default);
app.use("/payments", paymentRoutes_1.default);
app.use("/messages", messageRoutes_1.default);
app.use("/upload", uploadRoutes_1.default);
app.use("/users", userRoutes_1.default);
/** Static HTML/CSS/JS: same process + same origin as the API on Render (include this origin in CLIENT_URL). */
for (const base of ["/admin", "/landlord", "/tenant", "/HomeRent"]) {
    app.get(base, (_req, res) => res.redirect(302, `${base}/`));
}
app.use(express_1.default.static(frontendRoot, {
    index: "index.html",
    extensions: ["html"]
}));
app.use(errorHandler_1.notFound);
app.use(errorHandler_1.errorHandler);
exports.default = app;

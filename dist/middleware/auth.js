"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.optionalAuth = optionalAuth;
exports.requireRole = requireRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../config/db");
const env_1 = require("../config/env");
const http_1 = require("../utils/http");
async function requireAuth(req, _res, next) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
        throw new http_1.HttpError(401, "Unauthorized");
    }
    const token = auth.slice(7);
    const decoded = jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
    const row = await db_1.db.query("SELECT is_suspended FROM users WHERE id = $1", [decoded.id]);
    if (!row.rowCount)
        throw new http_1.HttpError(401, "Unauthorized");
    if (row.rows[0].is_suspended)
        throw new http_1.HttpError(403, "Your account has been suspended");
    req.user = decoded;
    next();
}
/** Sets `req.user` when a valid Bearer token is present; otherwise continues anonymously. */
async function optionalAuth(req, _res, next) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
        next();
        return;
    }
    try {
        const token = auth.slice(7);
        const decoded = jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
        const row = await db_1.db.query("SELECT is_suspended FROM users WHERE id = $1", [decoded.id]);
        if (!row.rowCount)
            throw new http_1.HttpError(401, "Unauthorized");
        if (row.rows[0].is_suspended)
            throw new http_1.HttpError(403, "Your account has been suspended");
        req.user = decoded;
    }
    catch (e) {
        if (e instanceof http_1.HttpError)
            throw e;
        /* invalid or expired token: list as anonymous */
    }
    next();
}
function requireRole(...roles) {
    return (req, _res, next) => {
        if (!req.user) {
            throw new http_1.HttpError(401, "Unauthorized");
        }
        if (!roles.includes(req.user.role)) {
            throw new http_1.HttpError(403, "Forbidden");
        }
        next();
    };
}

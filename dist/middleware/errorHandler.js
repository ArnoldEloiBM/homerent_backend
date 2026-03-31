"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFound = notFound;
exports.errorHandler = errorHandler;
const http_1 = require("../utils/http");
const zod_1 = require("zod");
function notFound(_req, _res, next) {
    next(new http_1.HttpError(404, "Route not found"));
}
function errorHandler(err, _req, res, _next) {
    if (err instanceof zod_1.ZodError) {
        res.status(400).json({ message: "Validation failed", issues: err.flatten() });
        return;
    }
    if (err instanceof http_1.HttpError) {
        res.status(err.statusCode).json({ message: err.message });
        return;
    }
    console.error("[HomeRent]", err);
    res.status(500).json({ message: "Internal server error" });
}

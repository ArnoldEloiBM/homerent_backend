"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listUsers = listUsers;
exports.suspendUser = suspendUser;
exports.unsuspendUser = unsuspendUser;
const db_1 = require("../config/db");
const http_1 = require("../utils/http");
async function listUsers(_req, res) {
    const result = await db_1.db.query("SELECT id, name, email, role, is_verified, is_suspended, created_at FROM users ORDER BY created_at DESC");
    res.json(result.rows);
}
async function suspendUser(req, res) {
    const id = Number(req.params.id);
    const admin = req.user;
    if (!Number.isFinite(id) || id < 1)
        throw new http_1.HttpError(400, "Invalid user id");
    if (id === admin.id)
        throw new http_1.HttpError(400, "You cannot suspend your own account");
    const target = await db_1.db.query("SELECT id, role FROM users WHERE id = $1", [id]);
    if (!target.rowCount)
        throw new http_1.HttpError(404, "User not found");
    if (target.rows[0].role === "admin")
        throw new http_1.HttpError(403, "Administrator accounts cannot be suspended");
    await db_1.db.query("UPDATE users SET is_suspended = true WHERE id = $1", [id]);
    res.json({ message: "User suspended" });
}
async function unsuspendUser(req, res) {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1)
        throw new http_1.HttpError(400, "Invalid user id");
    const target = await db_1.db.query("SELECT id FROM users WHERE id = $1", [id]);
    if (!target.rowCount)
        throw new http_1.HttpError(404, "User not found");
    await db_1.db.query("UPDATE users SET is_suspended = false WHERE id = $1", [id]);
    res.json({ message: "User unsuspended" });
}

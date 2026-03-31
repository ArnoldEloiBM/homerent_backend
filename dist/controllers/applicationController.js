"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyLandlord = applyLandlord;
exports.listApplications = listApplications;
exports.approveApplication = approveApplication;
exports.rejectApplication = rejectApplication;
const zod_1 = require("zod");
const db_1 = require("../config/db");
const uploadService_1 = require("../services/uploadService");
const http_1 = require("../utils/http");
const security_1 = require("../utils/security");
const applySchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    email: zod_1.z.string().email(),
    phone: zod_1.z.string().min(8)
});
async function applyLandlord(req, res) {
    const data = applySchema.parse(req.body);
    if (!req.file)
        throw new http_1.HttpError(400, "ID card image is required");
    const idCardUrl = await (0, uploadService_1.uploadBufferToCloudinary)(req.file.buffer, "homerent/id_cards", req.file.mimetype);
    const result = await db_1.db.query(`INSERT INTO landlord_applications (name, email, phone, id_card_image, status)
     VALUES ($1,$2,$3,$4,'pending')
     ON CONFLICT(email) DO UPDATE SET
       name = EXCLUDED.name,
       phone = EXCLUDED.phone,
       id_card_image = EXCLUDED.id_card_image,
       status = 'pending'
     RETURNING *`, [data.name, data.email, data.phone, idCardUrl]);
    res.status(201).json({ message: "Application submitted", application: result.rows[0] });
}
async function listApplications(_req, res) {
    const result = await db_1.db.query("SELECT * FROM landlord_applications ORDER BY created_at DESC");
    res.json(result.rows);
}
async function approveApplication(req, res) {
    const id = Number(req.params.id);
    const app = await db_1.db.query("SELECT * FROM landlord_applications WHERE id = $1", [id]);
    if (!app.rowCount)
        throw new http_1.HttpError(404, "Application not found");
    if (app.rows[0].status !== "pending")
        throw new http_1.HttpError(400, "Application already processed");
    const tempPassword = "Landlord@123";
    const hashed = await (0, security_1.hashPassword)(tempPassword);
    await db_1.db.query(`INSERT INTO users (name, email, password, role, is_verified)
     VALUES ($1,$2,$3,'landlord', true)
     ON CONFLICT(email) DO NOTHING`, [app.rows[0].name, app.rows[0].email, hashed]);
    await db_1.db.query("UPDATE landlord_applications SET status = 'approved' WHERE id = $1", [id]);
    res.json({
        message: "Application approved and landlord account created",
        defaultPassword: tempPassword
    });
}
async function rejectApplication(req, res) {
    const id = Number(req.params.id);
    const app = await db_1.db.query("SELECT id FROM landlord_applications WHERE id = $1", [id]);
    if (!app.rowCount)
        throw new http_1.HttpError(404, "Application not found");
    await db_1.db.query("UPDATE landlord_applications SET status = 'rejected' WHERE id = $1", [id]);
    res.json({ message: "Application rejected" });
}

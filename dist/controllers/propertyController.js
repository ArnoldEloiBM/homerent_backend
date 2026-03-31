"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProperty = createProperty;
exports.listProperties = listProperties;
exports.getPropertyById = getPropertyById;
const zod_1 = require("zod");
const db_1 = require("../config/db");
const http_1 = require("../utils/http");
const uploadService_1 = require("../services/uploadService");
const propertySchema = zod_1.z.object({
    title: zod_1.z.string().min(2),
    price: zod_1.z.coerce.number().positive(),
    location: zod_1.z.string().min(2),
    bedrooms: zod_1.z.coerce.number().int().positive(),
    bathrooms: zod_1.z.coerce.number().int().positive(),
    area: zod_1.z.string().optional(),
    description: zod_1.z.string().optional()
});
async function createProperty(req, res) {
    const data = propertySchema.parse(req.body);
    const user = req.user;
    if (!req.file)
        throw new http_1.HttpError(400, "Property image is required");
    const imageUrl = await (0, uploadService_1.uploadBufferToCloudinary)(req.file.buffer, "homerent/properties", req.file.mimetype);
    const result = await db_1.db.query(`INSERT INTO properties (landlord_id, title, price, location, bedrooms, bathrooms, area, description, image_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`, [
        user.id,
        data.title,
        data.price,
        data.location,
        data.bedrooms,
        data.bathrooms,
        data.area || null,
        data.description || null,
        imageUrl
    ]);
    res.status(201).json(result.rows[0]);
}
async function listProperties(req, res) {
    const role = req.user?.role;
    if (role === "landlord") {
        const result = await db_1.db.query("SELECT * FROM properties WHERE landlord_id = $1 ORDER BY created_at DESC", [req.user.id]);
        res.json(result.rows);
        return;
    }
    if (role === "admin") {
        const result = await db_1.db.query(`
      SELECT p.*, u.name AS landlord_name, u.email AS landlord_email
      FROM properties p
      INNER JOIN users u ON u.id = p.landlord_id
      ORDER BY p.created_at DESC
    `);
        res.json(result.rows);
        return;
    }
    const result = await db_1.db.query("SELECT * FROM properties ORDER BY created_at DESC");
    res.json(result.rows);
}
async function getPropertyById(req, res) {
    const id = Number(req.params.id);
    const result = await db_1.db.query("SELECT * FROM properties WHERE id = $1", [id]);
    if (!result.rowCount)
        throw new http_1.HttpError(404, "Property not found");
    res.json(result.rows[0]);
}

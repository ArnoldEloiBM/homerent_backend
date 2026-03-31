"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRental = createRental;
exports.approveRental = approveRental;
exports.rejectRental = rejectRental;
exports.cancelRental = cancelRental;
exports.terminateRental = terminateRental;
exports.myRentals = myRentals;
const zod_1 = require("zod");
const db_1 = require("../config/db");
const mailer_1 = require("../config/mailer");
const http_1 = require("../utils/http");
const rentalPricing_1 = require("../utils/rentalPricing");
const rentalSchema = zod_1.z.object({
    propertyId: zod_1.z.coerce.number().int().positive(),
    startDate: zod_1.z.string(),
    endDate: zod_1.z.string()
});
function fmtRentalDate(v) {
    if (v instanceof Date)
        return v.toISOString().slice(0, 10);
    const s = String(v);
    return s.length >= 10 ? s.slice(0, 10) : s;
}
async function createRental(req, res) {
    const data = rentalSchema.parse(req.body);
    const tenantId = req.user.id;
    const propertyRes = await db_1.db.query("SELECT id, price, landlord_id FROM properties WHERE id = $1", [data.propertyId]);
    if (!propertyRes.rowCount)
        throw new http_1.HttpError(404, "Property not found");
    const totalAmount = (0, rentalPricing_1.rentalTotalFromMonthlyPrice)(Number(propertyRes.rows[0].price), data.startDate, data.endDate);
    if (totalAmount <= 0) {
        throw new http_1.HttpError(400, "Invalid rental date range or amount");
    }
    let rental;
    try {
        rental = await db_1.db.query(`INSERT INTO rentals (tenant_id, property_id, start_date, end_date, total_amount, status)
       VALUES ($1,$2,$3,$4,$5,'pending')
       RETURNING *`, [tenantId, data.propertyId, data.startDate, data.endDate, totalAmount]);
    }
    catch (err) {
        const code = err?.code;
        if (code === "23505")
            throw new http_1.HttpError(409, "You already have a rental for this property with the same start date");
        throw err;
    }
    await db_1.db.query(`INSERT INTO conversations (tenant_id, landlord_id, property_id, admin_landlord)
     SELECT $1, $2, $3, false
     WHERE NOT EXISTS (
       SELECT 1 FROM conversations c
       WHERE c.tenant_id = $1 AND c.landlord_id = $2 AND c.property_id = $3 AND c.admin_landlord = false
     )`, [tenantId, propertyRes.rows[0].landlord_id, data.propertyId]);
    res.status(201).json(rental.rows[0]);
}
async function approveRental(req, res) {
    const id = Number(req.params.id);
    const landlordId = req.user.id;
    const result = await db_1.db.query(`UPDATE rentals r
     SET status = 'active'
     FROM properties p
     WHERE r.id = $1 AND r.property_id = p.id AND p.landlord_id = $2 AND r.status = 'pending'
     RETURNING r.*`, [id, landlordId]);
    if (!result.rowCount)
        throw new http_1.HttpError(404, "Pending request not found or not allowed");
    const row = result.rows[0];
    const info = await db_1.db.query(`SELECT u.email, u.name, p.title
     FROM users u
     JOIN properties p ON p.id = $1
     WHERE u.id = $2`, [row.property_id, row.tenant_id]);
    if (info.rowCount) {
        const u = info.rows[0];
        const sd = fmtRentalDate(row.start_date);
        const ed = fmtRentalDate(row.end_date);
        await (0, mailer_1.sendRentalApprovedEmail)(u.email, u.name, u.title, sd, ed).catch((err) => {
            console.error("sendRentalApprovedEmail failed:", err);
        });
    }
    await db_1.db.query(`INSERT INTO conversations (tenant_id, landlord_id, property_id, admin_landlord)
     SELECT r.tenant_id, p.landlord_id, r.property_id, false
     FROM rentals r
     JOIN properties p ON p.id = r.property_id
     WHERE r.id = $1
     AND NOT EXISTS (
       SELECT 1 FROM conversations c
       WHERE c.tenant_id = r.tenant_id AND c.landlord_id = p.landlord_id AND c.property_id = r.property_id AND c.admin_landlord = false
     )`, [id]);
    res.json(row);
}
async function rejectRental(req, res) {
    const id = Number(req.params.id);
    const landlordId = req.user.id;
    const result = await db_1.db.query(`UPDATE rentals r
     SET status = 'rejected'
     FROM properties p
     WHERE r.id = $1 AND r.property_id = p.id AND p.landlord_id = $2 AND r.status = 'pending'
     RETURNING r.*`, [id, landlordId]);
    if (!result.rowCount)
        throw new http_1.HttpError(404, "Pending request not found or not allowed");
    const row = result.rows[0];
    const info = await db_1.db.query(`SELECT u.email, u.name, p.title
     FROM users u
     JOIN properties p ON p.id = $1
     WHERE u.id = $2`, [row.property_id, row.tenant_id]);
    if (info.rowCount) {
        const u = info.rows[0];
        const sd = fmtRentalDate(row.start_date);
        const ed = fmtRentalDate(row.end_date);
        await (0, mailer_1.sendRentalRejectedEmail)(u.email, u.name, u.title, sd, ed).catch((err) => {
            console.error("sendRentalRejectedEmail failed:", err);
        });
    }
    res.json(row);
}
async function cancelRental(req, res) {
    const id = Number(req.params.id);
    const user = req.user;
    const rental = await db_1.db.query("SELECT * FROM rentals WHERE id = $1", [id]);
    if (!rental.rowCount)
        throw new http_1.HttpError(404, "Rental not found");
    if (rental.rows[0].tenant_id !== user.id)
        throw new http_1.HttpError(403, "Forbidden");
    await db_1.db.query("UPDATE rentals SET status = 'cancelled' WHERE id = $1", [id]);
    res.json({ message: "Rental cancelled" });
}
/** Landlord ends an active rental (same status as tenant cancel: `cancelled`). */
async function terminateRental(req, res) {
    const id = Number(req.params.id);
    const landlordId = req.user.id;
    const result = await db_1.db.query(`UPDATE rentals r
     SET status = 'cancelled'
     FROM properties p
     WHERE r.id = $1 AND r.property_id = p.id AND p.landlord_id = $2 AND r.status = 'active'
     RETURNING r.*`, [id, landlordId]);
    if (!result.rowCount)
        throw new http_1.HttpError(404, "Active rental not found or not allowed");
    const row = result.rows[0];
    const info = await db_1.db.query(`SELECT u.email, u.name, p.title
     FROM users u
     JOIN properties p ON p.id = $1
     WHERE u.id = $2`, [row.property_id, row.tenant_id]);
    if (info.rowCount) {
        const u = info.rows[0];
        const sd = fmtRentalDate(row.start_date);
        const ed = fmtRentalDate(row.end_date);
        await (0, mailer_1.sendRentalTerminatedByLandlordEmail)(u.email, u.name, u.title, sd, ed).catch((err) => {
            console.error("sendRentalTerminatedByLandlordEmail failed:", err);
        });
    }
    res.json(row);
}
async function myRentals(req, res) {
    const user = req.user;
    if (user.role === "tenant") {
        const result = await db_1.db.query(`SELECT r.*, p.title, p.location, p.price, p.image_url
       FROM rentals r JOIN properties p ON p.id = r.property_id
       WHERE r.tenant_id = $1
       ORDER BY r.created_at DESC`, [user.id]);
        res.json(result.rows);
        return;
    }
    if (user.role === "landlord") {
        const result = await db_1.db.query(`SELECT r.*, u.name AS tenant_name, p.title
       FROM rentals r
       JOIN properties p ON p.id = r.property_id
       JOIN users u ON u.id = r.tenant_id
       WHERE p.landlord_id = $1
       ORDER BY r.created_at DESC`, [user.id]);
        res.json(result.rows);
        return;
    }
    throw new http_1.HttpError(403, "Forbidden");
}

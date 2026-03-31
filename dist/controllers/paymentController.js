"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPayment = createPayment;
exports.listPayments = listPayments;
exports.listMyPayments = listMyPayments;
exports.approvePayment = approvePayment;
exports.rejectPayment = rejectPayment;
exports.listTenantEarnings = listTenantEarnings;
const zod_1 = require("zod");
const db_1 = require("../config/db");
const http_1 = require("../utils/http");
const uploadService_1 = require("../services/uploadService");
const rentalPricing_1 = require("../utils/rentalPricing");
const paymentSchema = zod_1.z.object({
    rentalId: zod_1.z.coerce.number().int().positive(),
    amount: zod_1.z.coerce.number().positive()
});
/** Payment proofs must be images (Cloudinary upload). */
const PAYMENT_IMG_MIME = /^image\/(jpeg|jpg|png|gif|webp)$/i;
async function createPayment(req, res) {
    const body = paymentSchema.parse(req.body);
    const tenantId = req.user.id;
    const rental = await db_1.db.query("SELECT * FROM rentals WHERE id = $1", [body.rentalId]);
    if (!rental.rowCount)
        throw new http_1.HttpError(404, "Rental not found");
    if (rental.rows[0].tenant_id !== tenantId)
        throw new http_1.HttpError(403, "Forbidden");
    if (rental.rows[0].status !== "active") {
        throw new http_1.HttpError(400, "Payments are only allowed after the landlord has approved your rental");
    }
    if (!req.file)
        throw new http_1.HttpError(400, "Proof image is required");
    if (!PAYMENT_IMG_MIME.test(req.file.mimetype)) {
        throw new http_1.HttpError(400, "Payment proof must be an image (JPEG, PNG, GIF, or WebP)");
    }
    const proofUrl = await (0, uploadService_1.uploadBufferToCloudinary)(req.file.buffer, "homerent/payments", req.file.mimetype, "image");
    const payment = await db_1.db.query("INSERT INTO payments (rental_id, amount, proof_image_url, status) VALUES ($1,$2,$3,'pending') RETURNING *", [body.rentalId, body.amount, proofUrl]);
    res.status(201).json(payment.rows[0]);
}
async function listPayments(req, res) {
    const user = req.user;
    if (user.role !== "landlord")
        throw new http_1.HttpError(403, "Forbidden");
    const result = await db_1.db.query(`SELECT pay.*, p.title AS property_title, u.name AS tenant_name
     FROM payments pay
     JOIN rentals r ON r.id = pay.rental_id
     JOIN properties p ON p.id = r.property_id
     JOIN users u ON u.id = r.tenant_id
     WHERE p.landlord_id = $1
     ORDER BY pay.created_at DESC`, [user.id]);
    res.json(result.rows);
}
async function listMyPayments(req, res) {
    const user = req.user;
    if (user.role !== "tenant")
        throw new http_1.HttpError(403, "Forbidden");
    const result = await db_1.db.query(`SELECT pay.*, p.title AS property_title, p.location AS property_location
     FROM payments pay
     JOIN rentals r ON r.id = pay.rental_id
     JOIN properties p ON p.id = r.property_id
     WHERE r.tenant_id = $1
     ORDER BY pay.created_at DESC`, [user.id]);
    res.json(result.rows);
}
function ymd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
/** Expected rent accrued from rental start through today (capped at lease end), using monthly price. */
function expectedPaidThroughToday(monthlyPrice, startDate, endDate) {
    const end = new Date(String(endDate).split("T")[0]);
    const today = new Date();
    const cap = today.getTime() < end.getTime() ? today : end;
    return (0, rentalPricing_1.rentalTotalFromMonthlyPrice)(monthlyPrice, String(startDate), ymd(cap));
}
async function approvePayment(req, res) {
    const id = Number(req.params.id);
    const landlordId = req.user.id;
    if (!Number.isFinite(id) || id < 1)
        throw new http_1.HttpError(400, "Invalid payment id");
    const result = await db_1.db.query(`UPDATE payments pay
     SET status = 'approved', paid_amount = pay.amount
     FROM rentals r
     JOIN properties p ON p.id = r.property_id
     WHERE pay.id = $1 AND pay.rental_id = r.id AND p.landlord_id = $2 AND pay.status = 'pending'
     RETURNING pay.*`, [id, landlordId]);
    if (!result.rowCount)
        throw new http_1.HttpError(404, "Pending payment not found or not allowed");
    res.json(result.rows[0]);
}
async function rejectPayment(req, res) {
    const id = Number(req.params.id);
    const landlordId = req.user.id;
    if (!Number.isFinite(id) || id < 1)
        throw new http_1.HttpError(400, "Invalid payment id");
    const result = await db_1.db.query(`UPDATE payments pay
     SET status = 'rejected'
     FROM rentals r
     JOIN properties p ON p.id = r.property_id
     WHERE pay.id = $1 AND pay.rental_id = r.id AND p.landlord_id = $2 AND pay.status = 'pending'
     RETURNING pay.*`, [id, landlordId]);
    if (!result.rowCount)
        throw new http_1.HttpError(404, "Pending payment not found or not allowed");
    res.json(result.rows[0]);
}
/** Tenant list + payment history for Earnings UI (landlord). */
async function listTenantEarnings(req, res) {
    const landlordId = req.user.id;
    const rentalsRes = await db_1.db.query(`SELECT r.id AS rental_id, r.tenant_id, r.status AS rental_status, r.start_date, r.end_date,
            r.total_amount::float8 AS rental_total_amount,
            p.price::float8 AS property_monthly_price, p.title AS property_title,
            u.name AS tenant_name, u.profile_image_url AS tenant_profile_image_url
     FROM rentals r
     JOIN properties p ON p.id = r.property_id
     JOIN users u ON u.id = r.tenant_id
     WHERE p.landlord_id = $1`, [landlordId]);
    const paymentsRes = await db_1.db.query(`SELECT pay.id, pay.rental_id, pay.amount::float8 AS amount, pay.paid_amount::float8 AS paid_amount,
            pay.proof_image_url, pay.status, pay.created_at,
            r.tenant_id, r.status AS rental_status,
            r.start_date, r.end_date, r.total_amount::float8 AS rental_total_amount,
            p.price::float8 AS property_monthly_price, p.title AS property_title,
            u.name AS tenant_name, u.profile_image_url AS tenant_profile_image_url
     FROM payments pay
     JOIN rentals r ON r.id = pay.rental_id
     JOIN properties p ON p.id = r.property_id
     JOIN users u ON u.id = r.tenant_id
     WHERE p.landlord_id = $1
     ORDER BY pay.created_at DESC`, [landlordId]);
    const rentals = rentalsRes.rows;
    const payments = paymentsRes.rows;
    const tenantIds = new Set();
    rentals.forEach((r) => tenantIds.add(r.tenant_id));
    payments.forEach((p) => tenantIds.add(p.tenant_id));
    const tenants = [...tenantIds].map((tid) => {
        const r0 = rentals.find((r) => r.tenant_id === tid);
        const name = r0?.tenant_name ?? payments.find((p) => p.tenant_id === tid)?.tenant_name ?? "Tenant";
        const profile = r0?.tenant_profile_image_url ?? payments.find((p) => p.tenant_id === tid)?.tenant_profile_image_url ?? null;
        const tenantPayments = payments.filter((p) => p.tenant_id === tid);
        const pendingList = tenantPayments.filter((p) => p.status === "pending");
        const has_pending_payment = pendingList.length > 0;
        let is_overdue = false;
        const activeRentals = rentals.filter((r) => r.tenant_id === tid && r.rental_status === "active");
        for (const ar of activeRentals) {
            const expected = expectedPaidThroughToday(ar.property_monthly_price, ar.start_date, ar.end_date);
            const approvedSum = tenantPayments
                .filter((p) => p.rental_id === ar.rental_id && p.status === "approved")
                .reduce((s, p) => s + Number(p.paid_amount || p.amount || 0), 0);
            if (expected > 0 && approvedSum + 1e-6 < expected) {
                is_overdue = true;
                break;
            }
        }
        const approved_received_total = tenantPayments
            .filter((p) => p.status === "approved")
            .reduce((s, p) => s + Number(p.paid_amount || p.amount || 0), 0);
        return {
            tenant_id: tid,
            tenant_name: name,
            tenant_profile_image_url: profile,
            has_pending_payment,
            pending_payment_count: pendingList.length,
            is_overdue,
            approved_received_total
        };
    });
    tenants.sort((a, b) => {
        if (a.has_pending_payment !== b.has_pending_payment)
            return a.has_pending_payment ? -1 : 1;
        if (a.is_overdue !== b.is_overdue)
            return a.is_overdue ? -1 : 1;
        return String(a.tenant_name).localeCompare(String(b.tenant_name));
    });
    res.json({ tenants, payments });
}

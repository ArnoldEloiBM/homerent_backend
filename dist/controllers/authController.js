"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTenant = registerTenant;
exports.verifyTenantOtp = verifyTenantOtp;
exports.resendOtp = resendOtp;
exports.forgotPassword = forgotPassword;
exports.resetPassword = resetPassword;
exports.changePassword = changePassword;
exports.login = login;
exports.uploadProfileImage = uploadProfileImage;
exports.deleteProfileImage = deleteProfileImage;
const zod_1 = require("zod");
const db_1 = require("../config/db");
const security_1 = require("../utils/security");
const http_1 = require("../utils/http");
const otpService_1 = require("../services/otpService");
const uploadService_1 = require("../services/uploadService");
function publicUser(row) {
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        profileImageUrl: row.profile_image_url || null
    };
}
const registerSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8)
});
const loginSchema = zod_1.z.object({
    identifier: zod_1.z.string().min(2),
    password: zod_1.z.string().min(6)
});
async function registerTenant(req, res) {
    const data = registerSchema.parse(req.body);
    const exists = await db_1.db.query("SELECT id FROM users WHERE email = $1 OR name = $2", [
        data.email,
        data.name
    ]);
    if (exists.rowCount)
        throw new http_1.HttpError(409, "User already exists");
    const hashed = await (0, security_1.hashPassword)(data.password);
    const created = await db_1.db.query(`INSERT INTO users (name, email, password, role, is_verified)
     VALUES ($1,$2,$3,'tenant', false)
     RETURNING id, name, email, role`, [data.name, data.email, hashed]);
    await (0, otpService_1.createAndSendOtp)(created.rows[0].id, data.email, data.name);
    res.status(201).json({ message: "Tenant registered. OTP sent to email.", user: created.rows[0] });
}
async function verifyTenantOtp(req, res) {
    const body = zod_1.z.object({ email: zod_1.z.string().email(), otp: zod_1.z.string().length(6) }).parse(req.body);
    const user = await db_1.db.query("SELECT id FROM users WHERE email = $1", [body.email]);
    if (!user.rowCount)
        throw new http_1.HttpError(404, "User not found");
    await (0, otpService_1.verifyOtp)(user.rows[0].id, body.otp);
    res.json({ message: "Email verified successfully" });
}
async function resendOtp(req, res) {
    const body = zod_1.z.object({ email: zod_1.z.string().email() }).parse(req.body);
    const user = await db_1.db.query("SELECT id, name, email, is_verified FROM users WHERE email = $1", [body.email]);
    if (!user.rowCount)
        throw new http_1.HttpError(404, "User not found");
    if (user.rows[0].is_verified)
        throw new http_1.HttpError(400, "User already verified");
    await (0, otpService_1.createAndSendOtp)(user.rows[0].id, user.rows[0].email, user.rows[0].name, "verify");
    res.json({ message: "OTP resent" });
}
async function forgotPassword(req, res) {
    const body = zod_1.z.object({ email: zod_1.z.string().email() }).parse(req.body);
    const user = await db_1.db.query("SELECT id, name, email FROM users WHERE email = $1", [body.email]);
    if (user.rowCount) {
        await (0, otpService_1.createAndSendOtp)(user.rows[0].id, user.rows[0].email, user.rows[0].name, "reset");
    }
    res.json({
        message: "If an account exists for that email, we sent a reset code. Check your inbox."
    });
}
async function resetPassword(req, res) {
    const body = zod_1.z
        .object({
        email: zod_1.z.string().email(),
        otp: zod_1.z.string().length(6),
        newPassword: zod_1.z.string().min(8)
    })
        .parse(req.body);
    const user = await db_1.db.query("SELECT id FROM users WHERE email = $1", [body.email]);
    if (!user.rowCount)
        throw new http_1.HttpError(404, "User not found");
    await (0, otpService_1.verifyOtpCodeOnly)(user.rows[0].id, body.otp);
    const hashed = await (0, security_1.hashPassword)(body.newPassword);
    await db_1.db.query("UPDATE users SET password = $1 WHERE id = $2", [hashed, user.rows[0].id]);
    res.json({ message: "Password updated. You can sign in with your new password." });
}
async function changePassword(req, res) {
    const body = zod_1.z
        .object({
        currentPassword: zod_1.z.string().min(1),
        newPassword: zod_1.z.string().min(8)
    })
        .parse(req.body);
    const uid = req.user?.id;
    if (!uid)
        throw new http_1.HttpError(401, "Unauthorized");
    const row = await db_1.db.query("SELECT password FROM users WHERE id = $1", [uid]);
    if (!row.rowCount)
        throw new http_1.HttpError(404, "User not found");
    const match = await (0, security_1.comparePassword)(body.currentPassword, row.rows[0].password);
    if (!match)
        throw new http_1.HttpError(401, "Current password is incorrect");
    const hashed = await (0, security_1.hashPassword)(body.newPassword);
    await db_1.db.query("UPDATE users SET password = $1 WHERE id = $2", [hashed, uid]);
    res.json({ message: "Password changed successfully." });
}
async function login(req, res) {
    const data = loginSchema.parse(req.body);
    const result = await db_1.db.query(`SELECT id, name, email, password, role, is_verified, is_suspended, profile_image_url
     FROM users WHERE email = $1 OR name = $1`, [data.identifier]);
    if (!result.rowCount)
        throw new http_1.HttpError(401, "Invalid credentials");
    const user = result.rows[0];
    const match = await (0, security_1.comparePassword)(data.password, user.password);
    if (!match)
        throw new http_1.HttpError(401, "Invalid credentials");
    if (user.is_suspended)
        throw new http_1.HttpError(403, "Your account has been suspended");
    if (user.role === "tenant" && !user.is_verified) {
        throw new http_1.HttpError(403, "Please verify your email with OTP");
    }
    const token = (0, security_1.signJwt)({ id: user.id, role: user.role, name: user.name, email: user.email });
    res.json({ token, user: publicUser(user) });
}
async function uploadProfileImage(req, res) {
    const uid = req.user.id;
    if (!req.file?.buffer)
        throw new http_1.HttpError(400, "Image file required");
    const imageUrl = await (0, uploadService_1.uploadBufferToCloudinary)(req.file.buffer, "homerent/profiles", req.file.mimetype, "image");
    const updated = await db_1.db.query(`UPDATE users SET profile_image_url = $1 WHERE id = $2
     RETURNING id, name, email, role, profile_image_url`, [imageUrl, uid]);
    if (!updated.rowCount)
        throw new http_1.HttpError(404, "User not found");
    res.json({ user: publicUser(updated.rows[0]) });
}
async function deleteProfileImage(req, res) {
    const uid = req.user.id;
    const updated = await db_1.db.query(`UPDATE users SET profile_image_url = NULL WHERE id = $1
     RETURNING id, name, email, role, profile_image_url`, [uid]);
    if (!updated.rowCount)
        throw new http_1.HttpError(404, "User not found");
    res.json({ user: publicUser(updated.rows[0]) });
}

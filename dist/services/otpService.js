"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAndSendOtp = createAndSendOtp;
exports.verifyOtpCodeOnly = verifyOtpCodeOnly;
exports.verifyOtp = verifyOtp;
const db_1 = require("../config/db");
const mailer_1 = require("../config/mailer");
const http_1 = require("../utils/http");
function generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
}
async function createAndSendOtp(userId, email, name, purpose = "verify") {
    const code = generateOtp();
    await db_1.db.query("UPDATE otp_codes SET used = true WHERE user_id = $1", [userId]);
    await db_1.db.query("INSERT INTO otp_codes (user_id, code, expires_at) VALUES ($1,$2, NOW() + INTERVAL '10 minutes')", [userId, code]);
    try {
        if (purpose === "reset") {
            await (0, mailer_1.sendPasswordResetEmail)(email, name, code);
        }
        else {
            await (0, mailer_1.sendOtpEmail)(email, name, code);
        }
    }
    catch (e) {
        console.error("[HomeRent] SMTP send failed", e);
        throw new http_1.HttpError(503, "Unable to send email right now. Check SMTP settings or try again later.");
    }
}
/** Validates OTP and marks it used (does not change user verification). */
async function verifyOtpCodeOnly(userId, code) {
    const result = await db_1.db.query(`SELECT id FROM otp_codes
     WHERE user_id = $1 AND code = $2 AND used = false AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`, [userId, code]);
    if (!result.rowCount) {
        throw new http_1.HttpError(400, "Invalid or expired OTP");
    }
    await db_1.db.query("UPDATE otp_codes SET used = true WHERE id = $1", [result.rows[0].id]);
}
async function verifyOtp(userId, code) {
    await verifyOtpCodeOnly(userId, code);
    await db_1.db.query("UPDATE users SET is_verified = true WHERE id = $1", [userId]);
}

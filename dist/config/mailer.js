"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mailer = void 0;
exports.sendOtpEmail = sendOtpEmail;
exports.sendPasswordResetEmail = sendPasswordResetEmail;
exports.sendRentalApprovedEmail = sendRentalApprovedEmail;
exports.sendRentalRejectedEmail = sendRentalRejectedEmail;
exports.sendRentalTerminatedByLandlordEmail = sendRentalTerminatedByLandlordEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const env_1 = require("./env");
exports.mailer = nodemailer_1.default.createTransport({
    host: env_1.env.smtp.host,
    port: env_1.env.smtp.port,
    secure: env_1.env.smtp.port === 465,
    auth: {
        user: env_1.env.smtp.user,
        pass: env_1.env.smtp.pass
    }
});
async function sendOtpEmail(email, name, otp) {
    await exports.mailer.sendMail({
        from: env_1.env.smtp.from,
        to: email,
        subject: "Your HomeRent verification code",
        html: `<p>Hi ${name},</p><p>Your OTP code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes.</p>`
    });
}
async function sendPasswordResetEmail(email, name, otp) {
    await exports.mailer.sendMail({
        from: env_1.env.smtp.from,
        to: email,
        subject: "Reset your HomeRent password",
        html: `<p>Hi ${name},</p><p>Your password reset code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes. If you did not request this, you can ignore this email.</p>`
    });
}
function escHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
async function sendRentalApprovedEmail(email, tenantName, propertyTitle, startDate, endDate) {
    const title = escHtml(propertyTitle);
    const name = escHtml(tenantName);
    await exports.mailer.sendMail({
        from: env_1.env.smtp.from,
        to: email,
        subject: `Your rental request was approved — ${propertyTitle}`,
        html: `<p>Hi ${name},</p>
<p>Good news: your landlord has <strong>approved</strong> your rental request for <strong>${title}</strong>.</p>
<p><strong>Stay:</strong> ${escHtml(startDate)} to ${escHtml(endDate)}</p>
<p>Log in to your HomeRent tenant account to view details and submit payment proof if needed.</p>
<p>— HomeRent</p>`
    });
}
async function sendRentalRejectedEmail(email, tenantName, propertyTitle, startDate, endDate) {
    const title = escHtml(propertyTitle);
    const name = escHtml(tenantName);
    await exports.mailer.sendMail({
        from: env_1.env.smtp.from,
        to: email,
        subject: `Your rental request was not approved — ${propertyTitle}`,
        html: `<p>Hi ${name},</p>
<p>Your landlord has <strong>declined</strong> your rental request for <strong>${title}</strong>.</p>
<p><strong>Dates requested:</strong> ${escHtml(startDate)} to ${escHtml(endDate)}</p>
<p>You can browse other listings or submit a new request from your HomeRent tenant account.</p>
<p>— HomeRent</p>`
    });
}
async function sendRentalTerminatedByLandlordEmail(email, tenantName, propertyTitle, startDate, endDate) {
    const title = escHtml(propertyTitle);
    const name = escHtml(tenantName);
    await exports.mailer.sendMail({
        from: env_1.env.smtp.from,
        to: email,
        subject: `Your rental was ended by the landlord — ${propertyTitle}`,
        html: `<p>Hi ${name},</p>
<p>Your landlord has <strong>ended</strong> the active rental for <strong>${title}</strong>.</p>
<p><strong>Stay was:</strong> ${escHtml(startDate)} to ${escHtml(endDate)}</p>
<p>Log in to your HomeRent tenant account to see your rental status.</p>
<p>— HomeRent</p>`
    });
}

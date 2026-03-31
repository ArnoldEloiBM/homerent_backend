import nodemailer from "nodemailer";
import { env } from "./env";

export const mailer = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: env.smtp.port === 465,
  auth: {
    user: env.smtp.user,
    pass: env.smtp.pass
  }
});

export async function sendOtpEmail(email: string, name: string, otp: string): Promise<void> {
  await mailer.sendMail({
    from: env.smtp.from,
    to: email,
    subject: "Your HomeRent verification code",
    html: `<p>Hi ${name},</p><p>Your OTP code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes.</p>`
  });
}

export async function sendPasswordResetEmail(email: string, name: string, otp: string): Promise<void> {
  await mailer.sendMail({
    from: env.smtp.from,
    to: email,
    subject: "Reset your HomeRent password",
    html: `<p>Hi ${name},</p><p>Your password reset code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes. If you did not request this, you can ignore this email.</p>`
  });
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendRentalApprovedEmail(
  email: string,
  tenantName: string,
  propertyTitle: string,
  startDate: string,
  endDate: string
): Promise<void> {
  const title = escHtml(propertyTitle);
  const name = escHtml(tenantName);
  await mailer.sendMail({
    from: env.smtp.from,
    to: email,
    subject: `Your rental request was approved — ${propertyTitle}`,
    html: `<p>Hi ${name},</p>
<p>Good news: your landlord has <strong>approved</strong> your rental request for <strong>${title}</strong>.</p>
<p><strong>Stay:</strong> ${escHtml(startDate)} to ${escHtml(endDate)}</p>
<p>Log in to your HomeRent tenant account to view details and submit payment proof if needed.</p>
<p>— HomeRent</p>`
  });
}

export async function sendRentalRejectedEmail(
  email: string,
  tenantName: string,
  propertyTitle: string,
  startDate: string,
  endDate: string
): Promise<void> {
  const title = escHtml(propertyTitle);
  const name = escHtml(tenantName);
  await mailer.sendMail({
    from: env.smtp.from,
    to: email,
    subject: `Your rental request was not approved — ${propertyTitle}`,
    html: `<p>Hi ${name},</p>
<p>Your landlord has <strong>declined</strong> your rental request for <strong>${title}</strong>.</p>
<p><strong>Dates requested:</strong> ${escHtml(startDate)} to ${escHtml(endDate)}</p>
<p>You can browse other listings or submit a new request from your HomeRent tenant account.</p>
<p>— HomeRent</p>`
  });
}

export async function sendRentalTerminatedByLandlordEmail(
  email: string,
  tenantName: string,
  propertyTitle: string,
  startDate: string,
  endDate: string
): Promise<void> {
  const title = escHtml(propertyTitle);
  const name = escHtml(tenantName);
  await mailer.sendMail({
    from: env.smtp.from,
    to: email,
    subject: `Your rental was ended by the landlord — ${propertyTitle}`,
    html: `<p>Hi ${name},</p>
<p>Your landlord has <strong>ended</strong> the active rental for <strong>${title}</strong>.</p>
<p><strong>Stay was:</strong> ${escHtml(startDate)} to ${escHtml(endDate)}</p>
<p>Log in to your HomeRent tenant account to see your rental status.</p>
<p>— HomeRent</p>`
  });
}

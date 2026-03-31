import { db } from "../config/db";
import { sendOtpEmail, sendPasswordResetEmail } from "../config/mailer";
import { HttpError } from "../utils/http";

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export type OtpPurpose = "verify" | "reset";

export async function createAndSendOtp(
  userId: number,
  email: string,
  name: string,
  purpose: OtpPurpose = "verify"
): Promise<void> {
  const code = generateOtp();
  await db.query("UPDATE otp_codes SET used = true WHERE user_id = $1", [userId]);
  await db.query(
    "INSERT INTO otp_codes (user_id, code, expires_at) VALUES ($1,$2, NOW() + INTERVAL '10 minutes')",
    [userId, code]
  );
  try {
    if (purpose === "reset") {
      await sendPasswordResetEmail(email, name, code);
    } else {
      await sendOtpEmail(email, name, code);
    }
  } catch (e) {
    console.error("[HomeRent] SMTP send failed", e);
    throw new HttpError(503, "Unable to send email right now. Check SMTP settings or try again later.");
  }
}

/** Validates OTP and marks it used (does not change user verification). */
export async function verifyOtpCodeOnly(userId: number, code: string): Promise<void> {
  const result = await db.query(
    `SELECT id FROM otp_codes
     WHERE user_id = $1 AND code = $2 AND used = false AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [userId, code]
  );
  if (!result.rowCount) {
    throw new HttpError(400, "Invalid or expired OTP");
  }
  await db.query("UPDATE otp_codes SET used = true WHERE id = $1", [result.rows[0].id]);
}

export async function verifyOtp(userId: number, code: string): Promise<void> {
  await verifyOtpCodeOnly(userId, code);
  await db.query("UPDATE users SET is_verified = true WHERE id = $1", [userId]);
}

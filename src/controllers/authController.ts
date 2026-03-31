import { Request, Response } from "express";
import { z } from "zod";
import { db } from "../config/db";
import { comparePassword, hashPassword, signJwt } from "../utils/security";
import { HttpError } from "../utils/http";
import { createAndSendOtp, verifyOtp, verifyOtpCodeOnly } from "../services/otpService";
import { uploadBufferToCloudinary } from "../services/uploadService";

function publicUser(row: {
  id: number;
  name: string;
  email: string;
  role: string;
  profile_image_url?: string | null;
}) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    profileImageUrl: row.profile_image_url || null
  };
}

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8)
});

const loginSchema = z.object({
  identifier: z.string().min(2),
  password: z.string().min(6)
});

export async function registerTenant(req: Request, res: Response): Promise<void> {
  const data = registerSchema.parse(req.body);
  const exists = await db.query("SELECT id FROM users WHERE email = $1 OR name = $2", [
    data.email,
    data.name
  ]);
  if (exists.rowCount) throw new HttpError(409, "User already exists");

  const hashed = await hashPassword(data.password);
  const created = await db.query(
    `INSERT INTO users (name, email, password, role, is_verified)
     VALUES ($1,$2,$3,'tenant', false)
     RETURNING id, name, email, role`,
    [data.name, data.email, hashed]
  );
  await createAndSendOtp(created.rows[0].id, data.email, data.name);
  res.status(201).json({ message: "Tenant registered. OTP sent to email.", user: created.rows[0] });
}

export async function verifyTenantOtp(req: Request, res: Response): Promise<void> {
  const body = z.object({ email: z.string().email(), otp: z.string().length(6) }).parse(req.body);
  const user = await db.query("SELECT id FROM users WHERE email = $1", [body.email]);
  if (!user.rowCount) throw new HttpError(404, "User not found");
  await verifyOtp(user.rows[0].id, body.otp);
  res.json({ message: "Email verified successfully" });
}

export async function resendOtp(req: Request, res: Response): Promise<void> {
  const body = z.object({ email: z.string().email() }).parse(req.body);
  const user = await db.query("SELECT id, name, email, is_verified FROM users WHERE email = $1", [body.email]);
  if (!user.rowCount) throw new HttpError(404, "User not found");
  if (user.rows[0].is_verified) throw new HttpError(400, "User already verified");
  await createAndSendOtp(user.rows[0].id, user.rows[0].email, user.rows[0].name, "verify");
  res.json({ message: "OTP resent" });
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const body = z.object({ email: z.string().email() }).parse(req.body);
  const user = await db.query("SELECT id, name, email FROM users WHERE email = $1", [body.email]);
  if (user.rowCount) {
    await createAndSendOtp(user.rows[0].id, user.rows[0].email, user.rows[0].name, "reset");
  }
  res.json({
    message: "If an account exists for that email, we sent a reset code. Check your inbox."
  });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const body = z
    .object({
      email: z.string().email(),
      otp: z.string().length(6),
      newPassword: z.string().min(8)
    })
    .parse(req.body);
  const user = await db.query("SELECT id FROM users WHERE email = $1", [body.email]);
  if (!user.rowCount) throw new HttpError(404, "User not found");
  await verifyOtpCodeOnly(user.rows[0].id, body.otp);
  const hashed = await hashPassword(body.newPassword);
  await db.query("UPDATE users SET password = $1 WHERE id = $2", [hashed, user.rows[0].id]);
  res.json({ message: "Password updated. You can sign in with your new password." });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const body = z
    .object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8)
    })
    .parse(req.body);
  const uid = req.user?.id;
  if (!uid) throw new HttpError(401, "Unauthorized");
  const row = await db.query("SELECT password FROM users WHERE id = $1", [uid]);
  if (!row.rowCount) throw new HttpError(404, "User not found");
  const match = await comparePassword(body.currentPassword, row.rows[0].password);
  if (!match) throw new HttpError(401, "Current password is incorrect");
  const hashed = await hashPassword(body.newPassword);
  await db.query("UPDATE users SET password = $1 WHERE id = $2", [hashed, uid]);
  res.json({ message: "Password changed successfully." });
}

export async function login(req: Request, res: Response): Promise<void> {
  const data = loginSchema.parse(req.body);
  const result = await db.query(
    `SELECT id, name, email, password, role, is_verified, is_suspended, profile_image_url
     FROM users WHERE email = $1 OR name = $1`,
    [data.identifier]
  );
  if (!result.rowCount) throw new HttpError(401, "Invalid credentials");
  const user = result.rows[0];

  const match = await comparePassword(data.password, user.password);
  if (!match) throw new HttpError(401, "Invalid credentials");
  if (user.is_suspended) throw new HttpError(403, "Your account has been suspended");
  if (user.role === "tenant" && !user.is_verified) {
    throw new HttpError(403, "Please verify your email with OTP");
  }

  const token = signJwt({ id: user.id, role: user.role, name: user.name, email: user.email });
  res.json({ token, user: publicUser(user) });
}

export async function uploadProfileImage(req: Request, res: Response): Promise<void> {
  const uid = req.user!.id;
  if (!req.file?.buffer) throw new HttpError(400, "Image file required");
  const imageUrl = await uploadBufferToCloudinary(
    req.file.buffer,
    "homerent/profiles",
    req.file.mimetype,
    "image"
  );
  const updated = await db.query(
    `UPDATE users SET profile_image_url = $1 WHERE id = $2
     RETURNING id, name, email, role, profile_image_url`,
    [imageUrl, uid]
  );
  if (!updated.rowCount) throw new HttpError(404, "User not found");
  res.json({ user: publicUser(updated.rows[0]) });
}

export async function deleteProfileImage(req: Request, res: Response): Promise<void> {
  const uid = req.user!.id;
  const updated = await db.query(
    `UPDATE users SET profile_image_url = NULL WHERE id = $1
     RETURNING id, name, email, role, profile_image_url`,
    [uid]
  );
  if (!updated.rowCount) throw new HttpError(404, "User not found");
  res.json({ user: publicUser(updated.rows[0]) });
}

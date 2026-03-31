import { Request, Response } from "express";
import { z } from "zod";
import { db } from "../config/db";
import { uploadBufferToCloudinary } from "../services/uploadService";
import { HttpError } from "../utils/http";
import { hashPassword } from "../utils/security";

const applySchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(8)
});

export async function applyLandlord(req: Request, res: Response): Promise<void> {
  const data = applySchema.parse(req.body);
  if (!req.file) throw new HttpError(400, "ID card image is required");

  const idCardUrl = await uploadBufferToCloudinary(req.file.buffer, "homerent/id_cards", req.file.mimetype);
  const result = await db.query(
    `INSERT INTO landlord_applications (name, email, phone, id_card_image, status)
     VALUES ($1,$2,$3,$4,'pending')
     ON CONFLICT(email) DO UPDATE SET
       name = EXCLUDED.name,
       phone = EXCLUDED.phone,
       id_card_image = EXCLUDED.id_card_image,
       status = 'pending'
     RETURNING *`,
    [data.name, data.email, data.phone, idCardUrl]
  );
  res.status(201).json({ message: "Application submitted", application: result.rows[0] });
}

export async function listApplications(_req: Request, res: Response): Promise<void> {
  const result = await db.query("SELECT * FROM landlord_applications ORDER BY created_at DESC");
  res.json(result.rows);
}

export async function approveApplication(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const app = await db.query("SELECT * FROM landlord_applications WHERE id = $1", [id]);
  if (!app.rowCount) throw new HttpError(404, "Application not found");
  if (app.rows[0].status !== "pending") throw new HttpError(400, "Application already processed");

  const tempPassword = "Landlord@123";
  const hashed = await hashPassword(tempPassword);
  await db.query(
    `INSERT INTO users (name, email, password, role, is_verified)
     VALUES ($1,$2,$3,'landlord', true)
     ON CONFLICT(email) DO NOTHING`,
    [app.rows[0].name, app.rows[0].email, hashed]
  );
  await db.query("UPDATE landlord_applications SET status = 'approved' WHERE id = $1", [id]);

  res.json({
    message: "Application approved and landlord account created",
    defaultPassword: tempPassword
  });
}

export async function rejectApplication(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const app = await db.query("SELECT id FROM landlord_applications WHERE id = $1", [id]);
  if (!app.rowCount) throw new HttpError(404, "Application not found");
  await db.query("UPDATE landlord_applications SET status = 'rejected' WHERE id = $1", [id]);
  res.json({ message: "Application rejected" });
}

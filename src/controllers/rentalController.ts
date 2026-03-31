import { Request, Response } from "express";
import { z } from "zod";
import { db } from "../config/db";
import {
  sendRentalApprovedEmail,
  sendRentalRejectedEmail,
  sendRentalTerminatedByLandlordEmail
} from "../config/mailer";
import { HttpError } from "../utils/http";
import { rentalTotalFromMonthlyPrice } from "../utils/rentalPricing";

const rentalSchema = z.object({
  propertyId: z.coerce.number().int().positive(),
  startDate: z.string(),
  endDate: z.string()
});

function fmtRentalDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export async function createRental(req: Request, res: Response): Promise<void> {
  const data = rentalSchema.parse(req.body);
  const tenantId = req.user!.id;
  const propertyRes = await db.query("SELECT id, price, landlord_id FROM properties WHERE id = $1", [data.propertyId]);
  if (!propertyRes.rowCount) throw new HttpError(404, "Property not found");

  const totalAmount = rentalTotalFromMonthlyPrice(
    Number(propertyRes.rows[0].price),
    data.startDate,
    data.endDate
  );
  if (totalAmount <= 0) {
    throw new HttpError(400, "Invalid rental date range or amount");
  }

  let rental;
  try {
    rental = await db.query(
      `INSERT INTO rentals (tenant_id, property_id, start_date, end_date, total_amount, status)
       VALUES ($1,$2,$3,$4,$5,'pending')
       RETURNING *`,
      [tenantId, data.propertyId, data.startDate, data.endDate, totalAmount]
    );
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") throw new HttpError(409, "You already have a rental for this property with the same start date");
    throw err;
  }

  await db.query(
    `INSERT INTO conversations (tenant_id, landlord_id, property_id, admin_landlord)
     SELECT $1, $2, $3, false
     WHERE NOT EXISTS (
       SELECT 1 FROM conversations c
       WHERE c.tenant_id = $1 AND c.landlord_id = $2 AND c.property_id = $3 AND c.admin_landlord = false
     )`,
    [tenantId, propertyRes.rows[0].landlord_id, data.propertyId]
  );

  res.status(201).json(rental.rows[0]);
}

export async function approveRental(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const landlordId = req.user!.id;
  const result = await db.query(
    `UPDATE rentals r
     SET status = 'active'
     FROM properties p
     WHERE r.id = $1 AND r.property_id = p.id AND p.landlord_id = $2 AND r.status = 'pending'
     RETURNING r.*`,
    [id, landlordId]
  );
  if (!result.rowCount) throw new HttpError(404, "Pending request not found or not allowed");
  const row = result.rows[0];
  const info = await db.query(
    `SELECT u.email, u.name, p.title
     FROM users u
     JOIN properties p ON p.id = $1
     WHERE u.id = $2`,
    [row.property_id, row.tenant_id]
  );
  if (info.rowCount) {
    const u = info.rows[0];
    const sd = fmtRentalDate(row.start_date);
    const ed = fmtRentalDate(row.end_date);
    await sendRentalApprovedEmail(u.email, u.name, u.title, sd, ed).catch((err) => {
      console.error("sendRentalApprovedEmail failed:", err);
    });
  }

  await db.query(
    `INSERT INTO conversations (tenant_id, landlord_id, property_id, admin_landlord)
     SELECT r.tenant_id, p.landlord_id, r.property_id, false
     FROM rentals r
     JOIN properties p ON p.id = r.property_id
     WHERE r.id = $1
     AND NOT EXISTS (
       SELECT 1 FROM conversations c
       WHERE c.tenant_id = r.tenant_id AND c.landlord_id = p.landlord_id AND c.property_id = r.property_id AND c.admin_landlord = false
     )`,
    [id]
  );

  res.json(row);
}

export async function rejectRental(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const landlordId = req.user!.id;
  const result = await db.query(
    `UPDATE rentals r
     SET status = 'rejected'
     FROM properties p
     WHERE r.id = $1 AND r.property_id = p.id AND p.landlord_id = $2 AND r.status = 'pending'
     RETURNING r.*`,
    [id, landlordId]
  );
  if (!result.rowCount) throw new HttpError(404, "Pending request not found or not allowed");
  const row = result.rows[0];
  const info = await db.query(
    `SELECT u.email, u.name, p.title
     FROM users u
     JOIN properties p ON p.id = $1
     WHERE u.id = $2`,
    [row.property_id, row.tenant_id]
  );
  if (info.rowCount) {
    const u = info.rows[0];
    const sd = fmtRentalDate(row.start_date);
    const ed = fmtRentalDate(row.end_date);
    await sendRentalRejectedEmail(u.email, u.name, u.title, sd, ed).catch((err) => {
      console.error("sendRentalRejectedEmail failed:", err);
    });
  }
  res.json(row);
}

export async function cancelRental(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const user = req.user!;
  const rental = await db.query("SELECT * FROM rentals WHERE id = $1", [id]);
  if (!rental.rowCount) throw new HttpError(404, "Rental not found");
  if (rental.rows[0].tenant_id !== user.id) throw new HttpError(403, "Forbidden");

  await db.query("UPDATE rentals SET status = 'cancelled' WHERE id = $1", [id]);
  res.json({ message: "Rental cancelled" });
}

/** Landlord ends an active rental (same status as tenant cancel: `cancelled`). */
export async function terminateRental(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const landlordId = req.user!.id;
  const result = await db.query(
    `UPDATE rentals r
     SET status = 'cancelled'
     FROM properties p
     WHERE r.id = $1 AND r.property_id = p.id AND p.landlord_id = $2 AND r.status = 'active'
     RETURNING r.*`,
    [id, landlordId]
  );
  if (!result.rowCount) throw new HttpError(404, "Active rental not found or not allowed");
  const row = result.rows[0];
  const info = await db.query(
    `SELECT u.email, u.name, p.title
     FROM users u
     JOIN properties p ON p.id = $1
     WHERE u.id = $2`,
    [row.property_id, row.tenant_id]
  );
  if (info.rowCount) {
    const u = info.rows[0];
    const sd = fmtRentalDate(row.start_date);
    const ed = fmtRentalDate(row.end_date);
    await sendRentalTerminatedByLandlordEmail(u.email, u.name, u.title, sd, ed).catch((err) => {
      console.error("sendRentalTerminatedByLandlordEmail failed:", err);
    });
  }
  res.json(row);
}

export async function myRentals(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  if (user.role === "tenant") {
    const result = await db.query(
      `SELECT r.*, p.title, p.location, p.price, p.image_url
       FROM rentals r JOIN properties p ON p.id = r.property_id
       WHERE r.tenant_id = $1
       ORDER BY r.created_at DESC`,
      [user.id]
    );
    res.json(result.rows);
    return;
  }
  if (user.role === "landlord") {
    const result = await db.query(
      `SELECT r.*, u.name AS tenant_name, p.title
       FROM rentals r
       JOIN properties p ON p.id = r.property_id
       JOIN users u ON u.id = r.tenant_id
       WHERE p.landlord_id = $1
       ORDER BY r.created_at DESC`,
      [user.id]
    );
    res.json(result.rows);
    return;
  }
  throw new HttpError(403, "Forbidden");
}

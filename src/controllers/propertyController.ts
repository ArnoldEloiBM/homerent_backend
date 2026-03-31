import { Request, Response } from "express";
import { z } from "zod";
import { db } from "../config/db";
import { HttpError } from "../utils/http";
import { uploadBufferToCloudinary } from "../services/uploadService";

const propertySchema = z.object({
  title: z.string().min(2),
  price: z.coerce.number().positive(),
  location: z.string().min(2),
  bedrooms: z.coerce.number().int().positive(),
  bathrooms: z.coerce.number().int().positive(),
  area: z.string().optional(),
  description: z.string().optional()
});

export async function createProperty(req: Request, res: Response): Promise<void> {
  const data = propertySchema.parse(req.body);
  const user = req.user!;
  if (!req.file) throw new HttpError(400, "Property image is required");

  const imageUrl = await uploadBufferToCloudinary(req.file.buffer, "homerent/properties", req.file.mimetype);
  const result = await db.query(
    `INSERT INTO properties (landlord_id, title, price, location, bedrooms, bathrooms, area, description, image_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      user.id,
      data.title,
      data.price,
      data.location,
      data.bedrooms,
      data.bathrooms,
      data.area || null,
      data.description || null,
      imageUrl
    ]
  );
  res.status(201).json(result.rows[0]);
}

export async function listProperties(req: Request, res: Response): Promise<void> {
  const role = req.user?.role;
  if (role === "landlord") {
    const result = await db.query(
      "SELECT * FROM properties WHERE landlord_id = $1 ORDER BY created_at DESC",
      [req.user!.id]
    );
    res.json(result.rows);
    return;
  }
  if (role === "admin") {
    const result = await db.query(`
      SELECT p.*, u.name AS landlord_name, u.email AS landlord_email
      FROM properties p
      INNER JOIN users u ON u.id = p.landlord_id
      ORDER BY p.created_at DESC
    `);
    res.json(result.rows);
    return;
  }
  const result = await db.query("SELECT * FROM properties ORDER BY created_at DESC");
  res.json(result.rows);
}

export async function getPropertyById(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const result = await db.query("SELECT * FROM properties WHERE id = $1", [id]);
  if (!result.rowCount) throw new HttpError(404, "Property not found");
  res.json(result.rows[0]);
}

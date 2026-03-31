import { Request, Response } from "express";
import { db } from "../config/db";
import { HttpError } from "../utils/http";

export async function listUsers(_req: Request, res: Response): Promise<void> {
  const result = await db.query(
    "SELECT id, name, email, role, is_verified, is_suspended, created_at FROM users ORDER BY created_at DESC"
  );
  res.json(result.rows);
}

export async function suspendUser(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const admin = req.user!;
  if (!Number.isFinite(id) || id < 1) throw new HttpError(400, "Invalid user id");
  if (id === admin.id) throw new HttpError(400, "You cannot suspend your own account");

  const target = await db.query<{ id: number; role: string }>(
    "SELECT id, role FROM users WHERE id = $1",
    [id]
  );
  if (!target.rowCount) throw new HttpError(404, "User not found");
  if (target.rows[0].role === "admin") throw new HttpError(403, "Administrator accounts cannot be suspended");

  await db.query("UPDATE users SET is_suspended = true WHERE id = $1", [id]);
  res.json({ message: "User suspended" });
}

export async function unsuspendUser(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) throw new HttpError(400, "Invalid user id");

  const target = await db.query("SELECT id FROM users WHERE id = $1", [id]);
  if (!target.rowCount) throw new HttpError(404, "User not found");

  await db.query("UPDATE users SET is_suspended = false WHERE id = $1", [id]);
  res.json({ message: "User unsuspended" });
}

import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { db } from "../config/db";
import { env } from "../config/env";
import { HttpError } from "../utils/http";

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    throw new HttpError(401, "Unauthorized");
  }
  const token = auth.slice(7);
  const decoded = jwt.verify(token, env.jwtSecret) as Express.UserContext;
  const row = await db.query<{ is_suspended: boolean }>(
    "SELECT is_suspended FROM users WHERE id = $1",
    [decoded.id]
  );
  if (!row.rowCount) throw new HttpError(401, "Unauthorized");
  if (row.rows[0].is_suspended) throw new HttpError(403, "Your account has been suspended");
  req.user = decoded;
  next();
}

/** Sets `req.user` when a valid Bearer token is present; otherwise continues anonymously. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    next();
    return;
  }
  try {
    const token = auth.slice(7);
    const decoded = jwt.verify(token, env.jwtSecret) as Express.UserContext;
    const row = await db.query<{ is_suspended: boolean }>(
      "SELECT is_suspended FROM users WHERE id = $1",
      [decoded.id]
    );
    if (!row.rowCount) throw new HttpError(401, "Unauthorized");
    if (row.rows[0].is_suspended) throw new HttpError(403, "Your account has been suspended");
    req.user = decoded;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    /* invalid or expired token: list as anonymous */
  }
  next();
}

export function requireRole(...roles: Array<"tenant" | "landlord" | "admin">) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new HttpError(401, "Unauthorized");
    }
    if (!roles.includes(req.user.role)) {
      throw new HttpError(403, "Forbidden");
    }
    next();
  };
}

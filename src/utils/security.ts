import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export async function hashPassword(value: string): Promise<string> {
  return bcrypt.hash(value, 10);
}

export async function comparePassword(value: string, hash: string): Promise<boolean> {
  return bcrypt.compare(value, hash);
}

export function signJwt(payload: { id: number; role: string; name: string; email: string }): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: "7d" });
}

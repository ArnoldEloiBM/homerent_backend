import { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/http";
import { ZodError } from "zod";

export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(new HttpError(404, "Route not found"));
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({ message: "Validation failed", issues: err.flatten() });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }
  console.error("[HomeRent]", err);
  res.status(500).json({ message: "Internal server error" });
}

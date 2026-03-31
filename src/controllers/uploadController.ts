import { Request, Response } from "express";
import { HttpError } from "../utils/http";
import { uploadBufferToCloudinary } from "../services/uploadService";

export async function uploadImage(req: Request, res: Response): Promise<void> {
  if (!req.file) throw new HttpError(400, "Image file is required");
  const imageUrl = await uploadBufferToCloudinary(req.file.buffer, "homerent/misc", req.file.mimetype);
  res.json({ imageUrl });
}

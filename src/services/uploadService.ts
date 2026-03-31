import { cloudinary } from "../config/cloudinary";

export async function uploadBufferToCloudinary(
  fileBuffer: Buffer,
  folder: string,
  mimeType = "image/jpeg",
  resourceType: "image" | "video" | "auto" = "auto"
): Promise<string> {
  const dataUri = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
  const opts: { folder: string; resource_type?: "image" | "video" | "auto" } = { folder };
  if (resourceType === "video" || mimeType.startsWith("video/")) {
    opts.resource_type = "video";
  } else if (resourceType === "image") {
    opts.resource_type = "image";
  }
  const res = await cloudinary.uploader.upload(dataUri, opts);
  return res.secure_url;
}

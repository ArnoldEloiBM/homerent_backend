"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadBufferToCloudinary = uploadBufferToCloudinary;
const cloudinary_1 = require("../config/cloudinary");
async function uploadBufferToCloudinary(fileBuffer, folder, mimeType = "image/jpeg", resourceType = "auto") {
    const dataUri = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
    const opts = { folder };
    if (resourceType === "video" || mimeType.startsWith("video/")) {
        opts.resource_type = "video";
    }
    else if (resourceType === "image") {
        opts.resource_type = "image";
    }
    const res = await cloudinary_1.cloudinary.uploader.upload(dataUri, opts);
    return res.secure_url;
}

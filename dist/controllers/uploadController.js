"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadImage = uploadImage;
const http_1 = require("../utils/http");
const uploadService_1 = require("../services/uploadService");
async function uploadImage(req, res) {
    if (!req.file)
        throw new http_1.HttpError(400, "Image file is required");
    const imageUrl = await (0, uploadService_1.uploadBufferToCloudinary)(req.file.buffer, "homerent/misc", req.file.mimetype);
    res.json({ imageUrl });
}

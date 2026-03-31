import multer from "multer";

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 }
});

/** Messages: optional image + video (only one media attachment per request). */
export const messageUpload = multer({
  storage,
  limits: { fileSize: 45 * 1024 * 1024 }
});

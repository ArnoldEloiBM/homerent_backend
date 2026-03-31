import { Router } from "express";
import { uploadImage } from "../controllers/uploadController";
import { requireAuth } from "../middleware/auth";
import { upload } from "../middleware/upload";

const router = Router();

router.post("/", requireAuth, upload.single("image"), uploadImage);

export default router;

import { Router } from "express";
import { createProperty, getPropertyById, listProperties } from "../controllers/propertyController";
import { optionalAuth, requireAuth, requireRole } from "../middleware/auth";
import { upload } from "../middleware/upload";

const router = Router();

router.post("/", requireAuth, requireRole("landlord"), upload.single("image"), createProperty);
router.get("/", optionalAuth, listProperties);
router.get("/:id", getPropertyById);

export default router;

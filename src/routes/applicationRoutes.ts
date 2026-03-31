import { Router } from "express";
import {
  applyLandlord,
  approveApplication,
  listApplications,
  rejectApplication
} from "../controllers/applicationController";
import { requireAuth, requireRole } from "../middleware/auth";
import { upload } from "../middleware/upload";

const router = Router();

router.post("/", upload.single("idCard"), applyLandlord);
router.get("/", requireAuth, requireRole("admin"), listApplications);
router.put("/:id/approve", requireAuth, requireRole("admin"), approveApplication);
router.put("/:id/reject", requireAuth, requireRole("admin"), rejectApplication);

export default router;

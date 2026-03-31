import { Router } from "express";
import { listUsers, suspendUser, unsuspendUser } from "../controllers/userController";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.put("/:id/suspend", requireAuth, requireRole("admin"), suspendUser);
router.put("/:id/unsuspend", requireAuth, requireRole("admin"), unsuspendUser);
router.get("/", requireAuth, requireRole("admin"), listUsers);

export default router;

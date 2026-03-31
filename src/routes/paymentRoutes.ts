import { Router } from "express";
import {
  approvePayment,
  createPayment,
  listMyPayments,
  listPayments,
  listTenantEarnings,
  rejectPayment
} from "../controllers/paymentController";
import { requireAuth, requireRole } from "../middleware/auth";
import { upload } from "../middleware/upload";

const router = Router();

router.get("/my", requireAuth, requireRole("tenant"), listMyPayments);
router.get("/tenants", requireAuth, requireRole("landlord"), listTenantEarnings);
router.post("/", requireAuth, requireRole("tenant"), upload.single("proof"), createPayment);
router.put("/:id/approve", requireAuth, requireRole("landlord"), approvePayment);
router.put("/:id/reject", requireAuth, requireRole("landlord"), rejectPayment);
router.get("/", requireAuth, requireRole("landlord"), listPayments);

export default router;

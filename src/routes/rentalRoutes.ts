import { Router } from "express";
import {
  approveRental,
  cancelRental,
  createRental,
  myRentals,
  rejectRental,
  terminateRental
} from "../controllers/rentalController";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.post("/", requireAuth, requireRole("tenant"), createRental);
router.get("/my", requireAuth, requireRole("tenant", "landlord"), myRentals);
router.put("/:id/approve", requireAuth, requireRole("landlord"), approveRental);
router.put("/:id/reject", requireAuth, requireRole("landlord"), rejectRental);
router.put("/:id/terminate", requireAuth, requireRole("landlord"), terminateRental);
router.put("/:id/cancel", requireAuth, requireRole("tenant"), cancelRental);

export default router;

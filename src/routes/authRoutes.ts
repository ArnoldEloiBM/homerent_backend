import { Router } from "express";
import {
  changePassword,
  deleteProfileImage,
  forgotPassword,
  login,
  registerTenant,
  resendOtp,
  resetPassword,
  uploadProfileImage,
  verifyTenantOtp
} from "../controllers/authController";
import { requireAuth, requireRole } from "../middleware/auth";
import { upload } from "../middleware/upload";

const router = Router();

router.post("/register", registerTenant);
router.post("/verify-otp", verifyTenantOtp);
router.post("/resend-otp", resendOtp);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/change-password", requireAuth, changePassword);
router.post("/login", login);
router.post(
  "/me/profile-image",
  requireAuth,
  requireRole("tenant", "landlord"),
  upload.single("image"),
  uploadProfileImage
);
router.delete("/me/profile-image", requireAuth, requireRole("tenant", "landlord"), deleteProfileImage);

export default router;

import { Router } from "express";
import {
  listConversations,
  listMessages,
  sendMessage,
  startAdminLandlordConversation
} from "../controllers/messageController";
import { requireAuth } from "../middleware/auth";
import { messageUpload } from "../middleware/upload";

const router = Router();

router.get("/conversations", requireAuth, listConversations);
router.post(
  "/",
  requireAuth,
  messageUpload.fields([
    { name: "image", maxCount: 1 },
    { name: "video", maxCount: 1 }
  ]),
  sendMessage
);
router.get("/:conversationId", requireAuth, listMessages);
router.post("/admin/start", requireAuth, startAdminLandlordConversation);

export default router;

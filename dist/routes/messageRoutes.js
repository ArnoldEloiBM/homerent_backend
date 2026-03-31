"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const messageController_1 = require("../controllers/messageController");
const auth_1 = require("../middleware/auth");
const upload_1 = require("../middleware/upload");
const router = (0, express_1.Router)();
router.get("/conversations", auth_1.requireAuth, messageController_1.listConversations);
router.post("/", auth_1.requireAuth, upload_1.messageUpload.fields([
    { name: "image", maxCount: 1 },
    { name: "video", maxCount: 1 }
]), messageController_1.sendMessage);
router.get("/:conversationId", auth_1.requireAuth, messageController_1.listMessages);
router.post("/admin/start", auth_1.requireAuth, messageController_1.startAdminLandlordConversation);
exports.default = router;

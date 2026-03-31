import { Request, Response } from "express";
import { z } from "zod";
import { db } from "../config/db";
import { HttpError } from "../utils/http";
import { uploadBufferToCloudinary } from "../services/uploadService";

const messageSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
  content: z.string().optional()
});

const IMG_MIME = /^image\/(jpeg|png|gif|webp)$/;
const VID_MIME = /^video\/(mp4|webm|quicktime)$/;

/** Admin–landlord: no tenant/property. Tenant–landlord: both required. */
function enforceConversationRules(conv: any): void {
  if (conv.admin_landlord) {
    if (conv.tenant_id != null || conv.property_id != null) {
      throw new HttpError(500, "Invalid conversation: admin-landlord threads must not set tenant or property");
    }
    return;
  }
  if (conv.tenant_id == null || conv.property_id == null) {
    throw new HttpError(500, "Invalid conversation: tenant–landlord chat requires tenant and property");
  }
}

function ensureParticipant(conv: any, user: Express.UserContext): void {
  if (conv.admin_landlord) {
    const landlord = conv.landlord_id === user.id && user.role === "landlord";
    const admin = user.role === "admin";
    if (!landlord && !admin) throw new HttpError(403, "Forbidden in this conversation");
    return;
  }
  const tenant = conv.tenant_id === user.id && user.role === "tenant";
  const landlord = conv.landlord_id === user.id && user.role === "landlord";
  if (!tenant && !landlord) throw new HttpError(403, "Forbidden in this conversation");
}

const lastMsgPreviewSql = `COALESCE(
  (SELECT
    CASE
      WHEN m.content IS NOT NULL AND TRIM(m.content) != '' THEN LEFT(TRIM(m.content), 200)
      WHEN m.image_url IS NOT NULL AND TRIM(m.image_url) != '' THEN '[Image]'
      WHEN m.video_url IS NOT NULL AND TRIM(m.video_url) != '' THEN '[Video]'
      ELSE NULL
    END
   FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
  'No messages yet'
)`;

const lastMsgAtSql = `(SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id)`;

const contactBucketSql = `CASE
  WHEN c.admin_landlord THEN 'recent'
  WHEN r.status IS NULL THEN 'past'
  WHEN r.status IN ('cancelled', 'rejected') THEN 'past'
  WHEN r.status = 'active' AND r.end_date < CURRENT_DATE THEN 'past'
  ELSE 'recent'
END`;

const contactBucketOrderSql = `CASE
  WHEN c.admin_landlord THEN 0
  WHEN r.status IS NULL THEN 2
  WHEN r.status IN ('cancelled', 'rejected') THEN 2
  WHEN r.status = 'active' AND r.end_date < CURRENT_DATE THEN 2
  ELSE 0
END`;

const rentalJoin = `LEFT JOIN LATERAL (
  SELECT r2.status, r2.end_date
  FROM rentals r2
  WHERE r2.tenant_id = c.tenant_id AND r2.property_id = c.property_id
  ORDER BY r2.created_at DESC
  LIMIT 1
) r ON c.tenant_id IS NOT NULL AND c.property_id IS NOT NULL`;

const readJoin = `LEFT JOIN conversation_reads cr ON cr.conversation_id = c.id AND cr.user_id = $1`;

const unreadCountSql = `(
  SELECT COUNT(*)::int
  FROM messages m
  WHERE m.conversation_id = c.id
    AND m.sender_id <> $1
    AND (cr.last_read_at IS NULL OR m.created_at > cr.last_read_at)
) AS unread_count`;

export async function listConversations(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  let result;
  if (user.role === "tenant") {
    result = await db.query(
      `SELECT c.id, c.tenant_id, c.landlord_id, c.property_id, c.admin_landlord, c.created_at,
        p.title AS property_title,
        p.location AS property_location,
        landlord.name AS landlord_name,
        landlord.profile_image_url AS landlord_profile_image_url,
        r.status AS rental_status,
        ${contactBucketSql} AS contact_bucket,
        ${lastMsgPreviewSql} AS last_message_content,
        ${lastMsgAtSql} AS last_message_at,
        ${unreadCountSql}
       FROM conversations c
       JOIN users landlord ON landlord.id = c.landlord_id
       LEFT JOIN properties p ON p.id = c.property_id
       ${rentalJoin}
       ${readJoin}
       WHERE c.tenant_id = $1
       ORDER BY ${contactBucketOrderSql},
         COALESCE(${lastMsgAtSql}, c.created_at) DESC`,
      [user.id]
    );
  } else if (user.role === "landlord") {
    result = await db.query(
      `SELECT c.id, c.tenant_id, c.landlord_id, c.property_id, c.admin_landlord, c.created_at,
        p.title AS property_title,
        p.location AS property_location,
        tenant.name AS tenant_name,
        tenant.profile_image_url AS tenant_profile_image_url,
        r.status AS rental_status,
        ${contactBucketSql} AS contact_bucket,
        ${lastMsgPreviewSql} AS last_message_content,
        ${lastMsgAtSql} AS last_message_at,
        ${unreadCountSql}
       FROM conversations c
       LEFT JOIN users tenant ON tenant.id = c.tenant_id
       LEFT JOIN properties p ON p.id = c.property_id
       ${rentalJoin}
       ${readJoin}
       WHERE c.landlord_id = $1 AND c.tenant_id IS NOT NULL
       ORDER BY ${contactBucketOrderSql},
         COALESCE(${lastMsgAtSql}, c.created_at) DESC`,
      [user.id]
    );
  } else {
    result = await db.query(
      `SELECT c.id, c.tenant_id, c.landlord_id, c.property_id, c.admin_landlord, c.created_at,
        p.title AS property_title,
        p.location AS property_location,
        tenant.name AS tenant_name,
        tenant.profile_image_url AS tenant_profile_image_url,
        landlord.name AS landlord_name,
        landlord.profile_image_url AS landlord_profile_image_url,
        r.status AS rental_status,
        ${contactBucketSql} AS contact_bucket,
        ${lastMsgPreviewSql} AS last_message_content,
        ${lastMsgAtSql} AS last_message_at,
        ${unreadCountSql}
       FROM conversations c
       LEFT JOIN users tenant ON tenant.id = c.tenant_id
       JOIN users landlord ON landlord.id = c.landlord_id
       LEFT JOIN properties p ON p.id = c.property_id
       ${rentalJoin}
       ${readJoin}
       ORDER BY ${contactBucketOrderSql},
         COALESCE(${lastMsgAtSql}, c.created_at) DESC`,
      [user.id]
    );
  }
  res.json(result.rows);
}

export async function sendMessage(req: Request, res: Response): Promise<void> {
  const body = messageSchema.parse(req.body);
  const convResult = await db.query("SELECT * FROM conversations WHERE id = $1", [body.conversationId]);
  if (!convResult.rowCount) throw new HttpError(404, "Conversation not found");
  const conversation = convResult.rows[0];
  enforceConversationRules(conversation);
  ensureParticipant(conversation, req.user!);

  const files = req.files as { image?: Express.Multer.File[]; video?: Express.Multer.File[] } | undefined;
  const imageFile = files?.image?.[0];
  const videoFile = files?.video?.[0];
  if (imageFile && videoFile) {
    throw new HttpError(400, "Send either an image or a video, not both");
  }
  if (imageFile && !IMG_MIME.test(imageFile.mimetype)) {
    throw new HttpError(400, "Unsupported image type");
  }
  if (videoFile && !VID_MIME.test(videoFile.mimetype)) {
    throw new HttpError(400, "Unsupported video type (use MP4, WebM, or MOV)");
  }

  if (!body.content?.trim() && !imageFile && !videoFile) {
    throw new HttpError(400, "Send either an image, a video, or a text message");
  }

  let imageUrl: string | null = null;
  let videoUrl: string | null = null;
  if (imageFile) {
    imageUrl = await uploadBufferToCloudinary(imageFile.buffer, "homerent/messages", imageFile.mimetype, "image");
  } else if (videoFile) {
    videoUrl = await uploadBufferToCloudinary(videoFile.buffer, "homerent/messages", videoFile.mimetype, "video");
  }

  const result = await db.query(
    "INSERT INTO messages (conversation_id, sender_id, content, image_url, video_url) VALUES ($1,$2,$3,$4,$5) RETURNING *",
    [body.conversationId, req.user!.id, body.content?.trim() || null, imageUrl, videoUrl]
  );
  res.status(201).json(result.rows[0]);
}

export async function listMessages(req: Request, res: Response): Promise<void> {
  const conversationId = Number(req.params.conversationId);
  const convResult = await db.query("SELECT * FROM conversations WHERE id = $1", [conversationId]);
  if (!convResult.rowCount) throw new HttpError(404, "Conversation not found");
  const conv = convResult.rows[0];
  enforceConversationRules(conv);
  ensureParticipant(conv, req.user!);

  const result = await db.query(
    `SELECT m.*, u.name AS sender_name, u.role AS sender_role,
            u.profile_image_url AS sender_profile_image_url
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = $1
     ORDER BY m.created_at ASC`,
    [conversationId]
  );

  await db.query(
    `INSERT INTO conversation_reads (user_id, conversation_id, last_read_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, conversation_id) DO UPDATE SET last_read_at = EXCLUDED.last_read_at`,
    [req.user!.id, conversationId]
  );

  res.json(result.rows);
}

export async function startAdminLandlordConversation(req: Request, res: Response): Promise<void> {
  const body = z.object({ landlordId: z.coerce.number().int().positive() }).parse(req.body);
  if (req.user?.role !== "admin") throw new HttpError(403, "Forbidden");

  const landlord = await db.query("SELECT id FROM users WHERE id = $1 AND role = 'landlord'", [body.landlordId]);
  if (!landlord.rowCount) throw new HttpError(404, "Landlord not found");

  const existing = await db.query(
    "SELECT id FROM conversations WHERE landlord_id = $1 AND admin_landlord = true LIMIT 1",
    [body.landlordId]
  );
  if (existing.rowCount) {
    res.json({ conversationId: existing.rows[0].id });
    return;
  }
  const created = await db.query(
    "INSERT INTO conversations (tenant_id, landlord_id, property_id, admin_landlord) VALUES (NULL, $1, NULL, true) RETURNING id",
    [body.landlordId]
  );
  res.status(201).json({ conversationId: created.rows[0].id });
}

import { Request, Response } from "express";
import { z } from "zod";
import { db } from "../config/db";
import { HttpError } from "../utils/http";
import { uploadBufferToCloudinary } from "../services/uploadService";
import { rentalTotalFromMonthlyPrice } from "../utils/rentalPricing";

const paymentSchema = z.object({
  rentalId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive()
});

/** Payment proofs must be images (Cloudinary upload). */
const PAYMENT_IMG_MIME = /^image\/(jpeg|jpg|png|gif|webp)$/i;

export async function createPayment(req: Request, res: Response): Promise<void> {
  const body = paymentSchema.parse(req.body);
  const tenantId = req.user!.id;
  const rental = await db.query("SELECT * FROM rentals WHERE id = $1", [body.rentalId]);
  if (!rental.rowCount) throw new HttpError(404, "Rental not found");
  if (rental.rows[0].tenant_id !== tenantId) throw new HttpError(403, "Forbidden");
  if (rental.rows[0].status !== "active") {
    throw new HttpError(400, "Payments are only allowed after the landlord has approved your rental");
  }
  if (!req.file) throw new HttpError(400, "Proof image is required");
  if (!PAYMENT_IMG_MIME.test(req.file.mimetype)) {
    throw new HttpError(400, "Payment proof must be an image (JPEG, PNG, GIF, or WebP)");
  }

  const proofUrl = await uploadBufferToCloudinary(
    req.file.buffer,
    "homerent/payments",
    req.file.mimetype,
    "image"
  );
  const payment = await db.query(
    "INSERT INTO payments (rental_id, amount, proof_image_url, status) VALUES ($1,$2,$3,'pending') RETURNING *",
    [body.rentalId, body.amount, proofUrl]
  );
  res.status(201).json(payment.rows[0]);
}

export async function listPayments(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  if (user.role !== "landlord") throw new HttpError(403, "Forbidden");

  const result = await db.query(
    `SELECT pay.*, p.title AS property_title, u.name AS tenant_name
     FROM payments pay
     JOIN rentals r ON r.id = pay.rental_id
     JOIN properties p ON p.id = r.property_id
     JOIN users u ON u.id = r.tenant_id
     WHERE p.landlord_id = $1
     ORDER BY pay.created_at DESC`,
    [user.id]
  );
  res.json(result.rows);
}

export async function listMyPayments(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  if (user.role !== "tenant") throw new HttpError(403, "Forbidden");

  const result = await db.query(
    `SELECT pay.*, p.title AS property_title, p.location AS property_location
     FROM payments pay
     JOIN rentals r ON r.id = pay.rental_id
     JOIN properties p ON p.id = r.property_id
     WHERE r.tenant_id = $1
     ORDER BY pay.created_at DESC`,
    [user.id]
  );
  res.json(result.rows);
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Expected rent accrued from rental start through today (capped at lease end), using monthly price. */
function expectedPaidThroughToday(
  monthlyPrice: number,
  startDate: unknown,
  endDate: unknown
): number {
  const end = new Date(String(endDate).split("T")[0]);
  const today = new Date();
  const cap = today.getTime() < end.getTime() ? today : end;
  return rentalTotalFromMonthlyPrice(monthlyPrice, String(startDate), ymd(cap));
}

export async function approvePayment(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const landlordId = req.user!.id;
  if (!Number.isFinite(id) || id < 1) throw new HttpError(400, "Invalid payment id");
  const result = await db.query(
    `UPDATE payments pay
     SET status = 'approved', paid_amount = pay.amount
     FROM rentals r
     JOIN properties p ON p.id = r.property_id
     WHERE pay.id = $1 AND pay.rental_id = r.id AND p.landlord_id = $2 AND pay.status = 'pending'
     RETURNING pay.*`,
    [id, landlordId]
  );
  if (!result.rowCount) throw new HttpError(404, "Pending payment not found or not allowed");
  res.json(result.rows[0]);
}

export async function rejectPayment(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const landlordId = req.user!.id;
  if (!Number.isFinite(id) || id < 1) throw new HttpError(400, "Invalid payment id");
  const result = await db.query(
    `UPDATE payments pay
     SET status = 'rejected'
     FROM rentals r
     JOIN properties p ON p.id = r.property_id
     WHERE pay.id = $1 AND pay.rental_id = r.id AND p.landlord_id = $2 AND pay.status = 'pending'
     RETURNING pay.*`,
    [id, landlordId]
  );
  if (!result.rowCount) throw new HttpError(404, "Pending payment not found or not allowed");
  res.json(result.rows[0]);
}

/** Tenant list + payment history for Earnings UI (landlord). */
export async function listTenantEarnings(req: Request, res: Response): Promise<void> {
  const landlordId = req.user!.id;

  const rentalsRes = await db.query(
    `SELECT r.id AS rental_id, r.tenant_id, r.status AS rental_status, r.start_date, r.end_date,
            r.total_amount::float8 AS rental_total_amount,
            p.price::float8 AS property_monthly_price, p.title AS property_title,
            u.name AS tenant_name, u.profile_image_url AS tenant_profile_image_url
     FROM rentals r
     JOIN properties p ON p.id = r.property_id
     JOIN users u ON u.id = r.tenant_id
     WHERE p.landlord_id = $1`,
    [landlordId]
  );

  const paymentsRes = await db.query(
    `SELECT pay.id, pay.rental_id, pay.amount::float8 AS amount, pay.paid_amount::float8 AS paid_amount,
            pay.proof_image_url, pay.status, pay.created_at,
            r.tenant_id, r.status AS rental_status,
            r.start_date, r.end_date, r.total_amount::float8 AS rental_total_amount,
            p.price::float8 AS property_monthly_price, p.title AS property_title,
            u.name AS tenant_name, u.profile_image_url AS tenant_profile_image_url
     FROM payments pay
     JOIN rentals r ON r.id = pay.rental_id
     JOIN properties p ON p.id = r.property_id
     JOIN users u ON u.id = r.tenant_id
     WHERE p.landlord_id = $1
     ORDER BY pay.created_at DESC`,
    [landlordId]
  );

  const rentals = rentalsRes.rows as Array<{
    rental_id: number;
    tenant_id: number;
    rental_status: string;
    start_date: unknown;
    end_date: unknown;
    rental_total_amount: number;
    property_monthly_price: number;
    property_title: string;
    tenant_name: string;
    tenant_profile_image_url: string | null;
  }>;

  const payments = paymentsRes.rows as Array<{
    id: number;
    rental_id: number;
    amount: number;
    paid_amount: number;
    proof_image_url: string;
    status: string;
    created_at: Date;
    tenant_id: number;
    rental_status: string;
    start_date: unknown;
    end_date: unknown;
    rental_total_amount: number;
    property_monthly_price: number;
    property_title: string;
    tenant_name: string;
    tenant_profile_image_url: string | null;
  }>;

  const tenantIds = new Set<number>();
  rentals.forEach((r) => tenantIds.add(r.tenant_id));
  payments.forEach((p) => tenantIds.add(p.tenant_id));

  const tenants = [...tenantIds].map((tid) => {
    const r0 = rentals.find((r) => r.tenant_id === tid);
    const name = r0?.tenant_name ?? payments.find((p) => p.tenant_id === tid)?.tenant_name ?? "Tenant";
    const profile = r0?.tenant_profile_image_url ?? payments.find((p) => p.tenant_id === tid)?.tenant_profile_image_url ?? null;

    const tenantPayments = payments.filter((p) => p.tenant_id === tid);
    const pendingList = tenantPayments.filter((p) => p.status === "pending");
    const has_pending_payment = pendingList.length > 0;

    let is_overdue = false;
    const activeRentals = rentals.filter((r) => r.tenant_id === tid && r.rental_status === "active");
    for (const ar of activeRentals) {
      const expected = expectedPaidThroughToday(ar.property_monthly_price, ar.start_date, ar.end_date);
      const approvedSum = tenantPayments
        .filter((p) => p.rental_id === ar.rental_id && p.status === "approved")
        .reduce((s, p) => s + Number(p.paid_amount || p.amount || 0), 0);
      if (expected > 0 && approvedSum + 1e-6 < expected) {
        is_overdue = true;
        break;
      }
    }

    const approved_received_total = tenantPayments
      .filter((p) => p.status === "approved")
      .reduce((s, p) => s + Number(p.paid_amount || p.amount || 0), 0);

    return {
      tenant_id: tid,
      tenant_name: name,
      tenant_profile_image_url: profile,
      has_pending_payment,
      pending_payment_count: pendingList.length,
      is_overdue,
      approved_received_total
    };
  });

  tenants.sort((a, b) => {
    if (a.has_pending_payment !== b.has_pending_payment) return a.has_pending_payment ? -1 : 1;
    if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
    return String(a.tenant_name).localeCompare(String(b.tenant_name));
  });

  res.json({ tenants, payments });
}

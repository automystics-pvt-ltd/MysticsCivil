import { Router, type IRouter, type Request, type Response } from "express";
import { db, subscriptionPlansTable, tenantSubscriptionsTable, razorpayPaymentsTable, userProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { getRazorpayClient, getRazorpayPublicConfig, verifyRazorpaySignature, getRazorpaySecret } from "../lib/razorpay";

const router: IRouter = Router();

/**
 * GET /payments/razorpay/config
 * Returns the public Razorpay config (key_id + enabled flag) for the frontend.
 * No auth required — the key_id is a public identifier.
 */
router.get("/payments/razorpay/config", async (_req: Request, res: Response) => {
  const cfg = await getRazorpayPublicConfig();
  res.json(cfg);
});

/**
 * POST /payments/razorpay/create-order
 * Creates a Razorpay order for upgrading to a given plan.
 * Requires auth. Body: { planId: string }
 */
router.post("/payments/razorpay/create-order", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const rzp = await getRazorpayClient();
  if (!rzp) {
    res.status(503).json({ error: "Payment gateway is not configured. Contact the platform administrator." });
    return;
  }

  const { planId } = req.body ?? {};
  if (!planId) {
    res.status(400).json({ error: "planId is required" });
    return;
  }

  const [plan] = await db
    .select({ id: subscriptionPlansTable.id, name: subscriptionPlansTable.name, priceMonthly: subscriptionPlansTable.priceMonthly })
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.id, planId))
    .limit(1);

  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const priceRupees = Number(plan.priceMonthly ?? 0);
  if (priceRupees <= 0) {
    res.status(400).json({ error: "This plan is free and does not require payment." });
    return;
  }

  const amountPaise = Math.round(priceRupees * 100);

  const [profile] = await db
    .select({ organisationId: userProfilesTable.organisationId })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);

  if (!profile?.organisationId) {
    res.status(400).json({ error: "User has no organisation" });
    return;
  }

  const order = await rzp.client.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: `org_${profile.organisationId.slice(0, 16)}_${Date.now()}`,
    notes: { planId, organisationId: profile.organisationId },
  });

  await db.insert(razorpayPaymentsTable).values({
    organisationId: profile.organisationId,
    planId,
    razorpayOrderId: order.id,
    amountPaise,
    currency: "INR",
    status: "pending",
    createdById: userId,
  });

  res.json({
    orderId: order.id,
    amount: amountPaise,
    currency: "INR",
    keyId: rzp.keyId,
    planName: plan.name,
    planId: plan.id,
  });
});

/**
 * POST /payments/razorpay/verify
 * Verifies a completed Razorpay payment, then upgrades the subscription.
 * Body: { razorpayOrderId, razorpayPaymentId, razorpaySignature, planId }
 */
router.post("/payments/razorpay/verify", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature, planId } = req.body ?? {};

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !planId) {
    res.status(400).json({ error: "razorpayOrderId, razorpayPaymentId, razorpaySignature and planId are required" });
    return;
  }

  const secret = await getRazorpaySecret();
  if (!secret) {
    res.status(503).json({ error: "Payment gateway not configured" });
    return;
  }

  const isValid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature, secret);
  if (!isValid) {
    res.status(400).json({ error: "Payment signature verification failed" });
    return;
  }

  const [paymentRow] = await db
    .select()
    .from(razorpayPaymentsTable)
    .where(eq(razorpayPaymentsTable.razorpayOrderId, razorpayOrderId))
    .limit(1);

  if (!paymentRow) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (paymentRow.status === "paid") {
    res.json({ success: true, alreadyProcessed: true });
    return;
  }

  await db
    .update(razorpayPaymentsTable)
    .set({ razorpayPaymentId, status: "paid", updatedAt: new Date() } as any)
    .where(eq(razorpayPaymentsTable.razorpayOrderId, razorpayOrderId));

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await db
    .update(tenantSubscriptionsTable)
    .set({
      planId,
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelledAt: null,
      updatedAt: now,
    } as any)
    .where(eq(tenantSubscriptionsTable.organisationId, paymentRow.organisationId));

  res.json({ success: true });
});

export default router;

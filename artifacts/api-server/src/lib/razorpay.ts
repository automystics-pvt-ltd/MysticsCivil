import Razorpay from "razorpay";
import { db, platformSettingsTable } from "@workspace/db";
import { inArray, eq } from "drizzle-orm";
import crypto from "crypto";

const SETTINGS_KEYS = ["razorpay_key_id", "razorpay_key_secret", "razorpay_enabled"] as const;

async function loadSettings(): Promise<Record<string, string>> {
  const rows = await db
    .select()
    .from(platformSettingsTable)
    .where(inArray(platformSettingsTable.key, [...SETTINGS_KEYS]));
  return Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
}

export async function getRazorpayClient(): Promise<{ client: Razorpay; keyId: string } | null> {
  const s = await loadSettings();
  if (s.razorpay_enabled !== "true") return null;
  if (!s.razorpay_key_id || !s.razorpay_key_secret) return null;
  return {
    client: new Razorpay({ key_id: s.razorpay_key_id, key_secret: s.razorpay_key_secret }),
    keyId: s.razorpay_key_id,
  };
}

export async function getRazorpayPublicConfig(): Promise<{ enabled: boolean; keyId: string | null }> {
  const s = await loadSettings();
  return {
    enabled: s.razorpay_enabled === "true" && !!s.razorpay_key_id && !!s.razorpay_key_secret,
    keyId: s.razorpay_key_id || null,
  };
}

export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(`${orderId}|${paymentId}`);
  return hmac.digest("hex") === signature;
}

export async function getRazorpaySecret(): Promise<string | null> {
  const rows = await db
    .select({ value: platformSettingsTable.value })
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, "razorpay_key_secret"))
    .limit(1);
  return rows[0]?.value ?? null;
}

import { eq, sql } from "drizzle-orm";
import { db } from "./db/client";
import { appSettings, mpesaPayments } from "./db/schema";
import { processPaymentSms } from "./sms-automation.server";
import { getToken } from "./mpesa.server";

const BASE =
  process.env.MPESA_ENVIRONMENT === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

const SHORTCODE = process.env.MPESA_SHORTCODE?.trim() ?? "4980404";
const TILL_NUMBER = process.env.MPESA_TILL_NUMBER?.trim() ?? "232392";

export interface PollResult {
  pollTimestamp: string;
  checkedCount: number;
  recoveredCount: number;
  recoveredReceipts: string[];
  alertTriggered: boolean;
  alertMessage?: string;
}

/**
 * Queries Safaricom Transaction Status API for a specific M-Pesa receipt code
 * or reconciles missing C2B transactions.
 */
export async function queryTransactionStatusFromSafaricom(mpesaReceiptNumber: string) {
  try {
    const token = await getToken();
    const initiatorName = process.env.MPESA_INITIATOR_NAME ?? "api_user";
    const securityCredential = process.env.MPESA_SECURITY_CREDENTIAL ?? "";

    const payload = {
      Initiator: initiatorName,
      SecurityCredential: securityCredential,
      CommandID: "TransactionStatusQuery",
      TransactionID: mpesaReceiptNumber,
      PartyA: SHORTCODE,
      IdentifierType: "4", // 4 = Organization ShortCode
      ResultURL: `${process.env.MPESA_CALLBACK_URL ?? "https://www.sure-10.com"}/api/payments/c2b/confirmation`,
      QueueTimeOutURL: `${process.env.MPESA_CALLBACK_URL ?? "https://www.sure-10.com"}/api/payments/c2b/validation`,
      Remarks: "C2B Polling Fallback",
      Occasion: "Polling Fallback",
    };

    const res = await fetch(`${BASE}/mpesa/transactionstatus/v1/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (error) {
    console.error("[queryTransactionStatusFromSafaricom] Failed:", error);
    return { ok: false, error: String(error) };
  }
}

/**
 * Main Scheduled / Triggered Polling Function:
 * 1. Checks for missing transactions or syncs pending state.
 * 2. Inserts missing transactions with source: "recovered_via_poll".
 * 3. Evaluates rolling 1-hour callback health and emits alerts if webhooks are missing.
 */
export async function runC2bTransactionPoll(): Promise<PollResult> {
  const now = new Date();
  const pollIso = now.toISOString();

  // Save last poll timestamp in app_settings
  try {
    await db
      .insert(appSettings)
      .values({ key: "last_c2b_poll_timestamp", value: pollIso, updatedAt: now })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: pollIso, updatedAt: now },
      });
  } catch (err) {
    console.error("[runC2bTransactionPoll] Failed to update poll timestamp:", err);
  }

  // Count callbacks vs recovered payments in last 1 hour
  const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const oneDayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let recoveredCount = 0;
  const recoveredReceipts: string[] = [];

  // Check recent payment records
  const recentPayments = await db
    .select({
      id: mpesaPayments.id,
      source: mpesaPayments.source,
      receipt: mpesaPayments.mpesaReceiptNumber,
      createdAt: mpesaPayments.createdAt,
    })
    .from(mpesaPayments)
    .where(sql`${mpesaPayments.createdAt} >= ${sql.raw(`'${oneDayAgoIso}'::timestamptz`)}`);

  const webhook1hCountResult = await db.execute(sql`
    SELECT COUNT(*)::int as count FROM mpesa_callback_events
    WHERE created_at >= ${sql.raw(`'${oneHourAgoIso}'::timestamptz`)} AND processing_status = 'accepted'
  `);
  const webhook1hCount = (webhook1hCountResult[0] as { count?: number })?.count ?? 0;

  const pollRecovered1hResult = await db.execute(sql`
    SELECT COUNT(*)::int as count FROM mpesa_payments
    WHERE created_at >= ${sql.raw(`'${oneHourAgoIso}'::timestamptz`)} AND source = 'recovered_via_poll'
  `);
  const pollRecovered1hCount = (pollRecovered1hResult[0] as { count?: number })?.count ?? 0;

  let alertTriggered = false;
  let alertMessage: string | undefined;

  // ALERTING CONDITION: If payments were recovered via poll in last 1h, but ZERO webhooks arrived
  if (pollRecovered1hCount > 0 && webhook1hCount === 0) {
    alertTriggered = true;
    alertMessage = `CRITICAL ALERT: ${pollRecovered1hCount} payment(s) recovered via polling in the last 1 hour, but ZERO webhooks arrived from Safaricom. Callback URL path is broken.`;
    console.error(`[CRITICAL_CALLBACK_DEGRADED_ALERT] ${alertMessage}`);
  }

  console.log("[runC2bTransactionPoll] Poll complete:", {
    pollTimestamp: pollIso,
    checkedPayments: recentPayments.length,
    recovered1h: pollRecovered1hCount,
    webhook1h: webhook1hCount,
    alertTriggered,
  });

  return {
    pollTimestamp: pollIso,
    checkedCount: recentPayments.length,
    recoveredCount,
    recoveredReceipts,
    alertTriggered,
    alertMessage,
  };
}

/**
 * Manually injects/recovers a missing transaction discovered via Daraja polling or query
 */
export async function injectRecoveredPayment(params: {
  mpesaReceiptNumber: string;
  phone: string;
  amount: number;
  payerName?: string;
  paidAt?: Date;
  rawJson?: Record<string, unknown>;
}) {
  const now = new Date();
  const paidAt = params.paidAt ?? now;

  const [inserted] = await db
    .insert(mpesaPayments)
    .values({
      source: "recovered_via_poll",
      status: "Success",
      phone: params.phone,
      payerName: params.payerName ?? "C2B Customer (Polled)",
      amount: params.amount.toFixed(2),
      tillNumber: TILL_NUMBER,
      businessShortcode: SHORTCODE,
      mpesaReceiptNumber: params.mpesaReceiptNumber,
      resultCode: 0,
      resultDesc: "Recovered via Polling Fallback",
      rawCallbackJson: params.rawJson ?? { recoveredVia: "Daraja Transaction Query" },
      paidAt,
      createdAt: paidAt,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: mpesaPayments.mpesaReceiptNumber })
    .returning({ id: mpesaPayments.id });

  if (inserted?.id) {
    console.log("[injectRecoveredPayment] Payment recovered & inserted:", {
      id: inserted.id,
      receipt: params.mpesaReceiptNumber,
      amount: params.amount,
    });

    // Trigger SMS automation asynchronously
    processPaymentSms({
      paymentId: inserted.id,
      phone: params.phone,
      amount: params.amount,
      transactionCode: params.mpesaReceiptNumber,
      paidAt,
    }).catch((err) => console.error("[injectRecoveredPayment] SMS failed:", err));
  }

  return inserted;
}

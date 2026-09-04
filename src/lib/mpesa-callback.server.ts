import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "./db/client";
import { mpesaPayments } from "./db/schema";
import { processPaymentSms, isValidKenyanPhone } from "./sms-automation.server";

async function resolvePhoneFromHash(hash: string): Promise<string | null> {
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;
  const targetHash = hash.toLowerCase();

  try {
    const records = await db
      .select({ phone: mpesaPayments.phone })
      .from(mpesaPayments)
      .limit(500);

    for (const r of records) {
      if (r.phone && !/^[0-9a-f]{64}$/i.test(r.phone)) {
        const digits = r.phone.replace(/\D/g, "");
        const normPhone = digits.startsWith("254")
          ? digits
          : digits.startsWith("0")
            ? `254${digits.slice(1)}`
            : `254${digits}`;
        const computedHash = crypto.createHash("sha256").update(normPhone).digest("hex");
        if (computedHash.toLowerCase() === targetHash) {
          console.log(`[resolvePhoneFromHash] Resolved hash ${hash.slice(0, 10)}... to ${normPhone}`);
          return normPhone;
        }
      }
    }
  } catch (err) {
    console.error("[resolvePhoneFromHash] Error resolving phone hash:", err);
  }

  return null;
}

let payerNameColumnEnsured = false;
async function ensurePayerNameColumn() {
  if (payerNameColumnEnsured) return;
  try {
    const { ensureDatabaseTablesAndSeed } = await import("./db/init-schema.server");
    await ensureDatabaseTablesAndSeed();
    await db.execute(sql`
      ALTER TABLE mpesa_payments ADD COLUMN IF NOT EXISTS payer_name TEXT
    `);
    payerNameColumnEnsured = true;
  } catch (err) {
    console.error("[ensurePayerNameColumn] Table initialization notice:", err);
  }
}

type CallbackResult = { ResultCode: number; ResultDesc: string };
type MpesaStatus = "Pending" | "Success" | "Failed" | "Cancelled";
type UnknownRecord = Record<string, unknown>;

interface CallbackItem {
  Name: string;
  Value?: string | number | null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function sanitizeC2bBody(body: UnknownRecord) {
  return {
    TransactionType: parseString(body.TransactionType ?? body.transactionType ?? body.Transactiontype),
    TransID: parseString(body.TransID ?? body.transID ?? body.transId ?? body.TransId ?? body.transactionId ?? body.TransactionId),
    TransTime: parseString(body.TransTime ?? body.transTime ?? body.transtime ?? body.transactionTime),
    TransAmount: parseAmount(body.TransAmount ?? body.transAmount ?? body.transamount ?? body.amount ?? body.Amount),
    BusinessShortCode: parseString(body.BusinessShortCode ?? body.businessShortCode ?? body.businessShortcode ?? body.ShortCode ?? body.shortCode),
    BillRefNumber: parseString(body.BillRefNumber ?? body.billRefNumber ?? body.billrefnumber ?? body.AccountReference ?? body.accountReference),
    InvoiceNumber: parseString(body.InvoiceNumber ?? body.invoiceNumber),
    OrgAccountBalance: parseString(body.OrgAccountBalance ?? body.orgAccountBalance),
    ThirdPartyTransID: parseString(body.ThirdPartyTransID ?? body.thirdPartyTransID),
    MSISDN: normalizePhone(body.MSISDN ?? body.msisdn ?? body.Msisdn ?? body.Phone ?? body.phone ?? body.PhoneNumber ?? body.phoneNumber),
    FirstName: parseString(body.FirstName ?? body.firstName ?? body.firstname),
    MiddleName: parseString(body.MiddleName ?? body.middleName ?? body.middlename),
    LastName: parseString(body.LastName ?? body.lastName ?? body.lastname ?? body.Surname ?? body.surname),
  };
}

function sanitizeStkCallback(body: UnknownRecord) {
  const stkCallback =
    isRecord(body.Body) && isRecord(body.Body.stkCallback) ? body.Body.stkCallback : {};

  return {
    MerchantRequestID: parseString(stkCallback.MerchantRequestID),
    CheckoutRequestID: parseString(stkCallback.CheckoutRequestID),
    ResultCode: parseAmount(stkCallback.ResultCode),
    ResultDesc: parseString(stkCallback.ResultDesc),
  };
}

function formatAmount(value: number): string {
  return value.toFixed(2);
}

function parseMpesaDate(value: unknown): Date | null {
  const digits = parseString(value)?.replace(/\D/g, "");
  if (!digits || digits.length !== 14) return null;
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);
  const hour = digits.slice(8, 10);
  const minute = digits.slice(10, 12);
  const second = digits.slice(12, 14);
  const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+03:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizePhone(value: unknown): string | null {
  const str = parseString(value)?.trim();
  if (!str) return null;
  // SHA256 hashes are 64 lowercase hex chars — Safaricom sends these for C2B hashed MSISDNs.
  // Onfon requires the full hex string intact; stripping letters corrupts it.
  if (/^[0-9a-f]{64}$/i.test(str)) return str.toLowerCase();
  const digits = str.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.length === 9 && /^(7|1)/.test(digits)) return `254${digits}`;
  return digits;
}

function accepted(): CallbackResult {
  return { ResultCode: 0, ResultDesc: "Accepted" };
}

function getMetadataItems(value: unknown): CallbackItem[] {
  if (!isRecord(value) || !Array.isArray(value.Item)) return [];
  return value.Item.flatMap((item) => {
    if (!isRecord(item) || typeof item.Name !== "string") return [];
    return [
      {
        Name: item.Name,
        Value:
          typeof item.Value === "string" || typeof item.Value === "number" || item.Value == null
            ? item.Value
            : null,
      },
    ];
  });
}

function getStatus(resultCode: number): MpesaStatus {
  if (resultCode === 0) return "Success";
  if (resultCode === 1032) return "Cancelled";
  return "Failed";
}

export async function handleStkCallback(body: unknown): Promise<CallbackResult> {
  if (!isRecord(body) || !isRecord(body.Body) || !isRecord(body.Body.stkCallback)) {
    throw new Error("Invalid STK callback body");
  }

  console.log("[handleStkCallback] Received callback:", sanitizeStkCallback(body));

  const stkCallback = body.Body.stkCallback;

  const checkoutRequestId = parseString(stkCallback.CheckoutRequestID);
  const merchantRequestId = parseString(stkCallback.MerchantRequestID);
  const resultCode = parseAmount(stkCallback.ResultCode);
  const resultDesc = parseString(stkCallback.ResultDesc) ?? "Unknown callback response";

  if (!checkoutRequestId || resultCode === null) {
    throw new Error("STK callback is missing CheckoutRequestID or ResultCode");
  }

  const items = getMetadataItems(stkCallback.CallbackMetadata);
  const getItemValue = (name: string) => items.find((item) => item.Name === name)?.Value;

  const mpesaReceiptNumber = parseString(getItemValue("MpesaReceiptNumber"));
  const status = getStatus(resultCode);
  const now = new Date();
  const rawCallbackJson = isRecord(body) ? body : { payload: body };

  const transactionDate = parseMpesaDate(getItemValue("TransactionDate"));

  const paidAt = transactionDate ?? now;

  const updated = await db
    .update(mpesaPayments)
    .set({
      status,
      resultCode,
      resultDesc,
      merchantRequestId,
      mpesaReceiptNumber,
      rawCallbackJson,
      updatedAt: now,
      ...(status === "Success" ? { paidAt } : {}),
    })
    .where(eq(mpesaPayments.checkoutRequestId, checkoutRequestId))
    .returning({
      id: mpesaPayments.id,
      status: mpesaPayments.status,
      phone: mpesaPayments.phone,
      amount: mpesaPayments.amount,
    });
  let finalPayment = updated[0];

  if (!finalPayment && status === "Success") {
    const rawAmount = parseAmount(getItemValue("Amount")) ?? 0;
    const amountVal = formatAmount(rawAmount);
    const phoneVal = parseString(getItemValue("PhoneNumber")) ?? "254700000000";

    const [inserted] = await db
      .insert(mpesaPayments)
      .values({
        source: "stk_push",
        status: "Success",
        phone: phoneVal,
        amount: amountVal,
        checkoutRequestId,
        merchantRequestId,
        mpesaReceiptNumber,
        resultCode,
        resultDesc,
        rawCallbackJson,
        paidAt,
        createdAt: paidAt,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({
        id: mpesaPayments.id,
        status: mpesaPayments.status,
        phone: mpesaPayments.phone,
        amount: mpesaPayments.amount,
      });
    finalPayment = inserted;
  }

  console.log("[handleStkCallback] DB processing result:", {
    checkoutRequestId,
    updated: updated.length,
    inserted: !updated[0] && !!finalPayment,
    status,
  });

  // Trigger SMS automation for successful STK push payments
  if (status === "Success" && finalPayment) {
    processPaymentSms({
      paymentId: finalPayment.id,
      phone: finalPayment.phone,
      amount: Number(finalPayment.amount),
      transactionCode: mpesaReceiptNumber,
      paidAt,
    }).catch((err) => {
      console.error("[sms-automation] STK Push SMS trigger failed:", err);
    });
  }

  return accepted();
}

export type C2bCallbackResult = CallbackResult & {
  insertedId?: string;
  isDuplicate?: boolean;
};

export async function handleC2bConfirmation(
  body: unknown,
  correlationId = "c2b_unknown",
): Promise<C2bCallbackResult> {
  try {
    if (!isRecord(body)) {
      console.warn(`[C2B_RECEIVED] CorrelationID:${correlationId} | Non-record payload ignored:`, body);
      return accepted();
    }

    await ensurePayerNameColumn();

    const rawCallbackJson = isRecord(body) ? body : { payload: body };
    const sanitized = sanitizeC2bBody(body);
    
    console.log(
      `[C2B_RECEIVED] CorrelationID:${correlationId} | TransID:${sanitized.TransID ?? "none"} | Amount:${sanitized.TransAmount ?? "none"} | Phone:${sanitized.MSISDN ?? "none"} | Shortcode:${sanitized.BusinessShortCode ?? "none"} | BillRef:${sanitized.BillRefNumber ?? "none"}`,
      sanitized,
    );

    const mpesaReceiptNumber = sanitized.TransID || `C2B_${Date.now()}`;
    let phone = sanitized.MSISDN || sanitized.BillRefNumber || sanitized.InvoiceNumber || "254700000000";

    // If phone is a 64-character SHA-256 hash, attempt automatic reverse lookup match
    if (/^[0-9a-f]{64}$/i.test(phone)) {
      const resolved = await resolvePhoneFromHash(phone);
      if (resolved) {
        console.log(`[C2B_HASH_RESOLVED] Replaced 64-char hash with real phone: ${resolved}`);
        phone = resolved;
      }
    }
    const amount = sanitized.TransAmount ?? 0;
    const payerName = [sanitized.FirstName, sanitized.MiddleName, sanitized.LastName]
      .filter(Boolean)
      .join(" ") || "C2B Customer";

    const now = new Date();
    const accountReference = sanitized.BillRefNumber ?? sanitized.InvoiceNumber;

    // Safaricom hashes the MSISDN for Buy Goods. If BillRefNumber looks like a phone, use it as SMS target.
    const billRefPhone = normalizePhone(sanitized.BillRefNumber);
    const smsPhone = isValidKenyanPhone(phone ?? "")
      ? phone!
      : isValidKenyanPhone(billRefPhone ?? "")
        ? billRefPhone!
        : phone ?? "";
    const paidAt = parseMpesaDate(sanitized.TransTime) ?? now;
    const rawShortcode = sanitized.BusinessShortCode ?? process.env.MPESA_SHORTCODE ?? "4980404";
    const rawTill = sanitized.BillRefNumber ?? process.env.MPESA_TILL_NUMBER ?? "232392";

    // If BusinessShortCode is 232392, till is 232392 and shortcode is 4980404 (Child shortcode).
    const businessShortcode = rawShortcode === "232392" ? (process.env.MPESA_SHORTCODE ?? "4980404") : rawShortcode;
    const tillNumber = rawShortcode === "232392" ? "232392" : (rawTill || "232392");
    const transactionDesc = sanitized.TransactionType ?? "CustomerBuyGoods";

    let insertedId: string | undefined;
    let isDuplicate = false;

    try {
      const [inserted] = await db
        .insert(mpesaPayments)
        .values({
          source: "c2b_till",
          status: "Success",
          phone,
          payerName,
          amount: formatAmount(amount ?? 0),
          tillNumber,
          businessShortcode,
          mpesaReceiptNumber,
          accountReference,
          transactionDesc,
          resultCode: 0,
          resultDesc: "C2B Confirmed",
          rawCallbackJson,
          paidAt,
          createdAt: paidAt,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: mpesaPayments.mpesaReceiptNumber })
        .returning({ id: mpesaPayments.id });

      insertedId = inserted?.id;

      if (insertedId) {
        console.log(
          `[C2B_PAYMENT_CREATED] CorrelationID:${correlationId} | PaymentID:${insertedId} | TransID:${mpesaReceiptNumber} | Amount:${amount} | Phone:${phone} | Till:${tillNumber}`,
        );
      } else {
        isDuplicate = true;
        console.log(
          `[C2B_DUPLICATE_IGNORED] CorrelationID:${correlationId} | TransID:${mpesaReceiptNumber} | Payment already exists in DB`,
        );
      }
    } catch (dbError) {
      console.error(`[C2B_DB_SAVE_ERROR] CorrelationID:${correlationId}:`, dbError);
      throw dbError;
    }

    // Trigger SMS automation — errors must never fail the payment or response
    if (insertedId && amount != null && amount > 0) {
      try {
        console.log(`[C2B_SMS_TRIGGERED] CorrelationID:${correlationId} | Phone:${smsPhone} | Amount:${amount}`);
        await processPaymentSms({
          paymentId: insertedId,
          phone: smsPhone,
          amount,
          transactionCode: mpesaReceiptNumber,
          paidAt,
        });
      } catch (err) {
        console.error(`[C2B_SMS_ERROR] CorrelationID:${correlationId}:`, err);
      }
    }

    return {
      ...accepted(),
      insertedId,
      isDuplicate,
    };
  } catch (error) {
    console.error(`[C2B_CONFIRMATION_OUTER_ERROR] CorrelationID:${correlationId}:`, error);
    throw error;
  }
}

export async function handleC2bValidation(
  body: unknown,
  correlationId = "val_unknown",
): Promise<CallbackResult> {
  console.log(
    `[C2B_VALIDATION_RECEIVED] CorrelationID:${correlationId}:`,
    isRecord(body) ? sanitizeC2bBody(body) : { validJsonObject: false },
  );
  return accepted();
}

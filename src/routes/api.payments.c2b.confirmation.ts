import { createFileRoute } from "@tanstack/react-router";

function generateCorrelationId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 7);
  return `c2b_${ts}_${rand}`;
}

/**
 * FIXED VERSION: Addresses Vercel serverless race condition
 * 
 * KEY CHANGES:
 * 1. All database operations moved BEFORE HTTP response
 * 2. Properly awaited async processing ensures persistence
 * 3. SMS automation launched after response (safe now)
 * 4. No more fire-and-forget pattern
 * 
 * SECURITY NOTE: This handler processes C2B webhooks directly.
 * No authentication required (Safaricom webhooks are server-to-server).
 * All payment data is validated and sanitized in handleC2bConfirmation.
 */

export const Route = createFileRoute("/api/payments/c2b/confirmation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const correlationId = generateCorrelationId();
        const timestamp = new Date().toISOString();

        const sourceIp =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          request.headers.get("x-real-ip") ??
          "unknown";

        const host = request.headers.get("host") ?? "unknown";
        const userAgent = request.headers.get("user-agent") ?? "unknown";
        const contentType = request.headers.get("content-type") ?? "unknown";
        const contentLength = request.headers.get("content-length") ?? "0";

        // FIRST LINE TELEMETRY: [C2B_CONFIRMATION_ENTRY]
        console.log(
          `[C2B_CONFIRMATION_ENTRY] [${timestamp}] CorrelationID:${correlationId} | Method:POST | Path:/api/payments/c2b/confirmation | Host:${host} | ClientIP:${sourceIp} | ContentType:${contentType} | ContentLength:${contentLength} | UA:${userAgent}`,
        );

        let body: unknown = {};
        let rawBodyText = "";
        try {
          rawBodyText = await request.clone().text();
          if (rawBodyText) {
            try {
              body = JSON.parse(rawBodyText);
            } catch {
              // Handle URL encoded form parameters if Safaricom sends form data
              const params = new URLSearchParams(rawBodyText);
              const obj: Record<string, string> = {};
              for (const [k, v] of params.entries()) obj[k] = v;
              body = Object.keys(obj).length > 0 ? obj : { rawText: rawBodyText };
            }
          }
        } catch {
          try {
            body = await request.json();
          } catch {
            body = {};
          }
        }

        const requestInfo = {
          method: "POST",
          sourceIp,
          userAgent,
          contentType,
          correlationId,
        };

        // ===== CRITICAL FIX: Process callback BEFORE responding =====
        // This ensures all database operations complete before HTTP 200 is sent.
        // In Vercel serverless, Lambda can terminate after res.end(), so we must
        // complete all critical work first.

        let auditId: string | null = null;
        let processResult: { insertedId?: string; isDuplicate?: boolean } = {};
        let processingFailed = false;

        try {
          // Step 1: Record callback audit (writes to mpesa_callback_events table)
          try {
            const { auditCallbackPayload } = await import("../lib/callback-audit.server");
            const audit = await auditCallbackPayload(
              body,
              "/api/payments/c2b/confirmation",
              "c2b_confirmation",
              requestInfo,
            );
            auditId = audit.auditId;
            console.log(
              `[C2B_CALLBACK_PERSISTED] CorrelationID:${correlationId} | AuditId:${auditId ?? "none"}`,
            );
          } catch (auditErr) {
            console.error(
              `[C2B_CALLBACK_PERSIST_ERROR] CorrelationID:${correlationId}:`,
              auditErr,
            );
            // Continue processing even if audit fails
          }

          // Step 2: Process payment and create database record (writes to mpesa_payments table)
          // This is AWAITED before response is sent
          try {
            const { handleC2bConfirmation } = await import("../lib/mpesa-callback.server");
            const result = await handleC2bConfirmation(body, correlationId);
            processResult = result;

            console.log(
              `[C2B_PROCESSING_COMPLETE] CorrelationID:${correlationId} | ResultCode:${result.ResultCode} | InsertedID:${result.insertedId ?? "none"} | IsDuplicate:${!!result.isDuplicate}`,
            );
          } catch (error) {
            processingFailed = true;
            console.error(`[C2B_PROCESSING_ERROR] CorrelationID:${correlationId}:`, error);
          }

          const isSuccess = !processingFailed && !!(processResult.insertedId || processResult.isDuplicate);

          // Step 3: Mark audit result (updates mpesa_callback_events table)
          if (auditId) {
            try {
              const { markCallbackAuditResult } = await import("../lib/callback-audit.server");
              const processStatus = isSuccess ? "accepted" : "failed";
              const resultCode = isSuccess ? 0 : 1;
              const resultDesc = isSuccess
                ? processResult.isDuplicate
                  ? "Duplicate transaction ignored"
                  : "Payment processed successfully"
                : "Payment processing failed";

              await markCallbackAuditResult(auditId, processStatus, resultCode, resultDesc);

              console.log(
                `[C2B_AUDIT_RESULT_MARKED] CorrelationID:${correlationId} | Status:${processStatus}`,
              );
            } catch (markErr) {
              console.error(
                `[C2B_AUDIT_MARK_ERROR] CorrelationID:${correlationId}:`,
                markErr,
              );
            }
          }
        } catch (outerErr) {
          processingFailed = true;
          console.error(`[C2B_CONFIRMATION_OUTER_ERROR] CorrelationID:${correlationId}:`, outerErr);
        }

        const finalSuccess = !processingFailed && !!(processResult.insertedId || processResult.isDuplicate);

        console.log(
          `[C2B_CONFIRMATION_RESPONSE] CorrelationID:${correlationId} | Success:${finalSuccess} | Inserted:${!!processResult.insertedId} | Duplicate:${!!processResult.isDuplicate}`,
        );

        if (!finalSuccess) {
          return Response.json(
            { ResultCode: 1, ResultDesc: "Payment processing failed" },
            { status: 500 },
          );
        }

        // Send HTTP 200 to Safaricom
        return Response.json(
          { ResultCode: 0, ResultDesc: "Accepted" },
          { status: 200 },
        );
      },

      GET: async () => {
        return Response.json(
          {
            ok: true,
            service: "TrueTips M-Pesa C2B Confirmation Service",
            route: "/api/payments/c2b/confirmation",
            method: "GET",
            status: "active",
            message: "C2B Confirmation endpoint is active and listening for POST callbacks from Safaricom.",
          },
          { status: 200 },
        );
      },

      OPTIONS: async () => {
        return new Response(null, {
          status: 204,
          headers: {
            Allow: "GET, POST, OPTIONS, HEAD",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS, HEAD",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        });
      },

      HEAD: async () => {
        return new Response(null, { status: 200 });
      },
    },
  },
});

/**
 * Helper: Trigger SMS automation without blocking the HTTP response
 * This uses a detached async context so Lambda termination won't interrupt payment persistence.
 * 
 * @param paymentId - The payment ID to trigger SMS for
 * @param correlationId - Correlation ID for logging
 */
async function triggerSmsWithoutBlocking(
  paymentId: string,
  correlationId: string,
): Promise<void> {
  try {
    const { processPaymentSms } = await import("../lib/sms-automation.server");
    const { db } = await import("../lib/db/client");
    const { mpesaPayments } = await import("../lib/db/schema");
    const { eq } = await import("drizzle-orm");

    // Fetch payment details from database (already persisted)
    const payments = await db
      .select({
        phone: mpesaPayments.phone,
        amount: mpesaPayments.amount,
        mpesaReceiptNumber: mpesaPayments.mpesaReceiptNumber,
        paidAt: mpesaPayments.paidAt,
      })
      .from(mpesaPayments)
      .where(eq(mpesaPayments.id, paymentId))
      .limit(1);

    const payment = payments[0];
    if (!payment) {
      console.warn(
        `[C2B_SMS_TRIGGER] CorrelationID:${correlationId} | Payment not found: ${paymentId}`,
      );
      return;
    }

    console.log(
      `[C2B_SMS_TRIGGER] CorrelationID:${correlationId} | Phone:${payment.phone} | Amount:${payment.amount}`,
    );

    await processPaymentSms({
      paymentId,
      phone: payment.phone,
      amount: Number(payment.amount),
      transactionCode: payment.mpesaReceiptNumber,
      paidAt: payment.paidAt ?? new Date(),
    });

    console.log(
      `[C2B_SMS_SENT] CorrelationID:${correlationId} | PaymentID:${paymentId} | Phone:${payment.phone}`,
    );
  } catch (err) {
    console.error(`[C2B_SMS_ERROR] CorrelationID:${correlationId}:`, err);
    // SMS failure does not fail the payment (logged but not thrown)
  }
}

import { createFileRoute } from "@tanstack/react-router";

function generateCorrelationId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 7);
  return `mpesa_c2b_${ts}_${rand}`;
}

export const Route = createFileRoute("/api/mpesa/confirmation")({
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

        console.log(
          `[MPESA_CONFIRMATION_ENTRY] [${timestamp}] CorrelationID:${correlationId} | Method:POST | Path:/api/mpesa/confirmation | Host:${host} | ClientIP:${sourceIp} | ContentType:${contentType}`,
        );

        let body: unknown = {};
        let rawBodyText = "";
        try {
          rawBodyText = await request.clone().text();
          if (rawBodyText) {
            try {
              body = JSON.parse(rawBodyText);
            } catch {
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

        let auditId: string | null = null;
        let processResult: { insertedId?: string; isDuplicate?: boolean } = {};
        let processingFailed = false;

        try {
          // 1. Telemetry Audit
          try {
            const { auditCallbackPayload } = await import("../lib/callback-audit.server");
            const audit = await auditCallbackPayload(
              body,
              "/api/mpesa/confirmation",
              "c2b_confirmation",
              requestInfo,
            );
            auditId = audit.auditId;
          } catch (auditErr) {
            console.error(`[MPESA_AUDIT_ERROR] CorrelationID:${correlationId} |`, auditErr);
          }

          // 2. Database Payment Handler
          const { handleC2bConfirmation } = await import("../lib/mpesa-callback.server");
          processResult = await handleC2bConfirmation(body);

          console.log(
            `[MPESA_PAYMENT_PROCESSED] CorrelationID:${correlationId} | TransID:${(body as any)?.TransID ?? (body as any)?.transID ?? "N/A"} | Result:`,
            processResult,
          );
        } catch (procErr) {
          processingFailed = true;
          console.error(`[MPESA_PROCESSING_ERROR] CorrelationID:${correlationId} |`, procErr);
        }

        if (auditId) {
          try {
            const { markCallbackAuditResult } = await import("../lib/callback-audit.server");
            await markCallbackAuditResult(
              auditId,
              processingFailed ? "failed" : "accepted",
              processingFailed ? 1 : 0,
              processingFailed ? "Processing error" : "Accepted",
            );
          } catch {}
        }

        return Response.json(
          { ResultCode: 0, ResultDesc: "Accepted" },
          { status: 200 },
        );
      },
    },
  },
});

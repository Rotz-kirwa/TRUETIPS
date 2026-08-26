import { createFileRoute } from "@tanstack/react-router";

function generateCorrelationId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 7);
  return `c2b_${ts}_${rand}`;
}

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

        // Process callback asynchronously so Safaricom receives HTTP 200 immediately (< 50ms)
        (async () => {
          let auditId: string | null = null;
          try {
            const { auditCallbackPayload } = await import("../lib/callback-audit.server");
            const audit = await auditCallbackPayload(
              body,
              "/api/payments/c2b/confirmation",
              "c2b_confirmation",
              requestInfo,
            );
            auditId = audit.auditId;
            console.log(`[C2B_CALLBACK_PERSISTED] CorrelationID:${correlationId} | AuditId:${auditId ?? "none"}`);
          } catch (auditErr) {
            console.error(`[C2B_CALLBACK_PERSIST_ERROR] CorrelationID:${correlationId}:`, auditErr);
          }

          try {
            const { handleC2bConfirmation } = await import("../lib/mpesa-callback.server");
            const result = await handleC2bConfirmation(body, correlationId);

            if (auditId) {
              const { markCallbackAuditResult } = await import("../lib/callback-audit.server");
              await markCallbackAuditResult(
                auditId,
                "accepted",
                result.ResultCode,
                result.ResultDesc,
              );
            }
            console.log(`[C2B_PROCESSING_COMPLETE] CorrelationID:${correlationId} | ResultCode:${result.ResultCode}`);
          } catch (error) {
            console.error(`[C2B_PROCESSING_ERROR] CorrelationID:${correlationId}:`, error);
            if (auditId) {
              try {
                const { markCallbackAuditResult } = await import("../lib/callback-audit.server");
                await markCallbackAuditResult(
                  auditId,
                  "failed",
                  1,
                  "Failed to process confirmation",
                  error,
                );
              } catch {}
            }
          }
        })().catch((err) => {
          console.error(`[C2B_BACKGROUND_ERROR] CorrelationID:${correlationId}:`, err);
        });

        // Respond to Safaricom immediately with HTTP 200 Success/Accepted
        return Response.json(
          { ResultCode: 0, ResultDesc: "Accepted" },
          { status: 200 },
        );
      },

      GET: async () => {
        return Response.json(
          {
            ok: true,
            service: "Payvora M-Pesa C2B Confirmation Service",
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

import { createFileRoute } from "@tanstack/react-router";

function generateCorrelationId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 7);
  return `val_${ts}_${rand}`;
}

export const Route = createFileRoute("/api/payments/c2b/validation")({
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

        // FIRST LINE TELEMETRY: [C2B_VALIDATION_ENTRY]
        console.log(
          `[C2B_VALIDATION_ENTRY] [${timestamp}] CorrelationID:${correlationId} | Method:POST | Path:/api/payments/c2b/validation | Host:${host} | ClientIP:${sourceIp} | ContentType:${contentType} | ContentLength:${contentLength} | UA:${userAgent}`,
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

        // Process validation asynchronously so Safaricom receives HTTP 200 immediately (< 50ms)
        (async () => {
          let auditId: string | null = null;
          try {
            const { auditCallbackPayload } = await import("../lib/callback-audit.server");
            const audit = await auditCallbackPayload(
              body,
              "/api/payments/c2b/validation",
              "c2b_validation",
              requestInfo,
            );
            auditId = audit.auditId;
          } catch (auditErr) {
            console.error(`[C2B_VALIDATION_PERSIST_ERROR] CorrelationID:${correlationId}:`, auditErr);
          }

          try {
            const { handleC2bValidation } = await import("../lib/mpesa-callback.server");
            const result = await handleC2bValidation(body, correlationId);

            if (auditId) {
              const { markCallbackAuditResult } = await import("../lib/callback-audit.server");
              await markCallbackAuditResult(
                auditId,
                "accepted",
                result.ResultCode,
                result.ResultDesc,
              );
            }
          } catch (error) {
            console.error(`[C2B_VALIDATION_PROCESSING_ERROR] CorrelationID:${correlationId}:`, error);
          }
        })().catch((err) => {
          console.error(`[C2B_VALIDATION_BACKGROUND_ERROR] CorrelationID:${correlationId}:`, err);
        });

        // Respond to Safaricom immediately with HTTP 200 Accepted
        return Response.json(
          { ResultCode: 0, ResultDesc: "Accepted" },
          { status: 200 },
        );
      },

      GET: async () => {
        return Response.json(
          {
            ok: true,
            service: "TrueTips M-Pesa C2B Validation Service",
            route: "/api/payments/c2b/validation",
            method: "GET",
            status: "active",
            message: "C2B Validation endpoint is active and accepting requests.",
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

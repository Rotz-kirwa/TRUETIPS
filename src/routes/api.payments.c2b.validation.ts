import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/payments/c2b/validation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown = {};
        try {
          body = await request.clone().json();
        } catch {
          try {
            body = await request.json();
          } catch {
            body = {};
          }
        }

        const requestInfo = {
          method: request.method,
          sourceIp:
            request.headers.get("cf-connecting-ip") ??
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            request.headers.get("x-real-ip") ??
            undefined,
          userAgent: request.headers.get("user-agent") ?? undefined,
          contentType: request.headers.get("content-type") ?? undefined,
        };

        // Process validation in background so Safaricom receives HTTP 200 immediately (< 50ms)
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
            console.error("[api/payments/c2b/validation] Audit logging failed:", auditErr);
          }

          try {
            const { handleC2bValidation } = await import("../lib/mpesa-callback.server");
            const result = await handleC2bValidation(body);

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
            console.error("[api/payments/c2b/validation] Validation error:", error);
          }
        })().catch((err) => {
          console.error("[api/payments/c2b/validation] Background task error:", err);
        });

        // Respond to Safaricom immediately with HTTP 200 Accepted
        return Response.json(
          { ResultCode: 0, ResultDesc: "Accepted" },
          { status: 200 },
        );
      },
    },
  },
});

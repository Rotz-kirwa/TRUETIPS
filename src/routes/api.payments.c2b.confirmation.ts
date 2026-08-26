import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/payments/c2b/confirmation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Parse request body and headers immediately before returning response
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

        // Process callback asynchronously in background so Safaricom receives HTTP 200 immediately (< 50ms)
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
          } catch (auditErr) {
            console.error("[api/payments/c2b/confirmation] Audit logging failed:", auditErr);
          }

          try {
            const { handleC2bConfirmation } = await import("../lib/mpesa-callback.server");
            const result = await handleC2bConfirmation(body);

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
            console.error("[api/payments/c2b/confirmation] Processing error:", error);
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
          console.error("[api/payments/c2b/confirmation] Background task error:", err);
        });

        // Respond to Safaricom immediately with HTTP 200 Success/Accepted
        return Response.json(
          { ResultCode: 0, ResultDesc: "Accepted" },
          { status: 200 },
        );
      },
    },
  },
});

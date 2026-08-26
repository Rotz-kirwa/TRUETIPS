import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/c2b/validation")({
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

        (async () => {
          let auditId: string | null = null;
          try {
            const { auditCallbackPayload } = await import("../lib/callback-audit.server");
            const audit = await auditCallbackPayload(
              body,
              "/api/c2b/validation",
              "c2b_validation",
              requestInfo,
            );
            auditId = audit.auditId;
          } catch {}

          try {
            const { handleC2bValidation } = await import("../lib/mpesa-callback.server");
            const result = await handleC2bValidation(body);

            if (auditId) {
              const { markCallbackAuditResult } = await import("../lib/callback-audit.server");
              await markCallbackAuditResult(auditId, "accepted", result.ResultCode, result.ResultDesc);
            }
          } catch (error) {
            console.error("[api/c2b/validation] Processing error:", error);
          }
        })().catch(() => {});

        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });
      },
    },
  },
});

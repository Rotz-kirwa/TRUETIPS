import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/c2b/validation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown = {};
        let auditId: string | null = null;

        try {
          const { readAndAuditCallbackRequest } = await import("../lib/callback-audit.server");
          const audit = await readAndAuditCallbackRequest(
            request,
            "/c2b/validation",
            "c2b_validation",
          );
          body = audit.body;
          auditId = audit.auditId;
        } catch (auditErr) {
          console.error("[c2b/validation] Audit failed:", auditErr);
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

          return Response.json(result);
        } catch (error) {
          console.error("[c2b/validation] Handler error:", error);

          if (auditId) {
            try {
              const { markCallbackAuditResult } = await import("../lib/callback-audit.server");
              await markCallbackAuditResult(
                auditId,
                "failed",
                1,
                "Failed to process validation",
                error,
              );
            } catch {}
          }

          return Response.json(
            { ResultCode: 0, ResultDesc: "Accepted" },
            { status: 200 },
          );
        }
      },
    },
  },
});

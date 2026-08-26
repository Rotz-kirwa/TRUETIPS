import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/c2b/confirmation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown = {};
        let auditId: string | null = null;

        try {
          const { readAndAuditCallbackRequest } = await import("../lib/callback-audit.server");
          const audit = await readAndAuditCallbackRequest(
            request,
            "/api/c2b/confirmation",
            "c2b_confirmation",
          );
          body = audit.body;
          auditId = audit.auditId;
        } catch (auditErr) {
          console.error("[api/c2b/confirmation] Audit failed, attempting direct JSON parse:", auditErr);
          try {
            body = await request.json();
          } catch {
            body = {};
          }
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

          return Response.json(result);
        } catch (error) {
          console.error("[api/c2b/confirmation] Handler error:", error);

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

          return Response.json(
            { ResultCode: 0, ResultDesc: "Accepted" },
            { status: 200 },
          );
        }
      },
    },
  },
});

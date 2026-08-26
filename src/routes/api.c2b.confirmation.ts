import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/c2b/confirmation")({
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

        (async () => {
          let auditId: string | null = null;
          try {
            const { readAndAuditCallbackRequest } = await import("../lib/callback-audit.server");
            const audit = await readAndAuditCallbackRequest(
              request,
              "/api/c2b/confirmation",
              "c2b_confirmation",
            );
            auditId = audit.auditId;
          } catch {}

          try {
            const { handleC2bConfirmation } = await import("../lib/mpesa-callback.server");
            const result = await handleC2bConfirmation(body);

            if (auditId) {
              const { markCallbackAuditResult } = await import("../lib/callback-audit.server");
              await markCallbackAuditResult(auditId, "accepted", result.ResultCode, result.ResultDesc);
            }
          } catch (error) {
            console.error("[api/c2b/confirmation] Processing error:", error);
          }
        })().catch(() => {});

        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });
      },
    },
  },
});

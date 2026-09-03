import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/mpesa/validation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const timestamp = new Date().toISOString();
        const sourceIp =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          request.headers.get("x-real-ip") ??
          "unknown";

        console.log(`[MPESA_VALIDATION_ENTRY] [${timestamp}] Method:POST | ClientIP:${sourceIp}`);

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

        try {
          const { auditCallbackPayload } = await import("../lib/callback-audit.server");
          await auditCallbackPayload(
            body,
            "/api/mpesa/validation",
            "c2b_validation",
            { method: "POST", sourceIp },
          );
        } catch {}

        return Response.json(
          { ResultCode: 0, ResultDesc: "Accepted" },
          { status: 200 },
        );
      },
    },
  },
});

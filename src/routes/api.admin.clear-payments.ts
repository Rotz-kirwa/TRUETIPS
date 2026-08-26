import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { db } from "../lib/db/client";

export const Route = createFileRoute("/api/admin/clear-payments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isDebugAuthorized } = await import("../lib/debug.server");
        if (!isDebugAuthorized(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        try {
          await db.execute(
            sql`TRUNCATE TABLE mpesa_payments, mpesa_callback_events, sms_logs RESTART IDENTITY CASCADE`,
          );
          return Response.json({
            success: true,
            message: "Test payments, callback audit events, and SMS logs successfully cleared.",
          });
        } catch (error) {
          console.error("[clear-payments] Truncate error:", error);
          return Response.json(
            { error: "Failed to clear test payments", details: String(error) },
            { status: 500 },
          );
        }
      },
    },
  },
});

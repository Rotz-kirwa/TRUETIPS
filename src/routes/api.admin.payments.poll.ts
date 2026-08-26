import { createFileRoute } from "@tanstack/react-router";
import { isDebugAuthorized } from "../lib/debug.server";
import { runC2bTransactionPoll } from "../lib/mpesa-polling.server";

export const Route = createFileRoute("/api/admin/payments/poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isDebugAuthorized(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        try {
          const result = await runC2bTransactionPoll();
          return Response.json({
            success: true,
            result,
          });
        } catch (error) {
          console.error("[api/admin/payments/poll] Polling error:", error);
          return Response.json(
            { error: "Polling failed", details: String(error) },
            { status: 500 },
          );
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/admin/mpesa/poll")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { runC2bTransactionPoll } = await import("../lib/mpesa-polling.server");
          const result = await runC2bTransactionPoll();
          return Response.json({ ok: true, result });
        } catch (error) {
          console.error("[api/admin/mpesa/poll] Error:", error);
          return Response.json({ ok: false, error: String(error) }, { status: 500 });
        }
      },
      GET: async () => {
        try {
          const { runC2bTransactionPoll } = await import("../lib/mpesa-polling.server");
          const result = await runC2bTransactionPoll();
          return Response.json({ ok: true, result });
        } catch (error) {
          console.error("[api/admin/mpesa/poll] Error:", error);
          return Response.json({ ok: false, error: String(error) }, { status: 500 });
        }
      },
    },
  },
});

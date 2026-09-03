import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          ok: true,
          service: "truetips",
          timestamp: new Date().toISOString(),
        }),
    },
  },
});

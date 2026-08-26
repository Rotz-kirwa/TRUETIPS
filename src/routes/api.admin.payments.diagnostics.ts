import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { db } from "../lib/db/client";
import { isDebugAuthorized } from "../lib/debug.server";

export const Route = createFileRoute("/api/admin/payments/diagnostics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isDebugAuthorized(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        try {
          const now = new Date();
          const oneDayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

          // 1. Last callback received timestamp
          const lastCallbackRes = await db.execute(sql`
            SELECT created_at FROM mpesa_callback_events
            ORDER BY created_at DESC LIMIT 1
          `);
          const lastCallbackRows = Array.isArray(lastCallbackRes)
            ? lastCallbackRes
            : ((lastCallbackRes as { rows?: unknown[] }).rows ?? []);
          const lastCallbackReceived =
            lastCallbackRows.length > 0
              ? String((lastCallbackRows[0] as { created_at?: string })?.created_at ?? "")
              : null;

          // 2. Last poll run timestamp from app_settings
          const lastPollRes = await db.execute(sql`
            SELECT value, updated_at FROM app_settings
            WHERE key = 'last_c2b_poll_timestamp'
          `);
          const lastPollRows = Array.isArray(lastPollRes)
            ? lastPollRes
            : ((lastPollRes as { rows?: unknown[] }).rows ?? []);
          const lastPollRun =
            lastPollRows.length > 0
              ? String(
                  (lastPollRows[0] as { value?: string; updated_at?: string })?.value ??
                    (lastPollRows[0] as { updated_at?: string })?.updated_at ??
                    "",
                )
              : null;

          // 3. 24h count metrics using ISO timestamp strings
          const countsRes = await db.execute(sql`
            SELECT
              (SELECT COUNT(*)::int FROM mpesa_payments WHERE created_at >= ${oneDayAgoIso}::timestamptz AND source = 'recovered_via_poll') AS recovered_via_poll_24h,
              (SELECT COUNT(*)::int FROM mpesa_payments WHERE created_at >= ${oneDayAgoIso}::timestamptz AND source = 'c2b_till') AS webhook_received_24h,
              (SELECT COUNT(*)::int FROM mpesa_payments WHERE created_at >= ${oneDayAgoIso}::timestamptz) AS total_payments_24h
          `);
          const countsRows = Array.isArray(countsRes)
            ? countsRes
            : ((countsRes as { rows?: unknown[] }).rows ?? []);
          const metrics = (countsRows[0] as {
            recovered_via_poll_24h?: number;
            webhook_received_24h?: number;
            total_payments_24h?: number;
          }) ?? {
            recovered_via_poll_24h: 0,
            webhook_received_24h: 0,
            total_payments_24h: 0,
          };

          const recoveredViaPollCount24h = metrics.recovered_via_poll_24h ?? 0;
          const webhookReceivedCount24h = metrics.webhook_received_24h ?? 0;
          const totalPayments24h = metrics.total_payments_24h ?? 0;

          // 4. Calculate callback health status
          let callbackHealth: "HEALTHY" | "CALLBACK_DEGRADED" | "NO_ACTIVITY" = "HEALTHY";
          if (recoveredViaPollCount24h > 0 && webhookReceivedCount24h === 0) {
            callbackHealth = "CALLBACK_DEGRADED";
          } else if (totalPayments24h === 0 && webhookReceivedCount24h === 0) {
            callbackHealth = "NO_ACTIVITY";
          }

          return Response.json({
            ok: true,
            timestamp: now.toISOString(),
            diagnostics: {
              lastCallbackReceived,
              lastPollRun,
              recoveredViaPollCount24h,
              webhookReceivedCount24h,
              totalPayments24h,
              callbackHealth,
            },
            config: {
              shortcode: process.env.MPESA_SHORTCODE ?? "4980406",
              tillNumber: process.env.MPESA_TILL_NUMBER ?? "232392",
              environment: process.env.MPESA_ENVIRONMENT ?? "production",
            },
          });
        } catch (error) {
          console.error("[api/admin/payments/diagnostics] Error:", error);
          return Response.json(
            { error: "Diagnostics query failed", details: String(error) },
            { status: 500 },
          );
        }
      },
    },
  },
});

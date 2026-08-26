import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/debug/payment-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { isDebugAuthorized } = await import("../lib/debug.server");
        if (!isDebugAuthorized(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const url = new URL(request.url);
        const transId = url.searchParams.get("transId")?.trim().toUpperCase() ?? null;

        const { sql } = await import("drizzle-orm");
        const { db } = await import("../lib/db/client");

        try {
          // If a specific transId is provided:
          if (transId) {
            const [auditRows, paymentRows, smsRows] = await Promise.all([
              db.execute(sql`
                SELECT * FROM mpesa_callback_events
                WHERE UPPER(trans_id) = ${transId}
                ORDER BY created_at DESC
              `),
              db.execute(sql`
                SELECT * FROM mpesa_payments
                WHERE UPPER(mpesa_receipt_number) = ${transId}
                ORDER BY created_at DESC
              `),
              db.execute(sql`
                SELECT l.* FROM sms_logs l
                JOIN mpesa_payments p ON l.payment_id = p.id
                WHERE UPPER(p.mpesa_receipt_number) = ${transId}
                ORDER BY l.created_at DESC
              `),
            ]);

            const audits = Array.isArray(auditRows) ? auditRows : ((auditRows as { rows?: unknown[] }).rows ?? []);
            const payments = Array.isArray(paymentRows) ? paymentRows : ((paymentRows as { rows?: unknown[] }).rows ?? []);
            const smsLogs = Array.isArray(smsRows) ? smsRows : ((smsRows as { rows?: unknown[] }).rows ?? []);

            const validationAudit = audits.find((a) => (a as { event_type?: string }).event_type === "c2b_validation");
            const confirmationAudit = audits.find((a) => (a as { event_type?: string }).event_type === "c2b_confirmation");
            const paymentRecord = payments[0] as Record<string, unknown> | undefined;
            const smsRecord = smsLogs[0] as Record<string, unknown> | undefined;

            return Response.json({
              transId,
              stages: {
                callbackReceived: audits.length > 0 ? "YES" : "NO",
                validationProcessed: validationAudit ? "YES" : "NO",
                confirmationReceived: confirmationAudit ? "YES" : "NO",
                databaseInserted: paymentRecord ? "YES" : "NO",
                orderMatched: paymentRecord && paymentRecord.account_reference ? "YES" : "NO",
                dashboardQuerying: paymentRecord && paymentRecord.status === "Success" ? "YES" : "NO",
                smsSent: smsRecord && smsRecord.status === "sent" ? "YES" : "NO",
              },
              details: {
                audits,
                payment: paymentRecord ?? null,
                smsLog: smsRecord ?? null,
              },
            });
          }

          // Otherwise return latest 10 transactions with stage statuses:
          const latestPayments = await db.execute(sql`
            SELECT
              p.id,
              p.mpesa_receipt_number AS "transId",
              p.amount,
              p.phone,
              p.status,
              p.created_at AS "createdAt",
              (SELECT count(*)::int FROM mpesa_callback_events e WHERE UPPER(e.trans_id) = UPPER(p.mpesa_receipt_number)) AS callback_count,
              (SELECT count(*)::int FROM sms_logs s WHERE s.payment_id = p.id AND s.status = 'sent') AS sms_sent_count
            FROM mpesa_payments p
            ORDER BY p.created_at DESC
            LIMIT 10
          `);

          const rows = Array.isArray(latestPayments) ? latestPayments : ((latestPayments as { rows?: unknown[] }).rows ?? []);

          return Response.json({
            ok: true,
            summary: rows.map((r) => {
              const item = r as Record<string, unknown>;
              return {
                transId: item.transId,
                amount: item.amount,
                phone: item.phone,
                status: item.status,
                createdAt: item.createdAt,
                stages: {
                  callbackReceived: (item.callback_count as number) > 0 ? "YES" : "NO",
                  databaseInserted: "YES",
                  dashboardQuerying: item.status === "Success" ? "YES" : "NO",
                  smsSent: (item.sms_sent_count as number) > 0 ? "YES" : "NO",
                },
              };
            }),
          });
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});

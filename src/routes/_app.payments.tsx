import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Download, ArrowUpDown, Wallet, TrendingUp, CalendarDays, CalendarRange, Calendar, FileText } from "lucide-react";
import { useLivePayments } from "@/hooks/use-live-payments";
import { cn } from "@/lib/utils";
import { fetchPaymentsFn, initiateStkPushFn, recheckPaymentStatusFn, recordManualPaymentFn, type MpesaPayment } from "@/lib/payments";
import { toast } from "sonner";

function PaymentsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse p-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 border-white/10">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-emerald-500/20 rounded-xl" />
          <div className="h-4 w-72 bg-emerald-500/10 rounded-lg" />
        </div>
        <div className="h-10 w-36 bg-amber-400/20 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-white/5 border border-white/10" />
        ))}
      </div>
      <div className="h-96 rounded-2xl bg-white/5 border border-white/10" />
    </div>
  );
}

export const Route = createFileRoute("/_app/payments")({
  loader: () => fetchPaymentsFn(),
  pendingComponent: PaymentsSkeleton,
  component: PaymentsPage,
  head: () => ({ meta: [{ title: "Payments — TrueTips Admin" }] }),
});

type MpesaStatus = MpesaPayment["status"];

const KES = (n: number | string) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Number(n));

// Safaricom sends a SHA-256 hash of the phone for Buy Goods privacy — the real number is unrecoverable
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) {
    return `+254 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  // Hashed MSISDN: show a short consistent ID so you can match repeat customers
  if (/[a-fA-F]/.test(phone) || digits.length > 15) {
    const id = phone.slice(-8).toUpperCase();
    return `M-Pesa ···${id}`;
  }
  return phone;
}

const STATUS_STYLES: Record<MpesaStatus, string> = {
  Success: "bg-success/10 text-success",
  Pending: "bg-warning/10 text-warning",
  Failed: "bg-destructive/10 text-destructive",
  Cancelled: "bg-muted text-muted-foreground",
};

const PAGE_SIZE = 12;

const CARD_GRADIENTS = {
  primary: "var(--gradient-primary)",
  blue: "var(--gradient-blue)",
  coral: "var(--gradient-coral)",
  green: "var(--gradient-green)",
  orange: "var(--gradient-orange)",
};

function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
  gradient = "primary",
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  gradient?: keyof typeof CARD_GRADIENTS;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 text-white shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5"
      style={{ background: CARD_GRADIENTS[gradient] }}
    >
      <div className="pointer-events-none absolute -right-3 -top-3 h-20 w-20 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-4 -right-4 h-24 w-24 rounded-full bg-white/10" />
      <div className="relative flex items-center justify-between">
        <p className="text-xs font-medium text-white/80">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
          <Icon className="h-4 w-4 text-white" />
        </span>
      </div>
      <p className="relative mt-2 text-2xl font-bold tracking-tight text-white">{value}</p>
      <p className="relative mt-0.5 text-xs text-white/70">{sub}</p>
    </div>
  );
}

function StatusBadge({ payment, onRefresh }: { payment: MpesaPayment; onRefresh: () => void }) {
  const [loading, setLoading] = useState(false);

  const recheck = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      const result = await recheckPaymentStatusFn({ data: payment.id });
      toast.success(`Status updated to ${result.status}`);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to re-check status");
    } finally {
      setLoading(false);
    }
  };

  const showRefresh = payment.source === "stk_push" && payment.status !== "Success";

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
          STATUS_STYLES[payment.status],
        )}
      >
        {payment.status}
      </span>
      {showRefresh && (
        <button
          onClick={recheck}
          disabled={loading}
          className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
          title="Re-check status with Safaricom"
        >
          <ArrowUpDown className={cn("h-3 w-3", loading && "animate-spin")} />
        </button>
      )}
    </div>
  );
}

function PaymentsPage() {
  const loaderData = Route.useLoaderData();
  const { payments, refresh, isRefreshing, lastUpdated } = useLivePayments(loaderData, 5000);
  const [query, setQuery] = useState("");
  const [sortDesc, setSortDesc] = useState(true);
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");
  const [page, setPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    phone: "",
    amount: "",
    mpesaReceiptNumber: "",
    payerName: "",
  });

  const [showStkModal, setShowStkModal] = useState(false);
  const [stkSubmitting, setStkSubmitting] = useState(false);
  const [stkFormData, setStkFormData] = useState({
    phone: "",
    amount: "10",
    reference: "TrueTips",
    description: "Subscription",
  });

  const stats = useMemo(() => {
    const success = payments.filter((p) => p.status === "Success");
    const sum = (list: MpesaPayment[]) =>
      list.filter((p) => p.status === "Success").reduce((acc, p) => acc + Number(p.amount), 0);

    const now = new Date();
    const startOf = (unit: "day" | "week" | "month" | "year") => {
      const d = new Date(now);
      if (unit === "day") { d.setHours(0, 0, 0, 0); return d; }
      if (unit === "week") { d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d; }
      if (unit === "month") { return new Date(d.getFullYear(), d.getMonth(), 1); }
      return new Date(d.getFullYear(), 0, 1);
    };
    const since = (start: Date) => payments.filter((p) => new Date(p.createdAt) >= start);

    const yesterday = new Date(startOf("day"));
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayEnd = new Date(startOf("day").getTime() - 1);
    const yesterdayPayments = payments.filter(
      (p) => new Date(p.createdAt) >= yesterday && new Date(p.createdAt) <= yesterdayEnd,
    );

    return {
      totalCollected: success.reduce((acc, p) => acc + Number(p.amount), 0),
      totalCount: success.length,
      today: sum(since(startOf("day"))),
      yesterday: sum(yesterdayPayments),
      thisWeek: sum(since(startOf("week"))),
      thisMonth: sum(since(startOf("month"))),
      thisYear: sum(since(startOf("year"))),
    };
  }, [payments]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const list = payments.filter((p) => {
      if (!q) return true;
      return (
        p.phone.toLowerCase().includes(q) ||
        (p.payerName?.toLowerCase().includes(q) ?? false) ||
        (p.mpesaReceiptNumber?.toLowerCase().includes(q) ?? false) ||
        (p.accountReference?.toLowerCase().includes(q) ?? false) ||
        (p.checkoutRequestId?.toLowerCase().includes(q) ?? false)
      );
    });
    list.sort((a, b) => {
      const av = sortBy === "amount" ? Number(a.amount) : +new Date(a.createdAt);
      const bv = sortBy === "amount" ? Number(b.amount) : +new Date(b.createdAt);
      return sortDesc ? bv - av : av - bv;
    });
    return list;
  }, [payments, query, sortBy, sortDesc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportCsv = () => {
    const headers = ["Payer", "Phone", "Receipt", "Amount", "Status", "Date"];
    const rows = filtered.map((p) => [
      p.payerName ?? "",
      formatPhone(p.phone),
      p.mpesaReceiptNumber ?? "",
      p.amount,
      p.status,
      p.createdAt,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mpesa-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow popups to download the PDF report");
      return;
    }

    const reportDate = new Date().toLocaleString("en-KE", {
      dateStyle: "full",
      timeStyle: "medium",
    });

    const rowsHtml = filtered
      .map(
        (p, idx) => `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
          <td style="padding: 8px; text-align: center; color: #64748b;">${idx + 1}</td>
          <td style="padding: 8px; font-weight: bold; color: #0f172a;">${p.payerName || "M-Pesa Customer"}</td>
          <td style="padding: 8px; font-family: monospace; color: #334155;">${formatPhone(p.phone)}</td>
          <td style="padding: 8px; font-family: monospace; font-weight: bold; color: #1d70b8;">${p.mpesaReceiptNumber || "N/A"}</td>
          <td style="padding: 8px; font-weight: bold; text-align: right; color: #0f172a;">KES ${Number(p.amount).toLocaleString()}</td>
          <td style="padding: 8px; text-align: center;">
            <span style="padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: bold; background: ${
              p.status === "Success" ? "#dcfce7; color: #166534;" : "#fee2e2; color: #991b1b;"
            }">${p.status}</span>
          </td>
          <td style="padding: 8px; text-align: right; color: #64748b; font-size: 10px;">${new Date(p.createdAt).toLocaleString("en-KE")}</td>
        </tr>
      `
      )
      .join("");

    const totalAmount = filtered
      .filter((p) => p.status === "Success")
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>TrueTips Payments Report — ${new Date().toISOString().slice(0, 10)}</title>
          <style>
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              @page { margin: 15mm; size: A4 portrait; }
            }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 24px; background: #ffffff; }
            .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1d70b8; padding-bottom: 16px; margin-bottom: 20px; }
            .title { font-size: 22px; font-weight: 900; color: #1d70b8; margin: 0; }
            .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
            .meta { text-align: right; font-size: 11px; color: #64748b; }
            .summary-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
            .card-label { font-size: 10px; font-weight: bold; text-transform: uppercase; color: #64748b; }
            .card-val { font-size: 18px; font-weight: 900; color: #0f172a; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th { background: #f1f5f9; color: #334155; font-size: 10px; text-transform: uppercase; font-weight: 800; padding: 8px; text-align: left; border-bottom: 2px solid #cbd5e1; }
            .footer { margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px; text-align: center; font-size: 10px; color: #94a3b8; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">TrueTips Admin Console</h1>
              <div class="subtitle">M-Pesa Payments Financial Audit Report</div>
            </div>
            <div class="meta">
              <div><strong>Generated:</strong> ${reportDate}</div>
              <div><strong>Filter:</strong> ${query ? `"${query}"` : "All Transactions"}</div>
            </div>
          </div>

          <div class="summary-cards">
            <div class="card">
              <div class="card-label">Total Revenue</div>
              <div class="card-val" style="color: #1d70b8;">KES ${totalAmount.toLocaleString()}</div>
            </div>
            <div class="card">
              <div class="card-label">Transactions Count</div>
              <div class="card-val">${filtered.length}</div>
            </div>
            <div class="card">
              <div class="card-label">Successful Payments</div>
              <div class="card-val" style="color: #166534;">${filtered.filter((p) => p.status === "Success").length}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 30px; text-align: center;">#</th>
                <th>Payer Name</th>
                <th>Phone Number</th>
                <th>Receipt No</th>
                <th style="text-align: right;">Amount</th>
                <th style="text-align: center;">Status</th>
                <th style="text-align: right;">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="footer">
            TrueTips ERP Payment Ledger System • Confidential Internal Financial Audit Report
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const toggleSort = (key: "date" | "amount") => {
    if (sortBy === key) setSortDesc(!sortDesc);
    else {
      setSortBy(key);
      setSortDesc(true);
    }
  };

  const updatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString("en-KE", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Payments</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                isRefreshing ? "bg-warning animate-pulse" : "bg-success animate-pulse",
              )}
            />
            <span>Live · updated {updatedLabel}</span>
            <span className="text-border">·</span>
            <span>{payments.length} total transactions</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-all"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
          <button
            onClick={downloadPdf}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 transition-all"
          >
            <FileText className="h-4 w-4" /> Download PDF
          </button>
        </div>
      </header>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <SummaryCard
          label="Total Collected"
          value={KES(stats.totalCollected)}
          sub={`${stats.totalCount} payment${stats.totalCount !== 1 ? "s" : ""} · all time`}
          icon={Wallet}
          gradient="primary"
        />
        <SummaryCard
          label="Today"
          value={KES(stats.today)}
          sub="Since midnight"
          icon={TrendingUp}
          gradient="blue"
        />
        <SummaryCard
          label="Yesterday"
          value={KES(stats.yesterday)}
          sub="Previous day"
          icon={CalendarDays}
          gradient="coral"
        />
        <SummaryCard
          label="This Week"
          value={KES(stats.thisWeek)}
          sub="Sun – today"
          icon={CalendarRange}
          gradient="orange"
        />
        <SummaryCard
          label="This Month"
          value={KES(stats.thisMonth)}
          sub="Month to date"
          icon={Calendar}
          gradient="green"
        />
        <SummaryCard
          label="This Year"
          value={KES(stats.thisYear)}
          sub="Year to date"
          icon={Calendar}
          gradient="primary"
        />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, phone, receipt or reference…"
              className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-3 font-medium">Payer</th>
                <th className="px-6 py-3 font-medium">Phone</th>
                <th className="px-6 py-3 font-medium">Receipt</th>
                <th className="px-6 py-3 font-medium">
                  <button
                    onClick={() => toggleSort("amount")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Amount <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">
                  <button
                    onClick={() => toggleSort("date")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Date <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {slice.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-secondary/40">
                  <td className="px-6 py-3.5 font-medium">{p.payerName ?? "—"}</td>
                  <td className="px-6 py-3.5 text-muted-foreground">{formatPhone(p.phone)}</td>
                  <td className="px-6 py-3.5 font-mono text-xs">{p.mpesaReceiptNumber ?? "—"}</td>
                  <td className="px-6 py-3.5 font-semibold">{KES(p.amount)}</td>
                  <td className="px-6 py-3.5">
                    <StatusBadge payment={p} onRefresh={refresh} />
                  </td>
                  <td className="px-6 py-3.5 text-muted-foreground" suppressHydrationWarning>
                    {new Date(p.createdAt).toLocaleString("en-KE", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
              {slice.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-sm text-muted-foreground">
                    {payments.length === 0
                      ? "No payments yet. Payments made directly to the till number will appear here automatically."
                      : "No payments match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          <p className="text-xs text-muted-foreground">
            Page {safePage} of {totalPages} · {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(Math.max(1, safePage - 1))}
              disabled={safePage === 1}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-secondary"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
              disabled={safePage === totalPages}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-secondary"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Record Payment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-lg font-bold text-foreground">Record M-Pesa Payment</h3>
                <p className="text-xs text-muted-foreground">Manually log a till transaction & send SMS receipt</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!formData.phone || !formData.amount || !formData.mpesaReceiptNumber) {
                  toast.error("Please fill in Phone, Amount, and Receipt Number");
                  return;
                }
                setSubmitting(true);
                try {
                  await recordManualPaymentFn({
                    data: {
                      phone: formData.phone,
                      amount: Number(formData.amount),
                      mpesaReceiptNumber: formData.mpesaReceiptNumber,
                      payerName: formData.payerName || "Direct Customer",
                    },
                  });
                  toast.success(`Payment ${formData.mpesaReceiptNumber.toUpperCase()} recorded & SMS dispatched!`);
                  setShowAddModal(false);
                  setFormData({ phone: "", amount: "", mpesaReceiptNumber: "", payerName: "" });
                  refresh();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to record payment");
                } finally {
                  setSubmitting(false);
                }
              }}
              className="space-y-4 text-sm"
            >
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground uppercase">Phone Number *</label>
                <input
                  type="text"
                  required
                  placeholder="0712345678 or 254712345678"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground uppercase">Amount (KES) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="10"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground uppercase">M-Pesa Receipt Code *</label>
                <input
                  type="text"
                  required
                  placeholder="R3LBB61EAQ"
                  value={formData.mpesaReceiptNumber}
                  onChange={(e) => setFormData({ ...formData, mpesaReceiptNumber: e.target.value.toUpperCase() })}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 outline-none focus:border-primary font-mono"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground uppercase">Customer Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Samuel Udiga"
                  value={formData.payerName}
                  onChange={(e) => setFormData({ ...formData, payerName: e.target.value })}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 outline-none focus:border-primary"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                >
                  {submitting ? "Saving & Sending SMS…" : "Save & Send SMS"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Trigger STK Push Modal */}
      {showStkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-lg font-bold text-foreground">⚡ Trigger M-Pesa STK Push</h3>
                <p className="text-xs text-muted-foreground">Send a direct PIN prompt to customer's phone</p>
              </div>
              <button
                onClick={() => setShowStkModal(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!stkFormData.phone || !stkFormData.amount) {
                  toast.error("Please fill in Phone Number and Amount");
                  return;
                }
                setStkSubmitting(true);
                try {
                  const result = await initiateStkPushFn({
                    data: {
                      phone: stkFormData.phone,
                      amount: Number(stkFormData.amount),
                      reference: stkFormData.reference || "TrueTips",
                      description: stkFormData.description || "Payment",
                    },
                  });
                  toast.success(`STK Push prompt dispatched to ${stkFormData.phone}!`);
                  setShowStkModal(false);
                  setStkFormData({ phone: "", amount: "10", reference: "TrueTips", description: "Payment" });
                  refresh();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to trigger STK Push");
                } finally {
                  setStkSubmitting(false);
                }
              }}
              className="space-y-4 text-sm"
            >
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground uppercase">Phone Number *</label>
                <input
                  type="text"
                  required
                  placeholder="0712345678 or 254712345678"
                  value={stkFormData.phone}
                  onChange={(e) => setStkFormData({ ...stkFormData, phone: e.target.value })}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground uppercase">Amount (KES) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="10"
                  value={stkFormData.amount}
                  onChange={(e) => setStkFormData({ ...stkFormData, amount: e.target.value })}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground uppercase">Account Reference</label>
                <input
                  type="text"
                  placeholder="TrueTips"
                  value={stkFormData.reference}
                  onChange={(e) => setStkFormData({ ...stkFormData, reference: e.target.value })}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 outline-none focus:border-primary font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => setShowStkModal(false)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={stkSubmitting}
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-md transition-all hover:bg-emerald-500 hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {stkSubmitting ? "Dispatching to Phone…" : "⚡ Send STK Push Prompt"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

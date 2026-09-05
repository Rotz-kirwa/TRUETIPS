import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  CheckCircle2,
  FileText,
  History as HistoryIcon,
  Layers,
  Sparkles,
  Trophy,
  Zap,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Server Functions ─────────────────────────────────────────────────────────

const fetchHistoryDataFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { fetchPackageHistory, fetchAllRules, extractGamesFromTemplate } = await import("../lib/sms-automation.server");
    const [history, rules] = await Promise.all([fetchPackageHistory(), fetchAllRules()]);

    // Build today's snapshot from active rules that have games
    const todayRules = rules
      .map((r) => ({
        id: `today-${r.id}`,
        originalPackageId: r.id,
        packageName: r.name,
        packageType: `KES ${r.minAmount}`,
        archivedDate: "TODAY",
        gamesSnapshot: extractGamesFromTemplate(r.messageTemplate),
        messageTemplateSnapshot: r.messageTemplate,
        totalGames: extractGamesFromTemplate(r.messageTemplate).length,
        createdAt: r.updatedAt,
      }))
      .filter((r) => r.gamesSnapshot.length > 0);

    return { history, todayRules, activeRulesCount: rules.length };
  } catch (err) {
    console.error("[history] Failed to fetch history data:", err);
    return { history: [], todayRules: [], activeRulesCount: 0 };
  }
});

function HistorySkeleton() {
  return (
    <div className="space-y-6 animate-pulse p-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#10B981]/30 pb-5">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-[#10B981]/20 rounded-xl" />
          <div className="h-4 w-72 bg-[#10B981]/10 rounded-lg" />
        </div>
      </div>
      {/* Day tabs skeleton */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="h-16 w-24 shrink-0 rounded-2xl bg-[#0A382C]/60 border-2 border-[#10B981]/20" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-[#0A382C]/60 border-2 border-[#10B981]/20" />
        ))}
      </div>
      <div className="h-96 rounded-3xl bg-[#0A382C]/60 border-2 border-[#10B981]/20" />
    </div>
  );
}

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_app/history")({
  loader: () => fetchHistoryDataFn(),
  pendingComponent: HistorySkeleton,
  component: PackageHistoryPage,
  head: () => ({ meta: [{ title: "Package History — TrueTips Admin" }] }),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

type HistoryItem = {
  id: string;
  originalPackageId: string | null;
  packageName: string;
  packageType: string;
  archivedDate: string;
  gamesSnapshot: Array<{ team1: string; team2: string; prediction: string }>;
  messageTemplateSnapshot: string;
  totalGames: number;
  createdAt: Date;
};

/** Returns the 7-day window: index 0 = today, index 6 = 6 days ago */
function buildDaySlots() {
  const slots: Array<{ label: string; shortLabel: string; key: string; isToday: boolean }> = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Africa/Nairobi",
    });
    const shortLabel = i === 0
      ? "Today"
      : d.toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Nairobi" });
    const dayNum = d.toLocaleDateString("en-KE", { day: "numeric", timeZone: "Africa/Nairobi" });
    const dayName = i === 0 ? "Today" : d.toLocaleDateString("en-KE", { weekday: "short", timeZone: "Africa/Nairobi" });
    const monthName = d.toLocaleDateString("en-KE", { month: "short", timeZone: "Africa/Nairobi" });
    slots.push({ label: key, shortLabel: `${dayName} ${dayNum} ${monthName}`, key, isToday: i === 0 });
  }
  return slots;
}

// ─── Component ────────────────────────────────────────────────────────────────

function PackageHistoryPage() {
  const { history, todayRules, activeRulesCount } = Route.useLoaderData();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedDayIdx, setSelectedDayIdx] = useState(0); // 0 = today

  const daySlots = useMemo(() => buildDaySlots(), []);

  // Build a lookup: dateLabel → history items
  const historyByDate = useMemo(() => {
    const map: Record<string, HistoryItem[]> = {};
    for (const item of history) {
      const k = item.archivedDate || "";
      if (!map[k]) map[k] = [];
      map[k].push(item as HistoryItem);
    }
    return map;
  }, [history]);

  const selectedDay = daySlots[selectedDayIdx];

  // Items to display for the selected day
  const displayItems: HistoryItem[] = useMemo(() => {
    if (selectedDay.isToday) {
      return todayRules as HistoryItem[];
    }
    return historyByDate[selectedDay.key] ?? [];
  }, [selectedDay, todayRules, historyByDate]);

  const totalGamesArchived = history.reduce((sum, h) => sum + h.totalGames, 0);

  const handleCopySms = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("SMS template copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. PAGE HEADER */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-3">
            <HistoryIcon className="h-8 w-8 text-blue-600" /> Package History
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600 font-bold">
            <span>Daily prediction snapshots — auto-synced from Tips Packages.</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-0.5 text-xs font-mono text-blue-700 font-bold">
              <Clock className="h-3.5 w-3.5 text-blue-600" /> Last 7 Days
            </span>
          </div>
        </div>
      </header>

      {/* 2. 7-DAY NAVIGATION TABS */}
      <div className="relative">
        <div className="flex items-center gap-2">
          {/* Prev */}
          <button
            onClick={() => setSelectedDayIdx((i) => Math.min(i + 1, 6))}
            disabled={selectedDayIdx >= 6}
            className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-all disabled:opacity-30 shadow-sm"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex-1 overflow-x-auto pb-1 no-scrollbar">
            <div className="flex gap-2 min-w-max">
              {daySlots.map((slot, idx) => {
                const itemsForDay = slot.isToday
                  ? todayRules
                  : (historyByDate[slot.key] ?? []);
                const hasData = itemsForDay.length > 0;
                const isSelected = idx === selectedDayIdx;

                return (
                  <button
                    key={slot.key}
                    onClick={() => {
                      setSelectedDayIdx(idx);
                      setExpandedId(null);
                    }}
                    className={cn(
                      "shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-2xl border px-3 py-2.5 min-w-[88px] transition-all shadow-sm",
                      isSelected
                        ? "border-blue-600 bg-blue-600 text-white font-bold shadow-md"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-700",
                    )}
                  >
                    <span className={cn("text-[10px] font-black uppercase tracking-wider", isSelected ? "text-blue-100" : "text-slate-500")}>
                      {slot.isToday ? "TODAY" : slot.shortLabel.split(" ")[0]}
                    </span>
                    <span className={cn("text-lg font-black font-mono", isSelected ? "text-white" : "text-slate-900")}>
                      {slot.isToday
                        ? new Date().toLocaleDateString("en-KE", { day: "numeric", timeZone: "Africa/Nairobi" })
                        : slot.shortLabel.split(" ")[1]}
                    </span>
                    <span className={cn("text-[10px] font-bold", isSelected ? "text-blue-100" : "text-slate-400")}>
                      {slot.isToday
                        ? new Date().toLocaleDateString("en-KE", { month: "short", timeZone: "Africa/Nairobi" })
                        : slot.shortLabel.split(" ")[2]}
                    </span>
                    {/* Dot indicator */}
                    <span className={cn("mt-1 h-1.5 w-1.5 rounded-full", hasData ? (isSelected ? "bg-white" : "bg-blue-600") : "bg-transparent")} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Next */}
          <button
            onClick={() => setSelectedDayIdx((i) => Math.max(i - 1, 0))}
            disabled={selectedDayIdx <= 0}
            className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-all disabled:opacity-30 shadow-sm"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* 3. STATS OVERVIEW CARDS (Matching solid color top row blocks in reference image) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-blue-600 p-5 text-white shadow-md flex items-center justify-between">
          <div>
            <span className="text-xs font-black uppercase text-blue-100">Archived Packages</span>
            <p className="text-3xl font-black text-white font-mono mt-1">{history.length}</p>
            <span className="text-[11px] text-blue-100/90 font-bold">Snapshots in last 7 days</span>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-white shadow-inner">
            <Layers className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-2xl bg-orange-500 p-5 text-white shadow-md flex items-center justify-between">
          <div>
            <span className="text-xs font-black uppercase text-orange-100">Archived Predictions</span>
            <p className="text-3xl font-black text-white font-mono mt-1">{totalGamesArchived}</p>
            <span className="text-[11px] text-orange-100/90 font-bold">Matches recorded</span>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-white shadow-inner">
            <Trophy className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-2xl bg-emerald-600 p-5 text-white shadow-md flex items-center justify-between">
          <div>
            <span className="text-xs font-black uppercase text-emerald-100">Active Packages</span>
            <p className="text-3xl font-black text-white font-mono mt-1">{activeRulesCount}</p>
            <span className="text-[11px] text-emerald-100/90 font-bold">Ready for today's tips</span>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-white shadow-inner">
            <Zap className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* 4. SELECTED DAY HEADER */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-4 py-1.5 text-sm font-black text-slate-800 shadow-sm">
          <Calendar className="h-4 w-4 text-blue-600" />
          {selectedDay.isToday
            ? `Today — ${new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Nairobi" })}`
            : selectedDay.key}
        </div>
        <div className="h-0.5 flex-1 bg-slate-200" />
        <span className="text-xs font-bold text-slate-500">
          {displayItems.length} {displayItems.length === 1 ? "Package" : "Packages"}
          {selectedDay.isToday && (
            <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-black text-emerald-800">
              LIVE
            </span>
          )}
        </span>
      </div>

      {/* 5. PACKAGES FOR SELECTED DAY */}
      {displayItems.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 shadow-sm">
            <HistoryIcon className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900">
              {selectedDay.isToday ? "No Games Set for Today" : "No Records for This Day"}
            </h3>
            <p className="mt-1 text-sm text-slate-600 max-w-md mx-auto">
              {selectedDay.isToday
                ? "Add match fixtures to your Tips Packages — they'll appear here automatically."
                : "Games from this day were either not set or have already been purged (7-day retention)."}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {displayItems.map((item) => {
            const isExpanded = expandedId === item.id;
            const isCopied = copiedId === item.id;
            return (
              <div
                key={item.id}
                className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-all"
              >
                {/* Card Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white font-black shadow-sm">
                      <Trophy className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900 tracking-tight">{item.packageName}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="inline-flex items-center rounded-full bg-blue-100 border border-blue-200 px-2.5 py-0.5 text-[11px] font-black text-blue-800">
                          {item.packageType}
                        </span>
                        <span className="text-xs text-slate-500 font-bold">• {item.totalGames} Games</span>
                        {selectedDay.isToday && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-black text-emerald-800">
                            ● LIVE TODAY
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Fixtures Table */}
                <div className="p-5 space-y-4">
                  {item.gamesSnapshot.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No match fixtures for this package.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                      <table className="w-full text-left text-xs font-bold">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-100 text-slate-700 uppercase tracking-wider text-[11px]">
                            <th className="py-3 px-4 w-12 text-center">#</th>
                            <th className="py-3 px-4">Home Team</th>
                            <th className="py-3 px-2 text-center text-blue-600">VS</th>
                            <th className="py-3 px-4">Away Team</th>
                            <th className="py-3 px-4 text-center">Predictive Pick</th>
                            <th className="py-3 px-4 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-900 font-mono">
                          {item.gamesSnapshot.map((g, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                              <td className="py-3 px-4 text-center font-bold text-slate-500">{idx + 1}</td>
                              <td className="py-3 px-4 font-black uppercase text-slate-900">{g.team1 || "N/A"}</td>
                              <td className="py-3 px-2 text-center text-xs font-black text-blue-600">VS</td>
                              <td className="py-3 px-4 font-black uppercase text-slate-900">{g.team2 || "N/A"}</td>
                              <td className="py-3 px-4 text-center">
                                {g.prediction ? (
                                  <span className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-black text-amber-900 shadow-sm">
                                    <Sparkles className="h-3 w-3 text-amber-800" /> {g.prediction}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic">-</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                {selectedDay.isToday ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 text-[10px] font-black text-emerald-800">
                                    ● LIVE
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-[10px] font-black text-blue-700">
                                    <CheckCircle2 className="h-3 w-3" /> ARCHIVED
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Raw SMS Collapsible */}
                  {isExpanded && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-900 p-4 space-y-2 text-white">
                      <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                        <span className="text-xs font-black text-blue-400 uppercase tracking-wider flex items-center gap-2">
                          <FileText className="h-4 w-4" /> Full SMS Dispatch String
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {selectedDay.isToday ? "Current template" : "Exact snapshot sent to users"}
                        </span>
                      </div>
                      <pre className="whitespace-pre-wrap font-mono text-xs text-slate-200 leading-relaxed">
                        {item.messageTemplateSnapshot}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

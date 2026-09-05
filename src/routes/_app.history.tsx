import { useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";

// ─── Server Functions ─────────────────────────────────────────────────────────

const fetchHistoryDataFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireCurrentUser } = await import("../lib/auth.server");
  await requireCurrentUser();
  const { fetchPackageHistory, fetchAllRules } = await import("../lib/sms-automation.server");
  const [history, rules] = await Promise.all([fetchPackageHistory(), fetchAllRules()]);
  return { history, activeRulesCount: rules.length };
});

function HistorySkeleton() {
  return (
    <div className="space-y-6 animate-pulse p-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#10B981]/30 pb-5">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-[#10B981]/20 rounded-xl" />
          <div className="h-4 w-72 bg-[#10B981]/10 rounded-lg" />
        </div>
        <div className="h-10 w-36 bg-[#FACC15]/20 rounded-xl" />
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

// ─── Component ────────────────────────────────────────────────────────────────

function PackageHistoryPage() {
  const { history, activeRulesCount } = Route.useLoaderData();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>("all");

  const totalGamesArchived = history.reduce((sum, h) => sum + h.totalGames, 0);

  // Group history by date
  const groupedByDate = history.reduce<Record<string, typeof history>>((acc, item) => {
    const dateKey = item.archivedDate || "Recent";
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(item);
    return acc;
  }, {});

  const datesList = Object.keys(groupedByDate);
  const filteredDates = selectedDateFilter === "all" ? datesList : datesList.filter((d) => d === selectedDateFilter);

  const handleCopySms = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("SMS template snapshot copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. PAGE HEADER SECTION */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-[#10B981] pb-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#38BDF8] flex items-center gap-3">
            <HistoryIcon className="h-8 w-8 text-[#FACC15]" /> Package History
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#A7F3D0] font-bold">
            <span>Daily archived package prediction snapshots.</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#031E17] border border-[#10B981]/50 px-3 py-0.5 text-xs font-mono text-[#FACC15]">
              <Clock className="h-3.5 w-3.5 text-[#10B981]" /> Last 7 Days Retention
            </span>
          </div>
        </div>

        {datesList.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#A7F3D0] uppercase tracking-wider">Filter Date:</span>
            <select
              value={selectedDateFilter}
              onChange={(e) => setSelectedDateFilter(e.target.value)}
              className="rounded-xl border-2 border-[#10B981] bg-[#0A382C] px-3.5 py-1.5 text-xs font-black text-white shadow-md focus:outline-none focus:ring-2 focus:ring-[#FACC15]"
            >
              <option value="all">All Dates (Last 7 Days)</option>
              {datesList.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {/* 2. STATS OVERVIEW CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border-2 border-[#10B981] bg-[#0A382C] p-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs font-black uppercase text-[#38BDF8]">Archived Packages</span>
            <p className="text-2xl font-black text-white font-mono mt-1">{history.length}</p>
            <span className="text-[10px] text-[#A7F3D0] font-bold">Snapshots in last 7 days</span>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FACC15] text-black border-2 border-[#CA8A04] shadow-md">
            <Layers className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-2xl border-2 border-[#10B981] bg-[#0A382C] p-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs font-black uppercase text-[#38BDF8]">Archived Predictions</span>
            <p className="text-2xl font-black text-[#FACC15] font-mono mt-1">{totalGamesArchived}</p>
            <span className="text-[10px] text-[#A7F3D0] font-bold">Matches recorded</span>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#10B981] text-black border-2 border-[#059669] shadow-md">
            <Trophy className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-2xl border-2 border-[#10B981] bg-[#0A382C] p-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs font-black uppercase text-[#38BDF8]">Active Packages</span>
            <p className="text-2xl font-black text-[#38BDF8] font-mono mt-1">{activeRulesCount}</p>
            <span className="text-[10px] text-[#A7F3D0] font-bold">Ready for today's tips</span>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#38BDF8] text-black border-2 border-[#0284C7] shadow-md">
            <Zap className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* 3. HISTORY TIMELINE SECTION */}
      {history.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-[#10B981]/50 bg-[#0A382C]/60 p-12 text-center shadow-xl space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#031E17] border-2 border-[#10B981] text-[#FACC15]">
            <HistoryIcon className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-xl font-black text-[#38BDF8]">No Package History Records Yet</h3>
            <p className="mt-1 text-sm text-[#A7F3D0] max-w-md mx-auto">
              When midnight (00:00 EAT) arrives, active package games will automatically archive here every day, maintaining a clean 7-day rolling history.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {filteredDates.map((dateStr) => {
            const dateItems = groupedByDate[dateStr] || [];
            return (
              <div key={dateStr} className="space-y-4">
                {/* Date Header Badge */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 rounded-xl bg-[#031E17] border-2 border-[#10B981] px-4 py-1.5 text-sm font-black text-[#FACC15] shadow-md">
                    <Calendar className="h-4 w-4 text-[#10B981]" />
                    {dateStr}
                  </div>
                  <div className="h-0.5 flex-1 bg-gradient-to-r from-[#10B981]/60 to-transparent" />
                  <span className="text-xs font-bold text-[#A7F3D0]">
                    {dateItems.length} {dateItems.length === 1 ? "Package Snapshot" : "Package Snapshots"}
                  </span>
                </div>

                {/* Package Cards for this Date */}
                <div className="grid grid-cols-1 gap-6">
                  {dateItems.map((item) => {
                    const isExpanded = expandedId === item.id;
                    const isCopied = copiedId === item.id;
                    return (
                      <div
                        key={item.id}
                        className="overflow-hidden rounded-3xl border-2 border-[#10B981] bg-[#0A382C] shadow-2xl transition-all"
                      >
                        {/* Card Header */}
                        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#10B981]/40 bg-[#031E17]/80 p-5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FACC15] text-black border-2 border-[#CA8A04] shadow-md font-black">
                              <Trophy className="h-5 w-5" />
                            </div>
                            <div>
                              <h3 className="text-lg font-black text-[#38BDF8] tracking-tight">{item.packageName}</h3>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="inline-flex items-center rounded-full bg-[#10B981]/20 border border-[#10B981] px-2.5 py-0.5 text-[11px] font-black text-[#10B981]">
                                  {item.packageType}
                                </span>
                                <span className="text-xs text-[#A7F3D0] font-bold">• {item.totalGames} Games Posted</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleCopySms(item.id, item.messageTemplateSnapshot)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-[#10B981]/50 bg-[#0A382C] hover:bg-[#10B981]/20 px-3 py-1.5 text-xs font-bold text-[#A7F3D0] transition-all"
                              title="Copy raw SMS text snapshot"
                            >
                              {isCopied ? (
                                <>
                                  <CheckCircle2 className="h-4 w-4 text-[#10B981]" /> Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="h-4 w-4 text-[#38BDF8]" /> Copy SMS
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => setExpandedId(isExpanded ? null : item.id)}
                              className="inline-flex items-center gap-1 rounded-xl border-2 border-[#10B981] bg-[#10B981] hover:bg-[#059669] px-3.5 py-1.5 text-xs font-black text-black transition-all shadow-md"
                            >
                              {isExpanded ? (
                                <>
                                  Hide Raw SMS <ChevronUp className="h-4 w-4" />
                                </>
                              ) : (
                                <>
                                  View Raw SMS <ChevronDown className="h-4 w-4" />
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Card Content - Fixtures Table */}
                        <div className="p-5 space-y-4">
                          {item.gamesSnapshot.length === 0 ? (
                            <p className="text-xs text-[#A7F3D0] italic">No match fixtures parsed for this snapshot.</p>
                          ) : (
                            <div className="overflow-x-auto rounded-2xl border border-[#10B981]/40 bg-[#031E17]/60">
                              <table className="w-full text-left text-xs font-bold">
                                <thead>
                                  <tr className="border-b border-[#10B981]/40 bg-[#0A382C] text-[#38BDF8] uppercase tracking-wider text-[11px]">
                                    <th className="py-3 px-4 w-12 text-center">#</th>
                                    <th className="py-3 px-4">Home Team</th>
                                    <th className="py-3 px-2 text-center text-[#FACC15]">VS</th>
                                    <th className="py-3 px-4">Away Team</th>
                                    <th className="py-3 px-4 text-center">Predictive Pick</th>
                                    <th className="py-3 px-4 text-right">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#10B981]/20 text-white font-mono">
                                  {item.gamesSnapshot.map((g, idx) => (
                                    <tr key={idx} className="hover:bg-[#10B981]/10 transition-colors">
                                      <td className="py-3 px-4 text-center font-bold text-[#A7F3D0]">{idx + 1}</td>
                                      <td className="py-3 px-4 font-black uppercase text-[#38BDF8]">{g.team1 || "N/A"}</td>
                                      <td className="py-3 px-2 text-center text-xs font-black text-[#FACC15]">VS</td>
                                      <td className="py-3 px-4 font-black uppercase text-[#38BDF8]">{g.team2 || "N/A"}</td>
                                      <td className="py-3 px-4 text-center">
                                        {g.prediction ? (
                                          <span className="inline-flex items-center gap-1 rounded-lg border-2 border-[#CA8A04] bg-[#FACC15] px-3 py-1 text-xs font-black text-black shadow-md">
                                            <Sparkles className="h-3 w-3 text-black" /> {g.prediction}
                                          </span>
                                        ) : (
                                          <span className="text-[#A7F3D0]/60 italic">-</span>
                                        )}
                                      </td>
                                      <td className="py-3 px-4 text-right">
                                        <span className="inline-flex items-center gap-1 rounded-full bg-[#10B981]/20 border border-[#10B981] px-2.5 py-0.5 text-[10px] font-black text-[#10B981]">
                                          <CheckCircle2 className="h-3 w-3" /> ARCHIVED
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Raw SMS Template Collapsible Preview */}
                          {isExpanded && (
                            <div className="rounded-2xl border-2 border-[#38BDF8]/40 bg-[#031E17] p-4 space-y-2">
                              <div className="flex items-center justify-between border-b border-[#38BDF8]/20 pb-2">
                                <span className="text-xs font-black text-[#38BDF8] uppercase tracking-wider flex items-center gap-2">
                                  <FileText className="h-4 w-4" /> Full SMS Dispatch String
                                </span>
                                <span className="text-[10px] font-mono text-[#A7F3D0]">Exact snapshot sent to users</span>
                              </div>
                              <pre className="whitespace-pre-wrap font-mono text-xs text-[#A7F3D0] leading-relaxed">
                                {item.messageTemplateSnapshot}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

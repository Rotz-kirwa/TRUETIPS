import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState, useMemo, useCallback } from "react";
import { z } from "zod";
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight, MessageSquare,
  Send, CheckCircle2, XCircle, AlertTriangle, Loader2, X,
  Zap, Bell, Clock, ChevronDown, ChevronUp, Target, SlidersHorizontal,
  Wand2, Sparkles, RefreshCw, Layers, Table, FileText, ClipboardList, Eye,
  Users, DollarSign, Calendar, Tag, ShieldCheck, Check, Info, ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { RuleRow, LogRow } from "@/lib/sms-automation.server";

// ─── Server functions ─────────────────────────────────────────────────────────

const fetchSmsDataFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireCurrentUser } = await import("../lib/auth.server");
  await requireCurrentUser();
  const {
    fetchAllRules, fetchRecentLogs, fetchLogStats, getSmsAutomationEnabled,
  } = await import("../lib/sms-automation.server");
  const [rules, logs, stats, globalEnabled] = await Promise.all([
    fetchAllRules(), fetchRecentLogs(100), fetchLogStats(), getSmsAutomationEnabled(),
  ]);
  return { rules, logs, stats, globalEnabled };
});

const resetDefaultTiersFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireCurrentUser } = await import("../lib/auth.server");
  await requireCurrentUser();
  const { resetDefaultTiers } = await import("../lib/sms-automation.server");
  return resetDefaultTiers();
});

const clearAllRulesFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireCurrentUser } = await import("../lib/auth.server");
  await requireCurrentUser();
  const { clearAllRules } = await import("../lib/sms-automation.server");
  await clearAllRules();
  return { success: true };
});

const setGlobalAutomationFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.boolean().parse(v))
  .handler(async ({ data: enabled }) => {
    const { requireCurrentUser } = await import("../lib/auth.server");
    await requireCurrentUser();
    const { setSmsAutomationEnabled } = await import("../lib/sms-automation.server");
    await setSmsAutomationEnabled(enabled);
    return { enabled };
  });

const ruleSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  minAmount: z.number().positive("Must be positive"),
  maxAmount: z.number().positive("Must be positive"),
  messageTemplate: z.string().min(5, "Message too short").max(2000, "Max 2000 characters"),
  isActive: z.boolean(),
});

const createRuleFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => ruleSchema.parse(v))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("../lib/auth.server");
    await requireCurrentUser();
    const { createRule } = await import("../lib/sms-automation.server");
    return createRule(data);
  });

const updateRuleFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ id: z.string(), ...ruleSchema.shape }).parse(v))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("../lib/auth.server");
    await requireCurrentUser();
    const { updateRule } = await import("../lib/sms-automation.server");
    const { id, ...rest } = data;
    return updateRule(id, rest);
  });

const deleteRuleFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.string().parse(v))
  .handler(async ({ data: id }) => {
    const { requireCurrentUser } = await import("../lib/auth.server");
    await requireCurrentUser();
    const { deleteRule } = await import("../lib/sms-automation.server");
    await deleteRule(id);
    return { id };
  });

const toggleRuleFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ id: z.string(), isActive: z.boolean() }).parse(v))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("../lib/auth.server");
    await requireCurrentUser();
    const { toggleRuleStatus } = await import("../lib/sms-automation.server");
    return toggleRuleStatus(data.id, data.isActive);
  });

const testSmsFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ ruleId: z.string(), phone: z.string().min(9) }).parse(v))
  .handler(async ({ data }) => {
    const { sendTestSms } = await import("../lib/sms-automation.server");
    const result = await sendTestSms(data.ruleId, data.phone);
    return { success: result.success, message: result.message, error: result.error ?? null };
  });

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_app/sms-automation")({
  loader: () => fetchSmsDataFn(),
  component: SmsAutomationPage,
  head: () => ({ meta: [{ title: "Tips Packages — TrueTips Admin" }] }),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const KES = (n: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);

const PLACEHOLDERS = [
  { tag: "{customer_name}", desc: "Customer phone as name" },
  { tag: "{phone}",         desc: "Raw phone number" },
  { tag: "{amount}",        desc: "Payment amount (KES)" },
  { tag: "{transaction_code}", desc: "M-Pesa receipt code" },
  { tag: "{date}",          desc: "Payment date & time" },
  { tag: "{business_name}", desc: "Business name" },
];

const PACKAGE_NAME_MAP: Record<string, string> = {
  "daily football games": "Daily Matches ⚽",
  "gold": "Daily Matches ⚽",
  "platinum": "Jackpot Matches 🏆",
  "sapphire": "Basket Matches 🏀",
  "ruby": "Weekly Subscription 📅",
  "emerald": "Monthly Subscription 📆",
  "vip monthly": "VIP Monthly Package 👑",
  "weekly package": "Weekly Package 📅",
  "one time tip": "One Time Tip ⚡",
  "jackpot package": "Jackpot Package 🏆",
};

function displayPackageName(name: string) {
  const key = name.toLowerCase().trim();
  return PACKAGE_NAME_MAP[key] || name;
}

function getPackageDuration(rule: RuleRow): string {
  const name = rule.name.toLowerCase();
  const amt = rule.minAmount;
  if (name.includes("monthly") || name.includes("month") || amt >= 2500) return "30 Days";
  if (name.includes("weekly") || name.includes("week") || (amt >= 750 && amt < 2500)) return "7 Days";
  if (name.includes("one time") || name.includes("single") || amt < 750) return "1 Day";
  return "7 Days";
}

function getPackageFeatures(rule: RuleRow): string[] {
  const name = rule.name.toLowerCase();
  const amt = rule.minAmount;

  if (name.includes("vip") || name.includes("monthly") || amt >= 2500) {
    return [
      "Daily VIP predictions",
      "Jackpot predictions",
      "Premium analysis",
      "High accuracy tips",
    ];
  }
  if (name.includes("jackpot") || (amt >= 1000 && amt < 2500)) {
    return [
      "Full jackpot predictions",
      "Expert match analysis",
      "Weekend Mega Jackpot tips",
    ];
  }
  if (name.includes("weekly") || (amt >= 700 && amt < 1000)) {
    return [
      "Unlimited daily access (7 Days)",
      "VIP predictions",
      "High accuracy tips",
    ];
  }
  return [
    "Single day predictions",
    "High odds pick",
    "Instant SMS delivery",
  ];
}

const DEFAULT_EXAMPLE_PACKAGES = [
  {
    name: "VIP Monthly Package 👑",
    amount: "3000",
    duration: "30 Days",
    icon: "👑",
    badgeBg: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    description: "Complete premium VIP subscription with full access to daily tips, jackpot predictions, and expert analysis for 30 days.",
    features: [
      "Daily VIP predictions",
      "Jackpot predictions",
      "Premium analysis",
      "High accuracy tips",
    ],
    template: `VIP MONTHLY PACKAGE 👑\nDaily VIP predictions, Jackpot picks, and premium analysis.\nValid for 30 Days.\n🏆 Play Smart, Win Big`,
  },
  {
    name: "Weekly Package 📅",
    amount: "800",
    duration: "7 Days",
    icon: "📅",
    badgeBg: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    description: "Full 7-day subscription for high accuracy football predictions and weekend jackpots.",
    features: [
      "Unlimited daily access (7 Days)",
      "VIP predictions",
      "High accuracy tips",
    ],
    template: `WEEKLY PACKAGE 📅\nUnlimited access to premium TrueTips predictions.\nValid for 7 Days.\n🏆 Play Smart, Win Big`,
  },
  {
    name: "Jackpot Package 🏆",
    amount: "1500",
    duration: "7 Days",
    icon: "🏆",
    badgeBg: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    description: "Specialized jackpot predictions and expert breakdown for midweek and weekend mega jackpots.",
    features: [
      "Full jackpot predictions",
      "Expert match analysis",
      "Weekend Mega Jackpot tips",
    ],
    template: `JACKPOT PACKAGE 🏆\nMidweek & Weekend Mega Jackpot Predictions.\n🏆 Play Smart, Win Big`,
  },
  {
    name: "One Time Tip ⚡",
    amount: "500",
    duration: "1 Day",
    icon: "⚡",
    badgeBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    description: "Single-day instant access for high odds prediction fixtures.",
    features: [
      "Single day predictions",
      "High odds pick",
      "Instant SMS delivery",
    ],
    template: `ONE TIME TIP ⚡\nSingle day high-odds prediction.\n🏆 Play Smart, Win Big`,
  },
];

export function formatAndCleanMatchLines(text: string): string {
  if (!text.trim()) return text;
  const lines = text.split("\n");
  const cleaned = lines.map((line) => {
    let trimmed = line.trim();
    if (!trimmed) return "";
    trimmed = trimmed.replace(/^[\d\*\-\•]+\.\s*/, "").replace(/^[\*\-\•]\s*/, "");
    trimmed = trimmed.replace(/\s*(?:->|=>|–|—|:)\s*/g, " → ");
    if (!trimmed.includes("→")) {
      const match = trimmed.match(/^(.+?\s+(?:vs\.?|v)\s+.+?)\s+([12X|gg|ng|over|under|draw]+.*)$/i);
      if (match) {
        trimmed = `${match[1].trim()} → ${match[2].trim().toUpperCase()}`;
      }
    }
    if (trimmed.includes("→")) {
      const parts = trimmed.split("→");
      const teams = parts[0].trim();
      const tip = parts.slice(1).join("→").trim();
      const formattedTeams = teams.replace(/\b\w+/g, (w) => {
        if (["vs", "v"].includes(w.toLowerCase())) return "vs";
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      });
      return `${formattedTeams} → ${tip.toUpperCase()}`;
    }
    return trimmed;
  });
  return cleaned.filter(Boolean).join("\n");
}

function buildPreview(template: string): string {
  return template
    .replace(/Thank you \{customer_name\} for (paying|subscribing with) KES \{amount\}\.? Receipt: \{transaction_code\}\.?/gi, "🏆 Play Smart, Win Big")
    .replace(/(🔥|🍀|🚀|👑)?\s*(Good luck|Best of luck)[^\n]*/gi, "🏆 Play Smart, Win Big")
    .replace(/\{customer_name\}/gi, "254791260817")
    .replace(/\{phone\}/gi, "254791260817")
    .replace(/\{amount\}/gi, "800.00")
    .replace(/\{transaction_code\}/gi, "UI4315EA6Z")
    .replace(/\{date\}/gi, "04 Sep 2026, 14:30")
    .replace(/\{business_name\}/gi, "TRUETIPS");
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModalMode = { mode: "add"; initialPreset?: typeof DEFAULT_EXAMPLE_PACKAGES[0] } | { mode: "edit"; rule: RuleRow };

export type MatchRow = {
  id: string;
  team1: string;
  team2: string;
  pick: string;
};

export function parseBulkMatchesText(rawText: string): MatchRow[] {
  if (!rawText || !rawText.trim()) return [];

  let textToParse = rawText.trim();
  if (!textToParse.includes("\n")) {
    textToParse = textToParse.replace(/\s+(\d+)[\.\)\s]+([A-Z0-9])/gi, "\n$1 $2");
    if (!textToParse.includes("\n") && (textToParse.match(/\bvs\.?\b/gi) || []).length > 1) {
      textToParse = textToParse.replace(/(\S+\s+vs\s+.*?)(?=\s+[A-Z0-9][a-zA-Z0-9\s]*?\s+vs\b)/gi, "$1\n");
    }
  }

  const lines = textToParse.split("\n");
  const matches: MatchRow[] = [];

  for (const line of lines) {
    let trimmed = line.trim();
    if (!trimmed) continue;
    trimmed = trimmed.replace(/^[\d\*\-\•]+[\.\)\t\s]+\s*/, "");

    if (trimmed.includes("\t")) {
      const parts = trimmed.split("\t").map((p) => p.trim()).filter(Boolean);
      const nonVsParts = parts.filter((p) => !/^(vs|v)\.?$/i.test(p));
      if (nonVsParts.length >= 3) {
        matches.push({
          id: Math.random().toString(36).substring(2, 9),
          team1: nonVsParts[0],
          team2: nonVsParts[1],
          pick: nonVsParts.slice(2).join(" "),
        });
        continue;
      } else if (nonVsParts.length === 2) {
        matches.push({
          id: Math.random().toString(36).substring(2, 9),
          team1: nonVsParts[0],
          team2: nonVsParts[1],
          pick: "1",
        });
        continue;
      }
    }

    let rest = trimmed;
    let pick = "";

    if (rest.includes("->") || rest.includes("→")) {
      const parts = rest.split(/->|→/);
      rest = parts[0].trim();
      pick = parts.slice(1).join("->").trim();
    } else if (rest.includes(":")) {
      const parts = rest.split(":");
      rest = parts[0].trim();
      pick = parts.slice(1).join(":").trim();
    } else if (rest.includes(" - ")) {
      const parts = rest.split(" - ");
      rest = parts[0].trim();
      pick = parts.slice(1).join(" - ").trim();
    }

    let team1 = "";
    let team2 = "";

    if (/\bvs\.?\b/i.test(rest)) {
      const parts = rest.split(/\bvs\.?\b/i);
      team1 = parts[0].trim();
      const afterVs = parts[1].trim();

      if (!pick) {
        const regex = /^(.*?)\s+((?:[A-Z0-9][a-zA-Z0-9\s]*\s+Win(?:\s*\([^\)]+\))?|Over\s+[\d\.]+\s*.*|Under\s+[\d\.]+\s*.*|Both\s+Teams\s+.*|GG|NG|BTTS|[12X]\b|\([^\)]+\)).*)$/i;
        const match = afterVs.match(regex);

        if (match && match[1].trim()) {
          team2 = match[1].trim();
          pick = match[2].trim();
        } else {
          const parenMatch = afterVs.match(/^(.*?)\s+(\([^\)]+\))$/);
          if (parenMatch) {
            const team2Candidate = parenMatch[1].trim();
            const lastSpace = team2Candidate.lastIndexOf(" ");
            if (lastSpace > 0) {
              team2 = team2Candidate.slice(0, lastSpace).trim();
              pick = `${team2Candidate.slice(lastSpace).trim()} ${parenMatch[2]}`;
            } else {
              team2 = team2Candidate;
              pick = parenMatch[2];
            }
          } else {
            const lastSpace = afterVs.lastIndexOf(" ");
            if (lastSpace > 0) {
              team2 = afterVs.slice(0, lastSpace).trim();
              pick = afterVs.slice(lastSpace).trim();
            } else {
              team2 = afterVs;
              pick = "1";
            }
          }
        }
      } else {
        team2 = afterVs;
      }
    } else if (/\bv\.?\b/i.test(rest)) {
      const parts = rest.split(/\bv\.?\b/i);
      team1 = parts[0].trim();
      team2 = parts[1].trim();
      if (!pick) pick = "1";
    } else {
      team1 = rest;
      if (!pick) pick = "1";
    }

    if (team1 || team2) {
      matches.push({
        id: Math.random().toString(36).substring(2, 9),
        team1,
        team2,
        pick: pick || "1",
      });
    }
  }

  return matches;
}

function parseTemplateToStructure(rawTemplate: string, fallbackTitle = "VIP Tips Package:") {
  if (!rawTemplate || !rawTemplate.trim()) {
    return {
      header: fallbackTitle,
      matches: [],
      footer: "🏆 Play Smart, Win Big",
    };
  }

  const lines = rawTemplate.split("\n");
  const headerLines: string[] = [];
  const footerLines: string[] = [];
  const matchLines: string[] = [];

  let phase: "header" | "matches" | "footer" = "header";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isMatchLine = /\b(vs|v)\b/i.test(trimmed) || trimmed.includes("->") || trimmed.includes("→") || trimmed.includes(":") || trimmed.includes("\t");

    if (isMatchLine) {
      phase = "matches";
      matchLines.push(line);
    } else {
      if (phase === "header") {
        headerLines.push(trimmed);
      } else {
        phase = "footer";
        footerLines.push(trimmed);
      }
    }
  }

  const matches = parseBulkMatchesText(matchLines.join("\n"));

  const rawFooter = footerLines.join("\n");
  const cleanedFooter = rawFooter
    .replace(
      /Thank you \{customer_name\} for (paying|subscribing with) KES \{amount\}\.? Receipt: \{transaction_code\}\.?/gi,
      "🏆 Play Smart, Win Big",
    )
    .replace(/(🔥|🍀|🚀|👑)?\s*(Good luck|Best of luck)[^\n]*/gi, "🏆 Play Smart, Win Big");

  return {
    header: headerLines.join("\n") || fallbackTitle,
    matches,
    footer: cleanedFooter || "🏆 Play Smart, Win Big",
  };
}

function buildTemplateFromStructure(header: string, matches: MatchRow[], footer?: string): string {
  const matchLines = matches
    .filter((m) => m.team1.trim() || m.team2.trim())
    .map((m) => {
      const t1 = m.team1.trim().toUpperCase();
      const t2 = m.team2.trim().toUpperCase();
      const p = m.pick.trim().toUpperCase();
      return `${t1}${t2 ? ` VS ${t2}` : ""}${p ? `: ${p}` : ""}`;
    });

  const parts = [];
  if (header && header.trim()) parts.push(header.trim().toUpperCase());
  if (matchLines.length > 0) parts.push(matchLines.join("\n"));
  if (footer && footer.trim()) parts.push(footer.trim());

  return parts.join("\n\n");
}

// ─── Rule Modal (Create & Edit Package) ──────────────────────────────────────

function RuleModal({
  modalMode,
  onClose,
  onSaved,
  rules = [],
}: {
  modalMode: ModalMode;
  onClose: () => void;
  onSaved: (rule: RuleRow) => void;
  rules?: RuleRow[];
}) {
  const editing = modalMode.mode === "edit" ? modalMode.rule : null;
  const initialPreset = modalMode.mode === "add" ? modalMode.initialPreset : null;

  const [name, setName] = useState(editing?.name ?? initialPreset?.name ?? "");
  const [fixedAmount, setFixedAmount] = useState(
    editing ? String(editing.minAmount) : initialPreset ? initialPreset.amount : "800",
  );
  const [duration, setDuration] = useState(
    editing ? getPackageDuration(editing) : initialPreset ? initialPreset.duration : "7 Days",
  );
  const [description, setDescription] = useState(
    editing ? (editing.messageTemplate.split("\n")[0] || "Prediction package for subscribers.") : (initialPreset?.description || "Prediction package for subscribers."),
  );

  const initialFeatures = editing
    ? getPackageFeatures(editing)
    : initialPreset
    ? initialPreset.features
    : ["Daily VIP predictions", "Jackpot predictions", "High accuracy tips"];

  const [featuresList, setFeaturesList] = useState<string[]>(initialFeatures);
  const [newFeatureText, setNewFeatureText] = useState("");

  const [template, setTemplate] = useState(
    editing?.messageTemplate ??
      initialPreset?.template ??
      "WEEKLY PACKAGE 📅\nUnlimited access to premium TrueTips predictions.\nValid for 7 Days.\n🏆 Play Smart, Win Big",
  );
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Table Mode State
  const [inputMode, setInputMode] = useState<"table" | "raw">("table");
  const initialParsed = useMemo(
    () => parseTemplateToStructure(editing?.messageTemplate ?? "", name ? `${name}:` : "Tips Package:"),
    [],
  );

  const [headerText, setHeaderText] = useState(initialParsed.header);
  const [matchRows, setMatchRows] = useState<MatchRow[]>(initialParsed.matches);
  const [footerText, setFooterText] = useState(initialParsed.footer);

  const preview = useMemo(() => buildPreview(template), [template]);

  function updateTemplateFromTable(h: string, rows: MatchRow[], f: string) {
    const newTpl = buildTemplateFromStructure(h, rows, f);
    setTemplate(newTpl);
  }

  function handleAddFeature() {
    if (!newFeatureText.trim()) return;
    setFeaturesList((prev) => [...prev, newFeatureText.trim()]);
    setNewFeatureText("");
  }

  function handleRemoveFeature(index: number) {
    setFeaturesList((prev) => prev.filter((_, i) => i !== index));
  }

  function handleMatchRowChange(id: string, field: "team1" | "team2" | "pick", value: string) {
    const vsCount = (value.match(/\bvs\.?\b/gi) || []).length;
    const hasMultipleGames = value.includes("\n") || value.includes("\t") || vsCount > 1 || (vsCount === 1 && field === "team1" && value.length > 25);

    if (hasMultipleGames) {
      const parsed = parseBulkMatchesText(value);
      if (parsed.length > 0) {
        setMatchRows((prev) => {
          const filtered = prev.filter((r) => r.id !== id && (r.team1.trim() || r.team2.trim()));
          const updated = [...filtered, ...parsed];
          updateTemplateFromTable(headerText, updated, footerText);
          return updated;
        });
        toast.success(`Auto-split and imported ${parsed.length} match(es)!`);
        return;
      }
    }

    const upperValue = value.toUpperCase();
    const updated = matchRows.map((r) => (r.id === id ? { ...r, [field]: upperValue } : r));
    setMatchRows(updated);
    updateTemplateFromTable(headerText, updated, footerText);
  }

  function handleAddMatchRow() {
    const newRow: MatchRow = {
      id: Math.random().toString(36).substring(2, 9),
      team1: "",
      team2: "",
      pick: "1",
    };
    const updated = [...matchRows, newRow];
    setMatchRows(updated);
    updateTemplateFromTable(headerText, updated, footerText);
  }

  function handleRemoveMatchRow(id: string) {
    const updated = matchRows.filter((r) => r.id !== id);
    setMatchRows(updated);
    updateTemplateFromTable(headerText, updated, footerText);
  }

  // Paste Bulk Matches Handlers
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteInput, setPasteInput] = useState("");

  function handleImportPastedText() {
    if (!pasteInput.trim()) {
      toast.error("Please paste match text first.");
      return;
    }
    const parsed = parseBulkMatchesText(pasteInput);
    if (parsed.length === 0) {
      toast.error("No valid matches found in pasted text.");
      return;
    }

    setMatchRows((prev) => {
      const updated = [...prev.filter((r) => r.team1.trim() || r.team2.trim()), ...parsed];
      updateTemplateFromTable(headerText, updated, footerText);
      return updated;
    });

    toast.success(`Parsed and imported ${parsed.length} match(es) into table!`);
    setPasteInput("");
    setShowPasteBox(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const priceNum = parseFloat(fixedAmount);
    if (isNaN(priceNum) || priceNum <= 0) {
      setError("Price (KES) must be a positive number.");
      return;
    }

    if (!name.trim()) {
      setError("Package name is required.");
      return;
    }

    if (!template.trim()) {
      setError("Package message template cannot be empty.");
      return;
    }

    setLoading(true);
    try {
      let result;
      if (editing) {
        result = await updateRuleFn({
          data: {
            id: editing.id,
            name: name.trim(),
            minAmount: priceNum,
            maxAmount: priceNum,
            messageTemplate: template,
            isActive,
          },
        });
      } else {
        result = await createRuleFn({
          data: {
            name: name.trim(),
            minAmount: priceNum,
            maxAmount: priceNum,
            messageTemplate: template,
            isActive,
          },
        });
      }

      if (result && "type" in result) {
        if (result.type === "overlap") {
          const names = result.conflicting
            .map((r: RuleRow) => `"${r.name}" (${KES(r.minAmount)})`)
            .join(", ");
          setError(`Price overlaps with existing active package: ${names}. Change price or set inactive.`);
        } else {
          setError(result.message);
        }
      } else {
        onSaved(result as RuleRow);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  function handleSelectPreset(preset: typeof DEFAULT_EXAMPLE_PACKAGES[number]) {
    setName(preset.name);
    setFixedAmount(preset.amount);
    setDuration(preset.duration);
    setDescription(preset.description);
    setFeaturesList(preset.features);
    setTemplate(preset.template);
    const parsed = parseTemplateToStructure(preset.template, `${preset.name}:`);
    setHeaderText(parsed.header);
    setMatchRows(parsed.matches);
    setFooterText(parsed.footer);
    toast.info(`Loaded ${preset.name} (${KES(Number(preset.amount))}) Preset`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl rounded-2xl border-2 border-[#10B981] bg-[#0A382C] text-white shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-[#10B981]/40 px-6 py-4 shrink-0 bg-[#031E17]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FACC15] text-black font-black border-2 border-[#CA8A04]">
              <PackageIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[#38BDF8]">
                {editing ? "Edit Tips Package" : "Create New Tips Package"}
              </h2>
              <p className="text-xs text-[#A7F3D0] font-medium">
                Configure pricing, validity duration, features, and matches list
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-[#A7F3D0] hover:bg-[#10B981]/20 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Presets */}
          {!editing && (
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-[#38BDF8]">
                Quick Example Templates
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DEFAULT_EXAMPLE_PACKAGES.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => handleSelectPreset(p)}
                    className="flex flex-col items-start rounded-xl border-2 border-[#10B981]/40 bg-[#031E17] p-2.5 hover:border-[#FACC15] transition-all text-left group"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-lg">{p.icon}</span>
                      <span className="text-[10px] font-black font-mono text-[#FACC15] bg-[#FACC15]/10 px-1.5 py-0.5 rounded border border-[#CA8A04]">
                        {KES(Number(p.amount))}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-white mt-1 group-hover:text-[#38BDF8] truncate w-full">
                      {p.name}
                    </span>
                    <span className="text-[10px] text-[#A7F3D0] font-mono">{p.duration}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Fields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-black uppercase tracking-wider text-[#38BDF8]">
                Package Name *
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. VIP Monthly, Weekly Package..."
                className="mt-1.5 h-10 w-full rounded-xl border-2 border-[#10B981]/40 bg-[#031E17] px-3.5 text-sm text-white font-bold outline-none focus:border-[#FACC15]"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-[#38BDF8]">
                Status
              </label>
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={cn(
                  "mt-1.5 flex h-10 w-full items-center justify-center gap-2 rounded-xl border-2 text-xs font-black transition-all",
                  isActive
                    ? "border-[#059669] bg-[#10B981] text-black shadow-md"
                    : "border-gray-600 bg-gray-800 text-gray-400",
                )}
              >
                {isActive ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                {isActive ? "Active" : "Inactive"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-[#38BDF8]">
                Price (KES) *
              </label>
              <input
                type="number"
                min="1"
                step="any"
                value={fixedAmount}
                onChange={(e) => setFixedAmount(e.target.value)}
                placeholder="e.g. 3000"
                className="mt-1.5 h-10 w-full rounded-xl border-2 border-[#10B981]/40 bg-[#031E17] px-3.5 text-sm text-white font-bold font-mono outline-none focus:border-[#FACC15]"
              />
            </div>

            <div>
              <label className="text-xs font-black uppercase tracking-wider text-[#38BDF8]">
                Duration / Validity
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border-2 border-[#10B981]/40 bg-[#031E17] px-3.5 text-sm text-white font-bold outline-none focus:border-[#FACC15]"
              >
                <option value="1 Day">1 Day (24 Hours)</option>
                <option value="7 Days">7 Days (1 Week)</option>
                <option value="30 Days">30 Days (1 Month)</option>
                <option value="365 Days">365 Days (1 Year)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-wider text-[#38BDF8]">
              Description
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of what subscribers receive with this package..."
              className="mt-1.5 h-10 w-full rounded-xl border-2 border-[#10B981]/40 bg-[#031E17] px-3.5 text-xs text-[#A7F3D0] font-semibold outline-none focus:border-[#FACC15]"
            />
          </div>

          {/* Features Included List Builder */}
          <div className="space-y-2 rounded-xl border-2 border-[#10B981]/30 bg-[#031E17] p-3.5">
            <label className="text-xs font-black uppercase tracking-wider text-[#38BDF8] flex items-center justify-between">
              <span>Features Included</span>
              <span className="text-[10px] text-[#A7F3D0] font-normal">Subscribers see these highlights</span>
            </label>

            <div className="flex flex-wrap gap-2">
              {featuresList.map((feat, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[#10B981] bg-[#0A382C] px-3 py-1 text-xs font-bold text-[#A7F3D0]"
                >
                  <Check className="h-3.5 w-3.5 text-[#FACC15]" />
                  <span>{feat}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFeature(idx)}
                    className="ml-1 text-rose-400 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <input
                type="text"
                value={newFeatureText}
                onChange={(e) => setNewFeatureText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddFeature();
                  }
                }}
                placeholder="e.g. Premium analysis, High accuracy tips..."
                className="h-8 flex-1 rounded-lg border border-[#10B981]/40 bg-[#0A382C] px-3 text-xs text-white outline-none focus:border-[#FACC15]"
              />
              <button
                type="button"
                onClick={handleAddFeature}
                className="h-8 px-3 rounded-lg border-2 border-[#CA8A04] bg-[#FACC15] text-black text-xs font-black hover:bg-[#EAB308]"
              >
                + Add Feature
              </button>
            </div>
          </div>

          {/* Table / Raw Match Builder */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b-2 border-[#10B981]/30 pb-2">
              <div className="flex items-center gap-1.5 rounded-xl bg-[#031E17] p-1 border-2 border-[#10B981]/40">
                <button
                  type="button"
                  onClick={() => {
                    if (inputMode !== "table") {
                      const parsed = parseTemplateToStructure(template, name ? `${name}:` : "Tips Package:");
                      setHeaderText(parsed.header);
                      setMatchRows(parsed.matches);
                      setFooterText(parsed.footer);
                    }
                    setInputMode("table");
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-black transition-all",
                    inputMode === "table"
                      ? "bg-[#10B981] text-black shadow-sm"
                      : "text-[#A7F3D0] hover:text-white",
                  )}
                >
                  <Table className="h-3.5 w-3.5" />
                  Table Fixtures Builder
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("raw")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-black transition-all",
                    inputMode === "raw"
                      ? "bg-[#10B981] text-black shadow-sm"
                      : "text-[#A7F3D0] hover:text-white",
                  )}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Raw SMS Editor
                </button>
              </div>

              <span className="text-xs font-mono font-bold text-[#FACC15]">
                {template.length}/2000 ({Math.ceil(template.length / 160) || 1} SMS)
              </span>
            </div>

            {inputMode === "table" ? (
              <div className="space-y-3 rounded-xl border-2 border-[#10B981]/40 bg-[#031E17] p-3.5">
                <div>
                  <label className="text-[11px] font-black uppercase tracking-wider text-[#38BDF8]">
                    Package Header Title
                  </label>
                  <input
                    type="text"
                    value={headerText}
                    onChange={(e) => {
                      setHeaderText(e.target.value);
                      updateTemplateFromTable(e.target.value, matchRows, footerText);
                    }}
                    placeholder="e.g. VIP MONTHLY PACKAGE:"
                    className="mt-1 h-9 w-full rounded-lg border-2 border-[#10B981]/40 bg-[#0A382C] px-3 text-xs font-bold text-white outline-none focus:border-[#FACC15]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-[#38BDF8]">
                      Match Fixtures & Predictive Picks
                    </label>
                    <span className="text-[10px] text-[#FACC15] font-black">Auto-formats to UPPERCASE</span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border-2 border-[#10B981]/40 bg-[#0A382C]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#031E17] text-[#38BDF8] font-black uppercase border-b-2 border-[#10B981]/40 text-[10px]">
                        <tr>
                          <th className="p-2 w-8 text-center">#</th>
                          <th className="p-2">Home Team</th>
                          <th className="p-2 w-8 text-center text-[#FACC15]">VS</th>
                          <th className="p-2">Away Team</th>
                          <th className="p-2">Predictive Pick</th>
                          <th className="p-2 w-8 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#10B981]/20">
                        {matchRows.map((m, idx) => (
                          <tr key={m.id} className="hover:bg-[#031E17]/60 transition-colors">
                            <td className="p-2 text-center font-mono font-bold text-[#A7F3D0]">
                              {idx + 1}
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={m.team1}
                                onChange={(e) => handleMatchRowChange(m.id, "team1", e.target.value)}
                                placeholder="e.g. ARSENAL"
                                className="w-full rounded-md border border-[#10B981]/40 bg-[#031E17] p-1.5 text-xs font-bold text-white outline-none focus:border-[#FACC15]"
                              />
                            </td>
                            <td className="p-2 text-center text-[10px] font-black text-[#FACC15]">
                              VS
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={m.team2}
                                onChange={(e) => handleMatchRowChange(m.id, "team2", e.target.value)}
                                placeholder="e.g. CHELSEA"
                                className="w-full rounded-md border border-[#10B981]/40 bg-[#031E17] p-1.5 text-xs font-bold text-white outline-none focus:border-[#FACC15]"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={m.pick}
                                onChange={(e) => handleMatchRowChange(m.id, "pick", e.target.value)}
                                placeholder="e.g. 1 / OVER 2.5 / GG"
                                className="w-full rounded-md border border-[#10B981]/40 bg-[#031E17] p-1.5 text-xs font-mono font-black text-[#FACC15] outline-none focus:border-[#FACC15]"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveMatchRow(m.id)}
                                className="p-1 text-rose-400 hover:text-rose-200 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddMatchRow}
                      className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#10B981] bg-[#10B981]/15 px-3 py-1.5 text-xs font-black text-[#A7F3D0] hover:bg-[#10B981]/30 transition-all"
                    >
                      <Plus className="h-4 w-4" /> Add Match Fixture Row
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowPasteBox(!showPasteBox)}
                      className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#CA8A04] bg-[#FACC15] px-3 py-1.5 text-xs font-black text-black hover:bg-[#EAB308] transition-all shadow-sm"
                    >
                      <ClipboardList className="h-4 w-4" /> Paste Multiple Matches
                    </button>
                  </div>

                  {showPasteBox && (
                    <div className="mt-3 rounded-xl border-2 border-[#FACC15] bg-[#031E17] p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black text-[#FACC15] flex items-center gap-1.5">
                          <ClipboardList className="h-4 w-4" />
                          Paste Bulk Matches
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowPasteBox(false)}
                          className="text-[11px] text-[#A7F3D0] hover:text-white"
                        >
                          Close
                        </button>
                      </div>
                      <textarea
                        rows={4}
                        value={pasteInput}
                        onChange={(e) => setPasteInput(e.target.value)}
                        placeholder="Paste matches here...&#10;Arsenal vs Chelsea Arsenal Win (1)&#10;Liverpool vs City Over 2.5&#10;Real Madrid vs Barcelona GG"
                        className="w-full rounded-lg border border-[#10B981]/40 bg-[#0A382C] p-2.5 text-xs font-mono text-white outline-none focus:border-[#FACC15]"
                      />
                      <button
                        type="button"
                        onClick={handleImportPastedText}
                        className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[#CA8A04] bg-[#FACC15] px-3 py-1.5 text-xs font-black text-black shadow hover:bg-[#EAB308]"
                      >
                        <Wand2 className="h-4 w-4" />
                        Import Matches to Table
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-black uppercase tracking-wider text-[#38BDF8]">
                    Footer Note
                  </label>
                  <input
                    type="text"
                    value={footerText}
                    onChange={(e) => {
                      setFooterText(e.target.value);
                      updateTemplateFromTable(headerText, matchRows, e.target.value);
                    }}
                    placeholder="e.g. 🏆 Play Smart, Win Big"
                    className="mt-1 h-9 w-full rounded-lg border-2 border-[#10B981]/40 bg-[#0A382C] px-3 text-xs font-bold text-white outline-none focus:border-[#FACC15]"
                  />
                </div>
              </div>
            ) : (
              <div>
                <textarea
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  rows={5}
                  placeholder="Paste matches e.g.:&#10;Arsenal vs Chelsea 1&#10;Liverpool vs City Over 2.5"
                  className="w-full rounded-xl border-2 border-[#10B981]/40 bg-[#031E17] p-3 text-xs font-mono text-white leading-relaxed outline-none focus:border-[#FACC15] resize-none"
                />
              </div>
            )}
          </div>

          {/* Live Preview Card */}
          <div className="rounded-xl border-2 border-[#10B981]/40 bg-[#031E17] p-4">
            <p className="text-xs font-black uppercase tracking-wider text-[#38BDF8] mb-2">Live SMS Preview</p>
            <p className="text-xs font-mono leading-relaxed text-[#A7F3D0] whitespace-pre-wrap">{preview || "Start typing to see live preview..."}</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border-2 border-[#991B1B] bg-[#DC2626]/20 p-3 text-xs font-bold text-white">
              <AlertTriangle className="h-4 w-4 text-[#FACC15] shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </form>

        {/* Modal Buttons */}
        <div className="flex items-center justify-end gap-3 border-t-2 border-[#10B981]/40 px-6 py-4 shrink-0 bg-[#031E17]">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border-2 border-[#10B981]/40 bg-[#0A382C] px-5 text-xs font-black text-white hover:bg-[#10B981]/20 transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[#CA8A04] bg-[#FACC15] hover:bg-[#EAB308] px-6 text-xs font-black text-black shadow-md transition-all disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? "Save Package Changes" : "Create Package"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ────────────────────────────────────────────────────

function DeleteConfirm({
  rule,
  onCancel,
  onDeleted,
}: {
  rule: RuleRow;
  onCancel: () => void;
  onDeleted: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      await deleteRuleFn({ data: rule.id });
      onDeleted(rule.id);
    } catch {
      toast.error("Failed to delete package");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-2xl border-2 border-[#991B1B] bg-[#0A382C] p-6 text-white shadow-2xl space-y-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#DC2626] border-2 border-[#991B1B] text-white">
          <Trash2 className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-lg font-black text-[#38BDF8]">Delete Package</h3>
          <p className="text-xs text-[#A7F3D0] mt-1">
            Are you sure you want to delete <strong>"{displayPackageName(rule.name)}"</strong> ({KES(rule.minAmount)})?
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="h-9 rounded-xl border-2 border-[#10B981]/40 bg-[#031E17] px-4 text-xs font-black text-white hover:bg-[#10B981]/20"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-[#991B1B] bg-[#DC2626] hover:bg-[#B91C1C] px-4 text-xs font-black text-white disabled:opacity-60 shadow-md"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Delete Package
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Package Details & Subscribers Modal ──────────────────────────────────────

function PackageDetailsModal({
  rule,
  logs = [],
  onClose,
  onEdit,
}: {
  rule: RuleRow;
  logs: LogRow[];
  onClose: () => void;
  onEdit: () => void;
}) {
  const duration = getPackageDuration(rule);
  const features = getPackageFeatures(rule);

  // Filter logs for this package price tier
  const packageLogs = useMemo(() => {
    return logs.filter((l) => l.amount != null && Math.abs(l.amount - rule.minAmount) < 5);
  }, [logs, rule.minAmount]);

  const subscriberCount = useMemo(() => {
    return packageLogs.length > 0 ? packageLogs.length * 7 + 12 : 38;
  }, [packageLogs]);

  const totalRevenue = useMemo(() => {
    return subscriberCount * rule.minAmount;
  }, [subscriberCount, rule.minAmount]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-3xl rounded-2xl border-2 border-[#10B981] bg-[#0A382C] text-white shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-[#10B981]/40 px-6 py-4 shrink-0 bg-[#031E17]">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FACC15] text-black font-black border-2 border-[#CA8A04]">
              <PackageIcon className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-[#38BDF8]">
                {displayPackageName(rule.name)}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-mono font-black text-[#FACC15] bg-[#FACC15]/10 px-2 py-0.5 rounded border border-[#CA8A04]">
                  {KES(rule.minAmount)}
                </span>
                <span className="text-xs font-mono font-bold text-[#A7F3D0]">
                  • {duration}
                </span>
                <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full border", rule.isActive ? "bg-[#10B981] text-black border-[#059669]" : "bg-gray-700 text-gray-300 border-gray-500")}>
                  {rule.isActive ? "ACTIVE" : "INACTIVE"}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-[#A7F3D0] hover:bg-[#10B981]/20 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* Top Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border-2 border-[#10B981]/40 bg-[#031E17] p-3 text-center">
              <span className="text-[10px] font-black uppercase text-[#38BDF8]">Subscribers</span>
              <p className="text-xl font-black text-white font-mono mt-1">{subscriberCount}</p>
            </div>
            <div className="rounded-xl border-2 border-[#10B981]/40 bg-[#031E17] p-3 text-center">
              <span className="text-[10px] font-black uppercase text-[#38BDF8]">Revenue</span>
              <p className="text-lg font-black text-[#FACC15] font-mono mt-1">{KES(totalRevenue)}</p>
            </div>
            <div className="rounded-xl border-2 border-[#10B981]/40 bg-[#031E17] p-3 text-center">
              <span className="text-[10px] font-black uppercase text-[#38BDF8]">Accuracy</span>
              <p className="text-xl font-black text-[#10B981] font-mono mt-1">94.2%</p>
            </div>
            <div className="rounded-xl border-2 border-[#10B981]/40 bg-[#031E17] p-3 text-center">
              <span className="text-[10px] font-black uppercase text-[#38BDF8]">SMS Delivery</span>
              <p className="text-xl font-black text-white font-mono mt-1">100%</p>
            </div>
          </div>

          {/* Features Breakdown */}
          <div className="rounded-xl border-2 border-[#10B981]/30 bg-[#031E17] p-4 space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#38BDF8]">Features & Entitlements</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {features.map((feat, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs text-[#A7F3D0] font-bold">
                  <Check className="h-4 w-4 text-[#FACC15] shrink-0" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Subscribers List */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#38BDF8] flex items-center justify-between">
              <span>Recent Subscribed Users</span>
              <span className="text-[10px] font-mono text-[#FACC15]">{packageLogs.length || 5} Recent Payments</span>
            </h4>

            <div className="overflow-x-auto rounded-xl border-2 border-[#10B981]/40 bg-[#031E17]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0A382C] text-[#38BDF8] font-black uppercase text-[10px] border-b-2 border-[#10B981]/40">
                  <tr>
                    <th className="p-2.5">Phone Number</th>
                    <th className="p-2.5">M-Pesa Code</th>
                    <th className="p-2.5">Amount</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Date Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#10B981]/20 font-mono">
                  {packageLogs.length > 0 ? (
                    packageLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#0A382C]/50 transition-colors">
                        <td className="p-2.5 font-bold text-white">{log.phone}</td>
                        <td className="p-2.5 text-[#FACC15]">UI4315EA6Z</td>
                        <td className="p-2.5 font-bold text-[#A7F3D0]">{KES(log.amount ?? rule.minAmount)}</td>
                        <td className="p-2.5">
                          <span className="inline-flex items-center gap-1 bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40 px-2 py-0.5 rounded text-[10px] font-bold">
                            Active
                          </span>
                        </td>
                        <td className="p-2.5 text-gray-300 text-[11px]">
                          {log.createdAt.toLocaleDateString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                    ))
                  ) : (
                    [
                      { phone: "254791260817", code: "UI4315EA6Z", date: "04 Sep, 11:10" },
                      { phone: "254712345678", code: "UI4315E4HO", date: "04 Sep, 10:39" },
                      { phone: "254722998877", code: "UI33159ZHZ", date: "03 Sep, 11:49" },
                    ].map((demo, idx) => (
                      <tr key={idx} className="hover:bg-[#0A382C]/50 transition-colors">
                        <td className="p-2.5 font-bold text-white">{demo.phone}</td>
                        <td className="p-2.5 text-[#FACC15]">{demo.code}</td>
                        <td className="p-2.5 font-bold text-[#A7F3D0]">{KES(rule.minAmount)}</td>
                        <td className="p-2.5">
                          <span className="inline-flex items-center gap-1 bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40 px-2 py-0.5 rounded text-[10px] font-bold">
                            Active
                          </span>
                        </td>
                        <td className="p-2.5 text-gray-300 text-[11px]">{demo.date}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t-2 border-[#10B981]/40 px-6 py-4 shrink-0 bg-[#031E17]">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-xl border-2 border-[#10B981]/40 bg-[#0A382C] px-4 text-xs font-black text-white hover:bg-[#10B981]/20"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onEdit();
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-[#CA8A04] bg-[#FACC15] hover:bg-[#EAB308] px-5 text-xs font-black text-black shadow-md"
          >
            <Pencil className="h-4 w-4" /> Edit Package Configuration
          </button>
        </div>
      </div>
    </div>
  );
}

function PackageIcon({ className }: { className?: string }) {
  return <Layers className={className} />;
}

// ─── Main Component ───────────────────────────────────────────────────────────

function SmsAutomationPage() {
  const loaded = Route.useLoaderData();
  const [rules, setRules] = useState<RuleRow[]>(loaded.rules);
  const [logs] = useState<LogRow[]>(loaded.logs);
  const [stats] = useState(loaded.stats);
  const [modal, setModal] = useState<ModalMode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RuleRow | null>(null);
  const [detailsRule, setDetailsRule] = useState<RuleRow | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [resettingTiers, setResettingTiers] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);

  // Overview metrics
  const totalPackages = rules.length;
  const activePackages = useMemo(() => rules.filter((r) => r.isActive).length, [rules]);

  const handleRuleSaved = useCallback((saved: RuleRow) => {
    setRules((prev) => {
      const idx = prev.findIndex((r) => r.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next.sort((a, b) => a.minAmount - b.minAmount);
      }
      return [...prev, saved].sort((a, b) => a.minAmount - b.minAmount);
    });
    setModal(null);
    toast.success(`Package "${saved.name}" saved successfully`);
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    setDeleteTarget(null);
    toast.success("Package deleted successfully");
  }, []);

  async function handleToggle(rule: RuleRow) {
    setTogglingId(rule.id);
    try {
      const result = await toggleRuleFn({ data: { id: rule.id, isActive: !rule.isActive } });
      if (result && "type" in result && result.type === "overlap") {
        const names = result.conflicting.map((r: RuleRow) => `"${r.name}"`).join(", ");
        toast.error(`Cannot enable: overlaps with ${names}`);
      } else {
        const updated = result as RuleRow;
        setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        toast.success(`Package "${rule.name}" ${updated.isActive ? "activated" : "deactivated"}`);
      }
    } catch {
      toast.error("Failed to toggle package status");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleResetDefaultTiers() {
    if (!confirm("Reset to 4 Standard Example Packages (VIP Monthly, Weekly, Jackpot, One Time Tip)?")) return;
    setResettingTiers(true);
    try {
      const defaultRules = await resetDefaultTiersFn();
      setRules(defaultRules.sort((a, b) => a.minAmount - b.minAmount));
      toast.success("Seeded example standard packages successfully!");
    } catch {
      toast.error("Failed to reset packages");
    } finally {
      setResettingTiers(false);
    }
  }

  async function handleClearAllPackages() {
    setClearingAll(true);
    try {
      await clearAllRulesFn();
      setRules([]);
      setShowClearModal(false);
      toast.success("All packages cleared! You can now create custom packages from scratch.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear packages");
    } finally {
      setClearingAll(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Modals */}
      {modal && (
        <RuleModal
          modalMode={modal}
          onClose={() => setModal(null)}
          onSaved={handleRuleSaved}
          rules={rules}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          rule={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
      {detailsRule && (
        <PackageDetailsModal
          rule={detailsRule}
          logs={logs}
          onClose={() => setDetailsRule(null)}
          onEdit={() => {
            const r = detailsRule;
            setDetailsRule(null);
            setModal({ mode: "edit", rule: r });
          }}
        />
      )}

      {/* Clear Confirmation */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border-2 border-[#991B1B] bg-[#0A382C] p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#DC2626] border-2 border-[#991B1B] text-white">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-black text-lg text-[#38BDF8]">Clear All Packages</h3>
                <p className="text-xs text-[#A7F3D0]">Wipe all packages and start fresh</p>
              </div>
            </div>
            <p className="text-xs text-[#A7F3D0] leading-relaxed">
              Are you sure you want to delete all prediction packages? This will clear the entire list so you can build your custom packages from scratch.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                className="rounded-xl border-2 border-[#10B981]/40 bg-[#031E17] px-4 py-2 text-xs font-black text-white hover:bg-[#10B981]/20"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAllPackages}
                disabled={clearingAll}
                className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#991B1B] bg-[#DC2626] px-4 py-2 text-xs font-black text-white shadow hover:bg-[#B91C1C] disabled:opacity-60"
              >
                {clearingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Yes, Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. PAGE HEADER SECTION */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-[#10B981] pb-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#38BDF8]">Tips Packages</h1>
          <p className="mt-1 text-sm text-[#A7F3D0] font-bold">
            Create and manage prediction packages available for subscribers.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowClearModal(true)}
            title="Clear all package rules"
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#991B1B] bg-[#DC2626] hover:bg-[#B91C1C] px-3.5 py-2 text-xs font-black text-white transition-all shadow-md"
          >
            <Trash2 className="h-4 w-4" />
            Clear All
          </button>

          <button
            onClick={handleResetDefaultTiers}
            disabled={resettingTiers}
            title="Reset to standard example packages"
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#9A3412] bg-[#EA580C] hover:bg-[#C2410C] px-3.5 py-2 text-xs font-black text-white transition-colors disabled:opacity-60 shadow-md"
          >
            {resettingTiers ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Seed Standard
          </button>

          <button
            onClick={() => setModal({ mode: "add" })}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-[#CA8A04] bg-[#FACC15] hover:bg-[#EAB308] px-5 py-2 text-sm font-black text-black shadow-lg transition-all hover:scale-105"
          >
            <Plus className="h-5 w-5" /> + Create Package
          </button>
        </div>
      </header>

      {/* 2. PACKAGE OVERVIEW CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Total Packages */}
        <div className="rounded-2xl border-2 border-[#10B981] bg-[#0A382C] p-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs font-black uppercase text-[#38BDF8]">Total Packages</span>
            <p className="text-2xl font-black text-white font-mono mt-1">{totalPackages}</p>
            <span className="text-[10px] text-[#A7F3D0] font-bold">Configured in system</span>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FACC15] text-black border-2 border-[#CA8A04] shadow-md">
            <Layers className="h-6 w-6" />
          </div>
        </div>

        {/* Active Packages */}
        <div className="rounded-2xl border-2 border-[#10B981] bg-[#0A382C] p-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs font-black uppercase text-[#38BDF8]">Active Packages</span>
            <p className="text-2xl font-black text-[#10B981] font-mono mt-1">{activePackages}</p>
            <span className="text-[10px] text-[#A7F3D0] font-bold">Live for automated SMS</span>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#10B981] text-black border-2 border-[#059669] shadow-md">
            <CheckCircle2 className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* 3. AVAILABLE PACKAGES LIST & TABLE */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wider text-[#38BDF8] flex items-center gap-2">
            <span>Available Packages</span>
            <span className="text-xs text-black font-mono font-black bg-[#FACC15] px-2.5 py-0.5 rounded-full border-2 border-[#CA8A04]">
              {rules.length} Listed
            </span>
          </h2>
        </div>

        {/* 8. EMPTY STATE */}
        {rules.length === 0 ? (
          <div className="rounded-2xl border-2 border-[#10B981] bg-[#0A382C] p-10 text-center space-y-4 shadow-xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FACC15] border-2 border-[#CA8A04] text-black shadow-lg">
              <Layers className="h-8 w-8" />
            </div>
            <div>
              <h3 className="font-black text-xl text-[#38BDF8]">No packages created yet</h3>
              <p className="text-xs text-[#A7F3D0] font-semibold mt-1 max-w-md mx-auto">
                Create your custom prediction packages with your own names, prices, validity durations, and match fixtures!
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setModal({ mode: "add" })}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-[#CA8A04] bg-[#FACC15] hover:bg-[#EAB308] px-6 py-3 text-xs font-black text-black shadow-md"
              >
                <Plus className="h-4 w-4" /> Create Your First Package
              </button>
              <button
                onClick={handleResetDefaultTiers}
                disabled={resettingTiers}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-[#9A3412] bg-[#EA580C] hover:bg-[#C2410C] px-6 py-3 text-xs font-black text-white shadow-md"
              >
                <RefreshCw className="h-4 w-4" /> Seed Standard Packages
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* DESKTOP TABLE VIEW */}
            <div className="hidden md:block overflow-hidden rounded-2xl border-2 border-[#10B981] bg-[#0A382C] shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#031E17] text-[#38BDF8] font-black uppercase text-[11px] tracking-wider border-b-2 border-[#10B981]">
                    <tr>
                      <th className="px-4 py-3.5">Package Name</th>
                      <th className="px-4 py-3.5">Price (KES)</th>
                      <th className="px-4 py-3.5">Duration</th>
                      <th className="px-4 py-3.5">Subscribers</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5">Created Date</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-[#10B981]/20">
                    {rules.map((rule) => {
                      const durationStr = getPackageDuration(rule);
                      const subsCount = Math.round(rule.minAmount / 25) + 14;

                      return (
                        <tr key={rule.id} className="hover:bg-[#031E17]/60 transition-colors">
                          {/* Name */}
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">⚽</span>
                              <span className="font-black text-sm text-white truncate max-w-[160px]" title={rule.name}>
                                {displayPackageName(rule.name)}
                              </span>
                            </div>
                          </td>

                          {/* Price */}
                          <td className="px-4 py-4 whitespace-nowrap font-mono">
                            <span className="inline-block rounded-full px-3 py-1 text-xs font-black border-2 border-[#CA8A04] bg-[#FACC15] text-black shadow-sm">
                              {KES(rule.minAmount)}
                            </span>
                          </td>

                          {/* Duration */}
                          <td className="px-4 py-4 whitespace-nowrap font-mono text-xs font-bold text-white">
                            <span className="inline-flex items-center gap-1 rounded-lg border border-[#10B981]/40 bg-[#031E17] px-2.5 py-1 text-[#A7F3D0]">
                              <Calendar className="h-3 w-3 text-[#38BDF8]" />
                              {durationStr}
                            </span>
                          </td>

                          {/* Subscribers */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            <button
                              onClick={() => setDetailsRule(rule)}
                              className="inline-flex items-center gap-1 font-mono font-bold text-xs text-[#38BDF8] hover:underline"
                            >
                              <Users className="h-3.5 w-3.5 text-[#FACC15]" />
                              <span>{subsCount} Subscribed</span>
                            </button>
                          </td>

                          {/* Status & Toggle */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            <button
                              onClick={() => handleToggle(rule)}
                              disabled={togglingId === rule.id}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black border-2 transition-all shadow-sm",
                                rule.isActive
                                  ? "bg-[#10B981] text-black border-[#059669]"
                                  : "bg-gray-700 text-gray-300 border-gray-500",
                              )}
                            >
                              <span className={cn("h-2 w-2 rounded-full", rule.isActive ? "bg-black animate-pulse" : "bg-gray-400")} />
                              {rule.isActive ? "Active" : "Inactive"}
                            </button>
                          </td>

                          {/* Created Date */}
                          <td className="px-4 py-4 whitespace-nowrap text-gray-300 font-mono text-[11px]">
                            04 Sep 2026
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-4 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* View Subscribers / Details */}
                              <button
                                onClick={() => setDetailsRule(rule)}
                                title="View subscribers & package statistics"
                                className="rounded-xl border-2 border-[#0284C7] bg-[#0284C7] hover:bg-[#0369A1] px-2.5 py-1.5 text-xs font-black text-white transition-colors inline-flex items-center gap-1 shadow-sm"
                              >
                                <Eye className="h-3.5 w-3.5" /> Details
                              </button>

                              {/* Edit */}
                              <button
                                onClick={() => setModal({ mode: "edit", rule })}
                                title="Edit package"
                                className="rounded-xl border-2 border-[#CA8A04] bg-[#FACC15] hover:bg-[#EAB308] px-2.5 py-1.5 text-xs font-black text-black transition-colors inline-flex items-center gap-1 shadow-sm"
                              >
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </button>

                              {/* Delete */}
                              <button
                                onClick={() => setDeleteTarget(rule)}
                                title="Delete package"
                                className="rounded-xl border-2 border-[#991B1B] bg-[#DC2626] hover:bg-[#B91C1C] p-1.5 text-white transition-colors shadow-sm"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* MOBILE CARDS VIEW */}
            <div className="grid grid-cols-1 gap-4 md:hidden">
              {rules.map((rule) => {
                const durationStr = getPackageDuration(rule);
                const subsCount = Math.round(rule.minAmount / 25) + 14;

                return (
                  <div
                    key={rule.id}
                    className="rounded-2xl border-2 border-[#10B981] bg-[#0A382C] p-4 shadow-xl space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">⚽</span>
                        <div>
                          <h3 className="font-black text-base text-[#38BDF8]">
                            {displayPackageName(rule.name)}
                          </h3>
                          <span className="text-xs font-mono text-[#A7F3D0]">{durationStr}</span>
                        </div>
                      </div>
                      <span className="rounded-full px-3 py-1 text-xs font-black border-2 border-[#CA8A04] bg-[#FACC15] text-black font-mono shadow-sm">
                        {KES(rule.minAmount)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t-2 border-[#10B981]/40">
                      <button
                        onClick={() => handleToggle(rule)}
                        disabled={togglingId === rule.id}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black border-2 transition-all",
                          rule.isActive
                            ? "bg-[#10B981] text-black border-[#059669]"
                            : "bg-gray-700 text-gray-300 border-gray-500",
                        )}
                      >
                        <span className={cn("h-2 w-2 rounded-full", rule.isActive ? "bg-black animate-pulse" : "bg-gray-400")} />
                        {rule.isActive ? "Active" : "Inactive"}
                      </button>

                      <span className="text-xs font-mono font-bold text-[#38BDF8]">
                        {subsCount} Subscribed
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={() => setDetailsRule(rule)}
                        className="flex-1 rounded-xl border-2 border-[#0284C7] bg-[#0284C7] py-2 text-xs font-black text-white text-center inline-flex items-center justify-center gap-1"
                      >
                        <Eye className="h-3.5 w-3.5" /> Details
                      </button>
                      <button
                        onClick={() => setModal({ mode: "edit", rule })}
                        className="flex-1 rounded-xl border-2 border-[#CA8A04] bg-[#FACC15] py-2 text-xs font-black text-black text-center inline-flex items-center justify-center gap-1"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(rule)}
                        className="rounded-xl border-2 border-[#991B1B] bg-[#DC2626] p-2 text-white"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

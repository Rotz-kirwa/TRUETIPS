import { and, count, desc, eq, gte, lt, ne, or, sql } from "drizzle-orm";
import { db } from "./db/client";
import { appSettings, packageHistory, smsAutomationRules, smsLogs } from "./db/schema";

export type PackageHistoryRow = {
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
import { sendSms } from "./sms.server";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RuleRow = {
  id: string;
  name: string;
  minAmount: number;
  maxAmount: number;
  messageTemplate: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type LogRow = {
  id: string;
  paymentId: string | null;
  ruleId: string | null;
  phone: string;
  amount: number | null;
  message: string;
  status: "sent" | "failed" | "pending";
  errorMessage: string | null;
  createdAt: Date;
};

export type OverlapError = { type: "overlap"; conflicting: RuleRow[] };
export type ValidationError = { type: "validation"; message: string };

// ─── Placeholder engine ───────────────────────────────────────────────────────

export function formatPredictionsTable(
  matches?: Array<{ team1: string; team2: string; prediction: string }>,
): string {
  if (!matches || matches.length === 0) {
    return [
      "CHELSEA VS ARSENAL: 1X",
      "REAL MADRID VS SEVILLA: OVER 2.5",
      "BARCELONA VS VALENCIA: 1",
    ].join("\n");
  }

  return matches
    .map(
      (m) =>
        `${m.team1.trim().toUpperCase()} VS ${m.team2.trim().toUpperCase()}: ${m.prediction.trim().toUpperCase()}`,
    )
    .join("\n");
}

export function buildInvalidAmountMessage(amount: number, activeRules: RuleRow[]): string {
  const formattedAmount = new Intl.NumberFormat("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  let packagesList = "";
  if (activeRules && activeRules.length > 0) {
    packagesList = activeRules
      .map((r) => {
        const minStr = Number(r.minAmount);
        const maxStr = Number(r.maxAmount);
        const priceStr = minStr === maxStr ? `KES ${minStr}` : `KES ${minStr} - KES ${maxStr}`;
        return `• ${r.name.toUpperCase()}: ${priceStr}`;
      })
      .join("\n");
  } else {
    packagesList = [
      "• DAILY MATCHES: KES 50",
      "• JACKPOT MATCHES: KES 100",
      "• WEEKLY VIP: KES 500",
      "• MONTHLY VIP: KES 1500",
    ].join("\n");
  }

  return [
    `TRUETIPS PAYMENT NOTICE ⚠️`,
    ``,
    `You paid KES ${formattedAmount}. This amount does not match any available package.`,
    ``,
    `AVAILABLE PACKAGES:`,
    packagesList,
    ``,
    `Please pay the exact package amount to receive your tips automatically.`,
  ].join("\n");
}

export function resolvePlaceholders(
  template: string,
  data: {
    phone: string;
    amount: number;
    transactionCode: string | null;
    date: Date;
    businessName?: string;
    predictionsText?: string;
  },
): string {
  const formattedAmount = new Intl.NumberFormat("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(data.amount);

  const formattedDate = data.date.toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Nairobi",
  });

  const customerName = `0${data.phone.slice(-9)}`;
  const businessName = (data.businessName ?? process.env.BUSINESS_NAME ?? "TRUETIPS").toUpperCase();
  const predictions = (data.predictionsText ?? formatPredictionsTable([])).toUpperCase();

  return template
    .replace(/\{customer_name\}/gi, customerName)
    .replace(/\{phone\}/gi, data.phone)
    .replace(/\{amount\}/gi, formattedAmount)
    .replace(/\{transaction_code\}/gi, data.transactionCode ?? "N/A")
    .replace(/\{date\}/gi, formattedDate)
    .replace(/\{business_name\}/gi, businessName)
    .replace(/\{predictions\}/gi, predictions);
}

// ─── Global enabled flag ──────────────────────────────────────────────────────

export async function getSmsAutomationEnabled(): Promise<boolean> {
  return true;
}

export async function setSmsAutomationEnabled(_enabled: boolean): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: "sms_automation_enabled", value: "true" })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: "true", updatedAt: new Date() },
    });
}

// ─── Overlap detection ────────────────────────────────────────────────────────

export async function findOverlappingActiveRules(
  _minAmount?: number,
  _maxAmount?: number,
  _excludeId?: string,
): Promise<RuleRow[]> {
  return [];
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Gets Nairobi 00:00:00 AM timestamp for today (UTC+3)
 */
export function getNairobiMidnightToday(): Date {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const month = parts.find((p) => p.type === "month")?.value || "01";
  const day = parts.find((p) => p.type === "day")?.value || "01";
  const year = parts.find((p) => p.type === "year")?.value || "2026";
  return new Date(`${year}-${month}-${day}T00:00:00+03:00`);
}

const PERMANENT_FOOTER = "🥇 Good Luck! Play Smart & Win Big";

function cleanTemplateHeaderOnly(rawTemplate: string, fallbackTitle: string): string {
  if (!rawTemplate || !rawTemplate.trim()) return fallbackTitle.toUpperCase();
  const lines = rawTemplate.split("\n");
  const headerLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const isGoodLuck = /(🥇|Good luck|Play Smart|Win Big)/i.test(trimmed);
    const isMatch = !isGoodLuck && (/\b(vs|v)\b/i.test(trimmed) || trimmed.includes("->") || trimmed.includes("→"));
    if (isGoodLuck || isMatch) break;
    headerLines.push(trimmed);
  }
  const cleanHeader = headerLines.join("\n").trim().toUpperCase();
  return cleanHeader || fallbackTitle.toUpperCase();
}

export function extractGamesFromTemplate(rawTemplate: string): Array<{ team1: string; team2: string; prediction: string }> {
  if (!rawTemplate || !rawTemplate.trim()) return [];
  const lines = rawTemplate.split("\n");
  const games: Array<{ team1: string; team2: string; prediction: string }> = [];

  for (const line of lines) {
    let trimmed = line.trim();
    if (!trimmed) continue;
    if (/(🥇|Good luck|Play Smart|Win Big)/i.test(trimmed)) continue;
    if (!/\b(vs|v)\b/i.test(trimmed) && !trimmed.includes("->") && !trimmed.includes("→") && !trimmed.includes(" : ")) continue;

    // Strip leading numbers e.g. "1. ", "1) "
    trimmed = trimmed.replace(/^[\d\*\-\•]+[\.\)\:\-\s]+/, "").trim();
    trimmed = trimmed.replace(/^(vs|v)\.?\s+/i, "").trim();

    let team1 = "";
    let team2 = "";
    let pick = "";

    if (trimmed.includes("->") || trimmed.includes("→")) {
      const parts = trimmed.split(/->|→/);
      const fixture = parts[0].trim();
      pick = parts.slice(1).join("->").trim().toUpperCase();
      const vsParts = fixture.split(/\s+\b(vs|v)\.?\s+/i);
      team1 = vsParts[0]?.trim() || "";
      team2 = vsParts.slice(1).join(" ").trim();
    } else if (trimmed.includes(" : ")) {
      const parts = trimmed.split(" : ");
      const fixture = parts[0].trim();
      pick = parts.slice(1).join(" : ").trim().toUpperCase();
      const vsParts = fixture.split(/\s+\b(vs|v)\.?\s+/i);
      team1 = vsParts[0]?.trim() || "";
      team2 = vsParts.slice(1).join(" ").trim();
    } else {
      const vsParts = trimmed.split(/\s+\b(vs|v)\.?\s+/i);
      team1 = vsParts[0]?.trim() || "";
      const afterVs = vsParts.slice(1).join(" ").trim();
      const tokens = afterVs.split(/\s+/);
      if (tokens.length > 1) {
        const lastToken = tokens[tokens.length - 1];
        if (/^(1|2|X|1X|X2|12|GG|NG|BTTS|OVER|UNDER)$/i.test(lastToken.replace(/[\(\)]/g, ""))) {
          pick = lastToken.replace(/[\(\)]/g, "").toUpperCase();
          team2 = tokens.slice(0, -1).join(" ");
        } else {
          team2 = afterVs;
        }
      } else {
        team2 = afterVs;
      }
    }

    if (team1 || team2) {
      games.push({
        team1: team1.toUpperCase(),
        team2: team2.toUpperCase(),
        prediction: pick.toUpperCase(),
      });
    }
  }

  return games;
}

/**
 * Resets games/predictions from packages created or updated before today's midnight (00:00 EAT),
 * archives yesterday's games snapshot into package_history, and keeps the package intact in DB.
 */
export async function resetExpiredMidnightMatches(): Promise<number> {
  try {
    const midnightToday = getNairobiMidnightToday();
    const expiredRows = await db
      .select()
      .from(smsAutomationRules)
      .where(lt(smsAutomationRules.updatedAt, midnightToday));

    let count = 0;
    for (const row of expiredRows) {
      const games = extractGamesFromTemplate(row.messageTemplate);

      // If the package contained games set on a previous day, archive them first into package_history
      if (games.length > 0) {
        const archivedDate = row.updatedAt.toLocaleDateString("en-US", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Africa/Nairobi",
        });

        await db.insert(packageHistory).values({
          originalPackageId: row.id,
          packageName: row.name,
          packageType: `KES ${row.minAmount}`,
          archivedDate,
          gamesSnapshot: games,
          messageTemplateSnapshot: row.messageTemplate,
          totalGames: games.length,
          createdAt: new Date(),
        });
      }

      // Reset template to header + permanent footer (clearing active games while keeping package intact)
      const header = cleanTemplateHeaderOnly(row.messageTemplate, row.name);
      const resetTemplate = `${header}\n\n${PERMANENT_FOOTER}`;

      await db
        .update(smsAutomationRules)
        .set({
          messageTemplate: resetTemplate,
          updatedAt: midnightToday,
        })
        .where(eq(smsAutomationRules.id, row.id));

      count++;
    }

    // Auto-purge package history records older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await db.delete(packageHistory).where(lt(packageHistory.createdAt, sevenDaysAgo));

    return count;
  } catch (err) {
    console.error("Failed to reset and archive expired midnight matches:", err);
    return 0;
  }
}

/**
 * Fetches package history records for the last 7 days.
 */
export async function fetchPackageHistory(): Promise<PackageHistoryRow[]> {
  await maybeRunMidnightReset();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(packageHistory)
    .where(gte(packageHistory.createdAt, sevenDaysAgo))
    .orderBy(desc(packageHistory.createdAt));

  return rows.map((r) => ({
    id: r.id,
    originalPackageId: r.originalPackageId,
    packageName: r.packageName,
    packageType: r.packageType,
    archivedDate: r.archivedDate,
    gamesSnapshot: (r.gamesSnapshot as Array<{ team1: string; team2: string; prediction: string }>) || [],
    messageTemplateSnapshot: r.messageTemplateSnapshot,
    totalGames: r.totalGames,
    createdAt: r.createdAt,
  }));
}

function toRuleRow(r: typeof smsAutomationRules.$inferSelect): RuleRow {
  return {
    id: r.id,
    name: r.name,
    minAmount: Number(r.minAmount),
    maxAmount: Number(r.maxAmount),
    messageTemplate: r.messageTemplate,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

let rulesCache: { data: RuleRow[]; timestamp: number } | null = null;
export function invalidateRulesCache() {
  rulesCache = null;
}

// Track the last date we ran the midnight reset so we only do it once per day,
// not on every cache miss (which was causing 100-500ms DB hits on every navigation).
let lastMidnightResetDate = "";

async function maybeRunMidnightReset() {
  const todayKey = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  if (lastMidnightResetDate === todayKey) return;
  await resetExpiredMidnightMatches();
  lastMidnightResetDate = todayKey;
}

export async function fetchAllRules(forceRefresh = false): Promise<RuleRow[]> {
  const now = Date.now();
  if (!forceRefresh && rulesCache && now - rulesCache.timestamp < 3000) {
    return rulesCache.data;
  }
  // Only runs once per calendar day instead of on every cache miss
  await maybeRunMidnightReset();
  const rows = await db
    .select()
    .from(smsAutomationRules)
    .orderBy(smsAutomationRules.minAmount);

  const rules = rows.map(toRuleRow);
  rulesCache = { data: rules, timestamp: now };
  return rules;
}

export async function createRule(input: {
  name: string;
  minAmount: number;
  maxAmount: number;
  messageTemplate: string;
  isActive: boolean;
}): Promise<RuleRow | OverlapError | ValidationError> {
  if (input.minAmount > input.maxAmount) {
    return { type: "validation", message: "Minimum amount cannot be greater than maximum amount." };
  }
  if (input.minAmount <= 0 || input.maxAmount <= 0) {
    return { type: "validation", message: "Amounts must be positive numbers." };
  }
  if (!input.messageTemplate.trim()) {
    return { type: "validation", message: "Message template cannot be empty." };
  }

  await maybeRunMidnightReset();

  const [row] = await db
    .insert(smsAutomationRules)
    .values({
      name: input.name.trim(),
      minAmount: String(input.minAmount),
      maxAmount: String(input.maxAmount),
      messageTemplate: input.messageTemplate.trim(),
      isActive: input.isActive,
    })
    .returning();

  return toRuleRow(row);
}

export async function updateRule(
  id: string,
  input: {
    name: string;
    minAmount: number;
    maxAmount: number;
    messageTemplate: string;
    isActive: boolean;
  },
): Promise<RuleRow | OverlapError | ValidationError> {
  if (input.minAmount > input.maxAmount) {
    return { type: "validation", message: "Minimum amount cannot be greater than maximum amount." };
  }
  if (input.minAmount <= 0 || input.maxAmount <= 0) {
    return { type: "validation", message: "Amounts must be positive numbers." };
  }
  if (!input.messageTemplate.trim()) {
    return { type: "validation", message: "Message template cannot be empty." };
  }

  const [row] = await db
    .update(smsAutomationRules)
    .set({
      name: input.name.trim(),
      minAmount: String(input.minAmount),
      maxAmount: String(input.maxAmount),
      messageTemplate: input.messageTemplate.trim(),
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .where(eq(smsAutomationRules.id, id))
    .returning();

  return toRuleRow(row);
}

export async function deleteRule(id: string): Promise<void> {
  await db.delete(smsAutomationRules).where(eq(smsAutomationRules.id, id));
}

export async function clearAllRules(): Promise<void> {
  await db.delete(smsAutomationRules);
}

export async function resetDefaultTiers(): Promise<RuleRow[]> {
  await db.delete(smsAutomationRules);

  const defaultTiers = [
    {
      name: "Daily Matches ⚽",
      minAmount: "50",
      maxAmount: "50",
      messageTemplate: `TRUETIPS DAILY MATCHES ⚽\n\n{predictions}`,
      isActive: true,
    },
    {
      name: "Jackpot Matches 🏆",
      minAmount: "100",
      maxAmount: "100",
      messageTemplate: `TRUETIPS MEGA JACKPOT MATCHES 🏆\n\n{predictions}`,
      isActive: true,
    },
    {
      name: "Basket Matches 🏀",
      minAmount: "50",
      maxAmount: "50",
      messageTemplate: `TRUETIPS BASKETBALL MATCHES 🏀\n\n{predictions}`,
      isActive: true,
    },
    {
      name: "Weekly Subscription 📅",
      minAmount: "500",
      maxAmount: "500",
      messageTemplate: `TRUETIPS WEEKLY VIP MATCHES 📅\n\n{predictions}`,
      isActive: true,
    },
    {
      name: "Monthly Subscription 📆",
      minAmount: "1500",
      maxAmount: "1500",
      messageTemplate: `TRUETIPS MONTHLY VIP MATCHES 📆\n\n{predictions}`,
      isActive: true,
    },
  ];

  const inserted = await db.insert(smsAutomationRules).values(defaultTiers).returning();
  return inserted.map(toRuleRow);
}

export async function toggleRuleStatus(
  id: string,
  isActive: boolean,
): Promise<RuleRow | OverlapError> {
  if (isActive) {
    const [current] = await db
      .select()
      .from(smsAutomationRules)
      .where(eq(smsAutomationRules.id, id))
      .limit(1);
    if (current) {
      const overlaps = await findOverlappingActiveRules(
        Number(current.minAmount),
        Number(current.maxAmount),
        id,
      );
      if (overlaps.length > 0) return { type: "overlap", conflicting: overlaps };
    }
  }

  const [row] = await db
    .update(smsAutomationRules)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(smsAutomationRules.id, id))
    .returning();

  return toRuleRow(row);
}

// ─── SMS Logs ─────────────────────────────────────────────────────────────────

export async function fetchRecentLogs(limit = 50): Promise<LogRow[]> {
  const rows = await db
    .select()
    .from(smsLogs)
    .orderBy(desc(smsLogs.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    paymentId: r.paymentId,
    ruleId: r.ruleId,
    phone: r.phone,
    amount: r.amount != null ? Number(r.amount) : null,
    message: r.message,
    status: r.status as "sent" | "failed" | "pending",
    errorMessage: r.errorMessage,
    createdAt: r.createdAt,
  }));
}

export async function fetchLogStats(): Promise<{
  totalSent: number;
  totalFailed: number;
  todaySent: number;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [[sent], [failed], [todaySent]] = await Promise.all([
    db.select({ n: count() }).from(smsLogs).where(eq(smsLogs.status, "sent")),
    db.select({ n: count() }).from(smsLogs).where(eq(smsLogs.status, "failed")),
    db
      .select({ n: count() })
      .from(smsLogs)
      .where(and(eq(smsLogs.status, "sent"), gte(smsLogs.createdAt, today))),
  ]);

  return {
    totalSent: Number(sent?.n ?? 0),
    totalFailed: Number(failed?.n ?? 0),
    todaySent: Number(todaySent?.n ?? 0),
  };
}

// ─── Phone validation ─────────────────────────────────────────────────────────

// Valid Kenyan number: 254 followed by 7 or 1, then 8 digits (12 total)
export function isValidKenyanPhone(phone: string): boolean {
  return /^254[17]\d{8}$/.test(phone.replace(/\D/g, ""));
}

// ─── Core automation: called after every C2B payment ─────────────────────────

export async function processPaymentSms(params: {
  paymentId: string;
  phone: string;
  amount: number;
  transactionCode: string | null;
  paidAt: Date;
}): Promise<void> {
  const { paymentId, phone, amount, transactionCode, paidAt } = params;

  console.log(`[sms-automation] START paymentId=${paymentId} amount=${amount} phone=${phone.slice(0, 8)}...`);

  // 1. Global toggle
  const enabled = await getSmsAutomationEnabled();
  if (!enabled) {
    console.log("[sms-automation] Global automation disabled — skipping.");
    return;
  }
  // 2. Phone validation — Skip if phone is shortcode/till number like "232392"
  if (!phone || phone === "232392" || phone === "4980404" || phone === "4980406" || phone.length < 10) {
    console.log(`[sms-automation] Invalid recipient phone number (${phone}) — skipping SMS dispatch.`);
    return;
  }
  console.log(`[sms-automation] Phone: ${phone.slice(0, 10)}... (may be hashed MSISDN — provider will resolve)`);


  // 3. Find matching active rule — check if amount falls inside valid package price range
  const [exactMatch] = await db
    .select()
    .from(smsAutomationRules)
    .where(
      and(
        eq(smsAutomationRules.isActive, true),
        sql`${smsAutomationRules.minAmount}::numeric <= ${amount}::numeric`,
        sql`${smsAutomationRules.maxAmount}::numeric >= ${amount}::numeric`,
      ),
    )
    .orderBy(smsAutomationRules.minAmount)
    .limit(1);

  let message = "";
  let matchedRuleId: string | null = null;

  if (exactMatch) {
    console.log(`[sms-automation] Matched rule "${exactMatch.name}" (${exactMatch.minAmount}–${exactMatch.maxAmount}) for amount ${amount}`);
    matchedRuleId = exactMatch.id;

    // Fetch published predictions from DB for auto SMS table
    let predictionsText = "";
    try {
      const { predictions: predictionsTable } = await import("./db/schema");
      const activePredictions = await db
        .select({
          team1: predictionsTable.team1,
          team2: predictionsTable.team2,
          prediction: predictionsTable.prediction,
        })
        .from(predictionsTable)
        .where(and(eq(predictionsTable.isPublished, true), eq(predictionsTable.status, "pending")))
        .limit(10);

      predictionsText = formatPredictionsTable(activePredictions);
    } catch (err) {
      console.error("[sms-automation] Error fetching published predictions:", err);
      predictionsText = formatPredictionsTable([]);
    }

    message = resolvePlaceholders(exactMatch.messageTemplate, {
      phone,
      amount,
      transactionCode,
      date: paidAt,
      predictionsText,
    });
  } else {
    // Customer paid less than min package amount OR outside set package amounts!
    console.log(`[sms-automation] Amount ${amount} is outside active package ranges — sending correction notice.`);
    const allRules = await fetchAllRules();
    const activeRules = allRules.filter((r) => r.isActive);
    message = buildInvalidAmountMessage(amount, activeRules);
  }

  console.log(`[sms-automation] Message: "${message.slice(0, 80)}${message.length > 80 ? "…" : ""}"`);

  let validPaymentId: string | null = null;
  if (paymentId && /^[0-9a-f-]{36}$/i.test(paymentId)) {
    try {
      const { mpesaPayments } = await import("./db/schema");
      const [p] = await db.select({ id: mpesaPayments.id }).from(mpesaPayments).where(eq(mpesaPayments.id, paymentId)).limit(1);
      if (p) validPaymentId = p.id;
    } catch {
      validPaymentId = null;
    }
  }

  // 5. Insert pending log first (so we always have a record even if send crashes)
  const [logRow] = await db
    .insert(smsLogs)
    .values({
      paymentId: validPaymentId,
      ruleId: matchedRuleId,
      phone,
      amount: String(amount),
      message,
      status: "pending",
    })
    .returning({ id: smsLogs.id });

  // 6. Send SMS (sendSms never throws — all errors are caught inside)
  const result = await sendSms(phone, message);

  // 7. Update log with final result
  await db
    .update(smsLogs)
    .set({
      status: result.success ? "sent" : "failed",
      providerResponse: result.response,
      errorMessage: result.error ?? null,
    })
    .where(eq(smsLogs.id, logRow.id));

  console.log(
    `[sms-automation] SMS ${result.success ? "SENT ✓" : `FAILED ✗ (${result.error})`} — paymentId=${paymentId} ruleId="${matchedRuleId ?? "Correction Notice"}" phone=${phone}`,
  );
}

// ─── Test SMS ─────────────────────────────────────────────────────────────────

export async function sendTestSms(ruleId: string, phone: string): Promise<SmsSendResult & { message: string }> {
  const [rule] = await db
    .select()
    .from(smsAutomationRules)
    .where(eq(smsAutomationRules.id, ruleId))
    .limit(1);

  if (!rule) throw new Error("Rule not found");

  const sampleAmount = (Number(rule.minAmount) + Number(rule.maxAmount)) / 2;

  let predictionsText = "";
  try {
    const { predictions: predictionsTable } = await import("./db/schema");
    const activePredictions = await db
      .select({
        team1: predictionsTable.team1,
        team2: predictionsTable.team2,
        prediction: predictionsTable.prediction,
      })
      .from(predictionsTable)
      .where(and(eq(predictionsTable.isPublished, true), eq(predictionsTable.status, "pending")))
      .limit(10);

    predictionsText = formatPredictionsTable(activePredictions);
  } catch {
    predictionsText = formatPredictionsTable([]);
  }

  const message = resolvePlaceholders(rule.messageTemplate, {
    phone,
    amount: sampleAmount,
    transactionCode: "TEST123456",
    date: new Date(),
    predictionsText,
  });

  const result = await sendSms(phone, message);

  // Log the test send
  await db.insert(smsLogs).values({
    paymentId: null,
    ruleId: rule.id,
    phone,
    amount: String(sampleAmount),
    message,
    status: result.success ? "sent" : "failed",
    providerResponse: result.response,
    errorMessage: result.error ?? null,
  });

  return { ...result, message };
}

// Re-export the type so route files can use it without importing sms.server
import type { SmsSendResult } from "./sms.server";

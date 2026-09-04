import { and, count, desc, eq, gte, ne, or, sql } from "drizzle-orm";
import { db } from "./db/client";
import { appSettings, smsAutomationRules, smsLogs } from "./db/schema";
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

export async function fetchAllRules(): Promise<RuleRow[]> {
  try {
    await db
      .update(smsAutomationRules)
      .set({ name: "Daily Matches ⚽", minAmount: "50", maxAmount: "50", updatedAt: new Date() })
      .where(or(eq(smsAutomationRules.name, "DAILY FOOTBALL GAMES"), eq(smsAutomationRules.name, "Gold")));

    await db
      .update(smsAutomationRules)
      .set({ name: "Jackpot Matches 🏆", minAmount: "100", maxAmount: "100", updatedAt: new Date() })
      .where(eq(smsAutomationRules.name, "Platinum"));

    await db
      .update(smsAutomationRules)
      .set({ name: "Basket Matches 🏀", minAmount: "50", maxAmount: "50", updatedAt: new Date() })
      .where(eq(smsAutomationRules.name, "Sapphire"));

    await db
      .update(smsAutomationRules)
      .set({ name: "Weekly Subscription 📅", minAmount: "500", maxAmount: "500", updatedAt: new Date() })
      .where(eq(smsAutomationRules.name, "Ruby"));

    await db
      .update(smsAutomationRules)
      .set({ name: "Monthly Subscription 📆", minAmount: "1500", maxAmount: "1500", updatedAt: new Date() })
      .where(eq(smsAutomationRules.name, "Emerald"));

    // Replace old legacy branding or "Thank you... Receipt..." text in existing database records
    const allRules = await db.select().from(smsAutomationRules);
    for (const rule of allRules) {
      let updatedTemplate = rule.messageTemplate;
      if (
        /odds\s*arena|paylix|payvora/i.test(updatedTemplate) ||
        updatedTemplate.includes("Thank you") ||
        updatedTemplate.includes("Receipt:") ||
        updatedTemplate.includes("Good luck") ||
        updatedTemplate.includes("Best of luck")
      ) {
        updatedTemplate = updatedTemplate
          .replace(/OddsArena|Odds Arena|Paylix|Payvora/gi, "TrueTips")
          .replace(
            /Thank you \{customer_name\} for (paying|subscribing with) KES \{amount\}\.? Receipt: \{transaction_code\}\.?/gi,
            "🏆 Play Smart, Win Big",
          )
          .replace(/(🔥|🍀|🚀|👑)?\s*(Good luck|Best of luck)[^\n]*/gi, "🏆 Play Smart, Win Big");
        await db
          .update(smsAutomationRules)
          .set({ messageTemplate: updatedTemplate, updatedAt: new Date() })
          .where(eq(smsAutomationRules.id, rule.id));
      }
    }
  } catch (err) {
    console.error("Migration error:", err);
  }

  const rows = await db
    .select()
    .from(smsAutomationRules)
    .orderBy(smsAutomationRules.minAmount);

  if (rows.length === 0) {
    return resetDefaultTiers();
  }

  return rows.map(toRuleRow);
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


  // 3. Find matching active rule — use explicit numeric cast to avoid implicit text comparison
  let [matchedRule] = await db
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

  // Fallback: If no exact range matched (e.g. custom payment amount), pick the closest active rule so every payment gets SMS!
  if (!matchedRule) {
    console.log(`[sms-automation] No exact range rule for amount ${amount} — finding closest active rule.`);
    const activeRules = await db
      .select()
      .from(smsAutomationRules)
      .where(eq(smsAutomationRules.isActive, true))
      .orderBy(sql`ABS(${smsAutomationRules.minAmount}::numeric - ${amount}::numeric)`);
    matchedRule = activeRules[0];
  }

  if (!matchedRule) {
    console.log(`[sms-automation] No active rules in database — skipping SMS.`);
    return;
  }

  console.log(`[sms-automation] Matched rule "${matchedRule.name}" (${matchedRule.minAmount}–${matchedRule.maxAmount}) for amount ${amount}`);

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

  // 4. Build message (Contains Package Header Title & Uppercase Matches Table)
  const message = resolvePlaceholders(matchedRule.messageTemplate, {
    phone,
    amount,
    transactionCode,
    date: paidAt,
    predictionsText,
  });

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
      ruleId: matchedRule.id,
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
    `[sms-automation] SMS ${result.success ? "SENT ✓" : `FAILED ✗ (${result.error})`} — paymentId=${paymentId} rule="${matchedRule.name}" phone=${phone}`,
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

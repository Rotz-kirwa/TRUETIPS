/**
 * LOCAL × PRODUCTION TEST — Sure-10 Predict
 * ===========================================
 * Run: node scratch/test-local-production.js [YOUR_PHONE]
 *
 * Uses LIVE Daraja + Onfon credentials from .env.
 * Requires the local dev server (npm run dev) running on :8080.
 *
 * ⚠️  LOCAL DB REQUIREMENT:
 *   The dev server at localhost:8080 needs to connect to a real DB.
 *   Set DATABASE_URL in .env to the Render external postgres URL:
 *   postgresql://user:pass@dpg-xxx.oregon-postgres.render.com/dbname
 *
 * Tests:
 *  1. Daraja OAuth    → real token from api.safaricom.co.ke
 *  2. C2B webhook     → realistic payload → localhost:8080
 *  3. DB persistence  → verify payment saved (diagnostics endpoint)
 *  4. SMS dispatch    → real Onfon API fires to phone
 *  5. STK Push (LIVE) → real M-Pesa push to your phone
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Load .env ─────────────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      // strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    console.log("⚠️  Could not read .env — relying on existing env vars");
  }
}
loadEnv();

// ── Config ────────────────────────────────────────────────────────────────────
const LOCAL_BASE   = "http://localhost:8080";
const DARAJA_BASE  = process.env.MPESA_ENVIRONMENT === "production"
  ? "https://api.safaricom.co.ke"
  : "https://sandbox.safaricom.co.ke";

const SHORTCODE    = process.env.MPESA_SHORTCODE    ?? "4980404";
const TILL         = process.env.MPESA_TILL_NUMBER  ?? "232392";
const CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY;
const CONSUMER_SEC = process.env.MPESA_CONSUMER_SECRET;
const PASSKEY      = process.env.MPESA_PASSKEY;

// ⬇️  SET YOUR TEST PHONE (phone to STK-push + SMS to)
// Accepts CLI arg: node test-local-production.js 254XXXXXXXXX
const TEST_PHONE = process.argv[2]?.replace(/[^0-9]/g, '').replace(/^0/, '254') 
  || "254712345678";  // ← or edit this directly

// ── Helpers ───────────────────────────────────────────────────────────────────
function sep(title) {
  console.log("\n" + "─".repeat(62));
  console.log(`  ${title}`);
  console.log("─".repeat(62));
}

function badge(ok, label) {
  return ok ? `✅ PASS  ${label}` : `❌ FAIL  ${label}`;
}

function genReceipt() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  let s = "R";
  for (let i = 0; i < 9; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function mpesaTimestamp() {
  return new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
}

async function postLocal(path, body) {
  const res = await fetch(`${LOCAL_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Safaricom-C2B-Gateway/1.0",
      "X-Forwarded-For": "196.201.214.200",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, ok: res.ok, json };
}

async function getLocal(path) {
  const res = await fetch(`${LOCAL_BASE}${path}`);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, ok: res.ok, json };
}

async function getDarajaToken() {
  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SEC}`).toString("base64");
  const res = await fetch(`${DARAJA_BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Daraja auth failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function doStkPush(token, phone, amount) {
  const timestamp = mpesaTimestamp();
  const password  = Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString("base64");
  const payload = {
    BusinessShortCode: SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerBuyGoodsOnline",
    Amount: amount,
    PartyA: phone,
    PartyB: TILL,
    PhoneNumber: phone,
    CallBackURL: `${process.env.MPESA_CALLBACK_URL}/api/mpesa/callback`,
    AccountReference: "Sure10Test",
    TransactionDesc: "LocalTest",
  };
  const res = await fetch(`${DARAJA_BASE}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`STK Push failed (${res.status}): ${text}`);
  return JSON.parse(text);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🏭  LOCAL × PRODUCTION TEST — Sure-10 Predict");
  console.log(`📅  ${new Date().toISOString()}`);
  console.log(`🖥️   Local target  : ${LOCAL_BASE}`);
  console.log(`🌐  Daraja target  : ${DARAJA_BASE} (${process.env.MPESA_ENVIRONMENT})`);
  console.log(`📞  Test phone     : ${TEST_PHONE}`);
  console.log(`🏪  Shortcode      : ${SHORTCODE}  |  Till : ${TILL}`);

  const results = {};

  // ── TEST 1: Local server health ───────────────────────────────────────────
  sep("TEST 1 — Local Server Health");
  try {
    const h = await getLocal("/api/health");
    results.health = h.ok;
    console.log(badge(h.ok, `HTTP ${h.status} from ${LOCAL_BASE}/api/health`));
    if (!h.ok) { console.error("  Server not responding — run 'npm run dev' first."); process.exit(1); }
  } catch (e) {
    console.error(`❌  Cannot reach localhost:8080 — ${e.message}`);
    console.error("    Start dev server: npm run dev");
    process.exit(1);
  }

  // ── TEST 2: Live Daraja OAuth token ──────────────────────────────────────
  sep("TEST 2 — Live Daraja OAuth Token (api.safaricom.co.ke)");
  let darajaToken = null;
  try {
    if (!CONSUMER_KEY || !CONSUMER_SEC) throw new Error("MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET not set in .env");
    darajaToken = await getDarajaToken();
    results.darajaAuth = true;
    console.log(badge(true, "Got real Daraja OAuth token ✓"));
    console.log(`   Token preview: ${darajaToken.slice(0, 24)}...`);
  } catch (e) {
    results.darajaAuth = false;
    console.log(badge(false, `Daraja auth failed: ${e.message}`));
  }

  // ── TEST 3: C2B webhook → localhost ──────────────────────────────────────
  sep("TEST 3 — C2B Confirmation Webhook → localhost:8080");
  const receipt = genReceipt();
  const c2bPayload = {
    TransactionType: "Buy Goods",
    TransID: receipt,
    TransTime: mpesaTimestamp(),
    TransAmount: "10.00",
    BusinessShortCode: SHORTCODE,
    BillRefNumber: TEST_PHONE,   // real phone so SMS can fire
    InvoiceNumber: "",
    OrgAccountBalance: "",
    ThirdPartyTransID: "",
    MSISDN: TEST_PHONE,
    FirstName: "LOCAL",
    MiddleName: "PROD",
    LastName: "TEST",
  };

  console.log("📤 Payload:");
  console.log(JSON.stringify(c2bPayload, null, 2));

  let insertedId = null;
  try {
    const r = await postLocal("/api/payments/c2b/confirmation", c2bPayload);
    results.c2bWebhook = r.status === 200 && r.json?.ResultCode === 0;
    insertedId = r.json?.insertedId ?? null;
    console.log(`\n📥 Response: HTTP ${r.status}`);
    console.log(JSON.stringify(r.json, null, 2));
    console.log(badge(results.c2bWebhook, `ResultCode:${r.json?.ResultCode} — ${r.json?.ResultDesc}`));
    if (insertedId) console.log(`   💾 Payment inserted — ID: ${insertedId}`);
    else if (r.json?.isDuplicate) console.log("   ⚠️  Duplicate receipt — already in DB (expected on retry)");
  } catch (e) {
    results.c2bWebhook = false;
    console.log(badge(false, `Request failed: ${e.message}`));
  }

  // ── TEST 4: Verify payment in DB via diagnostics ──────────────────────────
  sep("TEST 4 — Verify DB Persistence (diagnostics endpoint)");
  await new Promise(r => setTimeout(r, 2000)); // wait for async DB write

  try {
    const d = await getLocal("/api/admin/payments/diagnostics?secret=paylix-debug-2026");
    if (d.ok) {
      const diag = d.json.diagnostics;
      results.dbPersist = (diag.totalPayments24h ?? 0) > 0;
      console.log(badge(results.dbPersist, `totalPayments24h = ${diag.totalPayments24h}`));
      console.log(`   webhookReceivedCount24h : ${diag.webhookReceivedCount24h}`);
      console.log(`   callbackHealth          : ${diag.callbackHealth}`);
      console.log(`   lastCallbackReceived     : ${diag.lastCallbackReceived}`);
    } else {
      console.log(`⚠️  Diagnostics HTTP ${d.status} — ${JSON.stringify(d.json)}`);
      results.dbPersist = null;
    }
  } catch (e) {
    console.log(`⚠️  Diagnostics error: ${e.message}`);
    results.dbPersist = null;
  }

  // ── TEST 5: Check SMS was dispatched (via logs endpoint) ──────────────────
  sep("TEST 5 — SMS Dispatch Check");
  console.log(`📱 SMS target phone: ${TEST_PHONE}`);
  console.log("   (Check the Render/dev server console for [sms-automation] logs)");
  console.log("   (Check your Onfon dashboard for delivery report)");
  console.log("   Onfon Sender ID:", process.env.ONFON_SENDER_ID ?? "NEBULA");
  results.smsNote = "Check console logs and Onfon dashboard";
  console.log(`ℹ️  SMS fires async — look for: [sms-automation] SMS SENT ✓ or FAILED ✗`);

  // ── TEST 6 (Optional): Real STK Push ──────────────────────────────────────
  sep("TEST 6 — Real STK Push to " + TEST_PHONE + " (LIVE)");
  if (darajaToken && PASSKEY) {
    try {
      console.log(`📲 Sending KES 10 STK Push to ${TEST_PHONE} via Daraja production...`);
      const stkResult = await doStkPush(darajaToken, TEST_PHONE, 10);
      results.stkPush = stkResult.ResponseCode === "0";
      console.log(badge(results.stkPush, `ResponseCode: ${stkResult.ResponseCode}`));
      console.log(`   MerchantRequestID  : ${stkResult.MerchantRequestID}`);
      console.log(`   CheckoutRequestID  : ${stkResult.CheckoutRequestID}`);
      console.log(`   CustomerMessage    : ${stkResult.CustomerMessage}`);
      console.log(`\n   📱 CHECK YOUR PHONE — M-Pesa prompt should appear now!`);
      console.log(`   After accepting, the callback goes to: ${process.env.MPESA_CALLBACK_URL}/api/mpesa/callback`);
    } catch (e) {
      results.stkPush = false;
      console.log(badge(false, `STK Push error: ${e.message}`));
    }
  } else {
    console.log("⚠️  Skipped — MPESA_PASSKEY not set or Daraja token unavailable.");
    results.stkPush = null;
  }

  // ── FINAL SUMMARY ─────────────────────────────────────────────────────────
  sep("FINAL SUMMARY");
  console.log(`\n┌────────────────────────────────────────────────────┐`);
  console.log(`│   LOCAL × PRODUCTION TEST RESULTS                  │`);
  console.log(`│   ${new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}              │`);
  console.log(`└────────────────────────────────────────────────────┘`);
  console.log();
  console.log(badge(results.health,       "Local server up                   (localhost:8080)"));
  console.log(badge(results.darajaAuth,   "Daraja OAuth token                (live production)"));
  console.log(badge(results.c2bWebhook,   `C2B webhook → DB save             (receipt: ${receipt})`));
  console.log(badge(results.dbPersist,    "DB persistence confirmed          (diagnostics)"));
  if (results.stkPush === true)  console.log(badge(true,  "STK Push fired                    (check your phone!)"));
  if (results.stkPush === false) console.log(badge(false, "STK Push failed                   (see error above)"));
  if (results.stkPush === null)  console.log("⚪ SKIP  STK Push                         (token unavailable)");
  console.log();

  const criticalPassed = results.health && results.darajaAuth && results.c2bWebhook;
  console.log(criticalPassed
    ? "  🟢 CORE PIPELINE CONFIRMED — real credentials work locally!"
    : "  🔴 SOME TESTS FAILED — check output above for details."
  );

  if (results.c2bWebhook) {
    console.log(`\n  📋 Receipt used in test: ${receipt}`);
    console.log(`  💳 View on dashboard   : http://localhost:8080/payments`);
    console.log(`  🔍 Diagnostics         : http://localhost:8080/api/admin/payments/diagnostics?secret=paylix-debug-2026`);
  }
  console.log();
}

main().catch(console.error);

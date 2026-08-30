import http from "node:http";
import https from "node:https";
import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env")) {
  try {
    const envConfig = readFileSync(".env", "utf-8");
    for (const line of envConfig.split("\n")) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = (match[2] || "").trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        if (!process.env[key]) process.env[key] = value;
      }
    }
  } catch {
    // Ignore .env read errors
  }
}

const baseUrl = process.argv[2] || "http://127.0.0.1:3000";
const targetUrl = `${baseUrl.replace(/\/$/, "")}/api/payments/c2b/confirmation`;

const transId = `TEST_MIGRATION_${Date.now()}`;
const testPayload = {
  TransactionType: "Pay Bill",
  TransID: transId,
  TransTime: "20260830101500",
  TransAmount: "100.00",
  BusinessShortCode: "4980404",
  BillRefNumber: "232392",
  InvoiceNumber: "",
  ThirdPartyTransID: "",
  MSISDN: "254712345678",
  FirstName: "Test",
  MiddleName: "Migration",
  LastName: "User",
};

console.log("=================================================");
console.log("  M-PESA C2B SYNTHETIC MIGRATION TEST SUITE");
console.log("=================================================");
console.log(`Target URL : ${targetUrl}`);
console.log(`Test TransID: ${transId}\n`);

function makePostRequest(urlStr, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const payloadStr = JSON.stringify(data);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payloadStr),
        "User-Agent": "SyntheticTestRunner/MigrationCheck",
      },
    };

    const client = url.protocol === "https:" ? https : http;
    const req = client.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch {
          // non-json
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body, json });
      });
    });

    req.on("error", reject);
    req.write(payloadStr);
    req.end();
  });
}

async function runTests() {
  const results = {
    firstPostReachable: false,
    firstPostStatus200: false,
    firstPostValidSchema: false,
    secondPostReachable: false,
    secondPostStatus200: false,
    secondPostValidSchema: false,
    dbCallbackPersisted: false,
    dbPaymentPersisted: false,
    dbNoDuplicatePayment: false,
  };

  try {
    // TEST 1: Initial POST
    console.log("▶ TEST 1: Posting new synthetic payload...");
    const res1 = await makePostRequest(targetUrl, testPayload);
    console.log(`  HTTP Status: ${res1.statusCode}`);
    console.log(`  Body       : ${res1.body}`);

    results.firstPostReachable = true;
    if (res1.statusCode === 200) results.firstPostStatus200 = true;
    if (res1.json && res1.json.ResultCode === 0 && res1.json.ResultDesc === "Accepted") {
      results.firstPostValidSchema = true;
    }

    // TEST 2: Duplicate POST (resend identical TransID)
    console.log("\n▶ TEST 2: Resending duplicate synthetic payload (identical TransID)...");
    const res2 = await makePostRequest(targetUrl, testPayload);
    console.log(`  HTTP Status: ${res2.statusCode}`);
    console.log(`  Body       : ${res2.body}`);

    results.secondPostReachable = true;
    if (res2.statusCode === 200) results.secondPostStatus200 = true;
    if (res2.json && res2.json.ResultCode === 0 && res2.json.ResultDesc === "Accepted") {
      results.secondPostValidSchema = true;
    }

    // TEST 2B: Second unique transaction
    const transId2 = `TEST_MIGRATION_${Date.now()}_2`;
    console.log(`\n▶ TEST 2B: Posting second unique synthetic payload (${transId2})...`);
    const testPayload2 = { ...testPayload, TransID: transId2, TransAmount: "250.00" };
    const res2b = await makePostRequest(targetUrl, testPayload2);
    console.log(`  HTTP Status: ${res2b.statusCode}`);
    console.log(`  Body       : ${res2b.body}`);

    // TEST 3: DB Verification via Drizzle client
    console.log("\n▶ TEST 3: Querying PostgreSQL database to verify records...");
    const { db } = await import("../src/lib/db/client.ts");
    const { sql } = await import("drizzle-orm");

    const callbackRows = await db.execute(sql`
      SELECT id, trans_id, processing_status, result_code, result_desc, created_at
      FROM mpesa_callback_events
      WHERE trans_id = ${transId} OR trans_id = ${transId2}
      ORDER BY created_at DESC
    `);
    const callbackEvents = Array.isArray(callbackRows)
      ? callbackRows
      : (callbackRows.rows ?? []);

    console.log(`  mpesa_callback_events rows found: ${callbackEvents.length}`);
    if (callbackEvents.length >= 2) {
      results.dbCallbackPersisted = true;
      console.log(`  Latest Callback Event ID : ${callbackEvents[0].id}`);
      console.log(`  Processing Status        : ${callbackEvents[0].processing_status}`);
    }

    const paymentRows = await db.execute(sql`
      SELECT id, source, mpesa_receipt_number, amount, phone, created_at
      FROM mpesa_payments
      WHERE mpesa_receipt_number = ${transId} OR mpesa_receipt_number = ${transId2}
    `);
    const payments = Array.isArray(paymentRows)
      ? paymentRows
      : (paymentRows.rows ?? []);

    console.log(`  mpesa_payments rows found for both transactions : ${payments.length}`);
    if (payments.length === 2) {
      results.dbPaymentPersisted = true;
      results.dbNoDuplicatePayment = true;
      console.log(`  Payment 1 ID : ${payments[0].id} (Receipt: ${payments[0].mpesa_receipt_number})`);
      console.log(`  Payment 2 ID : ${payments[1].id} (Receipt: ${payments[1].mpesa_receipt_number})`);
    } else if (payments.length > 2) {
      results.dbPaymentPersisted = true;
      results.dbNoDuplicatePayment = false;
      console.error(`  ❌ DUPLICATE PAYMENTS DETECTED! Row count: ${payments.length}`);
    }

  } catch (err) {
    console.error("❌ Test suite encountered error:", err);
  }

  console.log("\n=================================================");
  console.log("  SYNTHETIC MIGRATION TEST RESULTS");
  console.log("=================================================");
  console.log(`  1. Initial POST Route Reachable  : ${results.firstPostReachable ? "PASS" : "FAIL"}`);
  console.log(`  2. Initial POST HTTP 200         : ${results.firstPostStatus200 ? "PASS" : "FAIL"}`);
  console.log(`  3. Safaricom Response Schema      : ${results.firstPostValidSchema ? "PASS" : "FAIL"}`);
  console.log(`  4. Resend Duplicate Route        : ${results.secondPostReachable ? "PASS" : "FAIL"}`);
  console.log(`  5. Resend Duplicate HTTP 200     : ${results.secondPostStatus200 ? "PASS" : "FAIL"}`);
  console.log(`  6. Callback Event DB Persisted   : ${results.dbCallbackPersisted ? "PASS" : "FAIL"}`);
  console.log(`  7. Payment Record DB Persisted   : ${results.dbPaymentPersisted ? "PASS" : "FAIL"}`);
  console.log(`  8. Idempotent Duplicate Protection: ${results.dbNoDuplicatePayment ? "PASS" : "FAIL"}`);
  console.log("=================================================\n");

  process.exit(0);
}

runTests();

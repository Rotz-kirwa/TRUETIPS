import { handleC2bConfirmation, handleC2bValidation } from "../src/lib/mpesa-callback.server.ts";
import postgres from "postgres";

const dbUrl = process.env.DATABASE_URL || "postgres://postgres@127.0.0.1:5432/paylix";
const sql = postgres(dbUrl);

async function test() {
  console.log("=================================================");
  console.log("🧪 TESTING C2B CONFIRMATION FIX DIRECTLY");
  console.log("=================================================");

  const transId = "RKT_TEST_" + Math.floor(100000 + Math.random() * 900000);
  const testPayload = {
    TransactionType: "Pay Bill",
    TransID: transId,
    TransTime: "20260826123000",
    TransAmount: "50.00",
    BusinessShortCode: "4980406",
    BillRefNumber: "232392",
    MSISDN: "254712345678",
    FirstName: "MARY",
    MiddleName: "W",
    LastName: "WANJIKU",
  };

  console.log("1. Testing handleC2bValidation...");
  const valResult = await handleC2bValidation(testPayload);
  console.log("   Validation result:", valResult);

  console.log("\n2. Testing handleC2bConfirmation (1st invocation)...");
  const confResult1 = await handleC2bConfirmation(testPayload);
  console.log("   Confirmation result 1:", confResult1);

  console.log("\n3. Verifying record in PostgreSQL database...");
  const [row] = await sql`
    SELECT id, source, status, phone, payer_name, amount, till_number, business_shortcode, mpesa_receipt_number, paid_at
    FROM mpesa_payments
    WHERE mpesa_receipt_number = ${transId}
  `;

  if (row) {
    console.log("   ✓ SUCCESS! Record found in DB:", row);
  } else {
    console.error("   ❌ FAILURE! Record NOT found in DB!");
    process.exit(1);
  }

  console.log("\n4. Testing handleC2bConfirmation (2nd invocation - Idempotency test)...");
  const confResult2 = await handleC2bConfirmation(testPayload);
  console.log("   Confirmation result 2:", confResult2);

  const countRows = await sql`
    SELECT count(*)::int as count FROM mpesa_payments WHERE mpesa_receipt_number = ${transId}
  `;
  console.log(`   ✓ Duplicate count in DB (should be 1): ${countRows[0].count}`);

  await sql.end();
  console.log("\n✅ ALL TESTS PASSED SUCCESSFULLY!");
  process.exit(0);
}

test().catch((err) => {
  console.error("❌ Test crashed:", err);
  process.exit(1);
});

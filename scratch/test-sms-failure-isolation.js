import { handleC2bConfirmation } from "../src/lib/mpesa-callback.server.ts";
import postgres from "postgres";

const dbUrl = process.env.DATABASE_URL || "postgres://postgres@127.0.0.1:5432/paylix";
const sql = postgres(dbUrl);

async function testSmsIsolation() {
  console.log("=================================================");
  console.log("🧪 TESTING SMS FAILURE ISOLATION");
  console.log("=================================================");

  // Set an invalid SMS API Key temporarily to force SMS failure
  const originalKey = process.env.ONFON_API_KEY;
  process.env.ONFON_API_KEY = "INVALID_KEY_FOR_TESTING_ISOLATION";

  const transId = "RKT_SMSFAIL_" + Math.floor(100000 + Math.random() * 900000);
  const testPayload = {
    TransactionType: "Pay Bill",
    TransID: transId,
    TransTime: "20260826123500",
    TransAmount: "100.00",
    BusinessShortCode: "4980406",
    BillRefNumber: "232392",
    MSISDN: "254700000000",
    FirstName: "TEST",
    LastName: "CUSTOMER",
  };

  const confResult = await handleC2bConfirmation(testPayload);
  console.log("Callback result:", confResult);

  // Restore API key
  process.env.ONFON_API_KEY = originalKey;

  // Check if payment STILL exists in DB
  const [payment] = await sql`
    SELECT id, status, amount, mpesa_receipt_number FROM mpesa_payments WHERE mpesa_receipt_number = ${transId}
  `;

  if (payment && payment.status === "Success") {
    console.log("✓ SUCCESS: Payment record STILL exists and status is Success despite SMS failure:", payment);
  } else {
    console.error("❌ FAILURE: Payment was deleted or rolled back!");
    process.exit(1);
  }

  await sql.end();
  console.log("✅ SMS FAILURE ISOLATION VERIFIED!");
  process.exit(0);
}

testSmsIsolation().catch(console.error);

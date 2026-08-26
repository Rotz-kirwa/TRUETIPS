import postgres from 'postgres';

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:5432/paylix';
const sql = postgres(dbUrl);

async function main() {
  console.log("=================================================");
  console.log("📊 QUERYING LIVE DATABASE FOR MPESA PAYMENTS & CALLBACKS");
  console.log("=================================================");

  try {
    const payments = await sql`
      SELECT id, source, status, phone, payer_name, amount, till_number, business_shortcode, mpesa_receipt_number, created_at, paid_at
      FROM mpesa_payments
      ORDER BY created_at DESC
      LIMIT 20
    `;

    console.log(`\n💳 MPESA_PAYMENTS (Total in view: ${payments.length}):`);
    if (payments.length === 0) {
      console.log("   (No payments recorded yet)");
    } else {
      for (const p of payments) {
        console.log(`   - [${p.status}] Receipt: ${p.mpesa_receipt_number || 'N/A'} | Amount: KES ${p.amount} | Phone: ${p.phone} | Payer: ${p.payer_name || 'N/A'} | Till: ${p.till_number || 'N/A'} | Time: ${p.created_at}`);
      }
    }

    console.log("\n-------------------------------------------------");
    const callbacks = await sql`
      SELECT id, route, event_type, processing_status, trans_id, amount, phone_masked, created_at
      FROM mpesa_callback_events
      ORDER BY created_at DESC
      LIMIT 20
    `;

    console.log(`📥 MPESA_CALLBACK_EVENTS (Total in view: ${callbacks.length}):`);
    if (callbacks.length === 0) {
      console.log("   (No raw callback events recorded yet)");
    } else {
      for (const c of callbacks) {
        console.log(`   - [${c.processing_status}] TransID: ${c.trans_id || 'N/A'} | Amount: KES ${c.amount || '0'} | Phone: ${c.phone_masked || 'N/A'} | Route: ${c.route} | Time: ${c.created_at}`);
      }
    }

  } catch (err) {
    console.error("❌ Database query error:", err);
  }

  process.exit(0);
}

main().catch(console.error);

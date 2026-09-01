import fs from 'fs';
import path from 'path';

// Load .env FIRST before importing server files
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  for (const line of envConfig.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      const val = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key.trim()]) {
        process.env[key.trim()] = val;
      }
    }
  }
}

async function run() {
  const { recordManualPayment } = await import('../src/lib/payments.server.ts');
  const args = process.argv.slice(2);
  const mpesaReceiptNumber = args[0];
  const phone = args[1] || '0791260817';
  const amount = Number(args[2] || 1);

  if (!mpesaReceiptNumber) {
    console.log('Usage: npx tsx scratch/reconcile.ts <RECEIPT_CODE> [PHONE] [AMOUNT]');
    console.log('Example: npx tsx scratch/reconcile.ts UB12345678 0791260817 1');
    process.exit(1);
  }

  console.log(`=================================================`);
  console.log(`💾 RECORDING PAYMENT TO DB & DASHBOARD`);
  console.log(`Receipt: ${mpesaReceiptNumber} | Phone: ${phone} | KES ${amount}`);
  console.log(`=================================================`);

  try {
    const res = await recordManualPayment({ mpesaReceiptNumber, phone, amount });
    console.log('✅ PERSISTED TO DB & REFLECTED ON DASHBOARD:');
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('❌ Error recording payment:', err instanceof Error ? err.message : err);
  }
}

run();

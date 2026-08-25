import fs from 'fs';
import path from 'path';
import dns from 'dns';
import postgres from 'postgres';

dns.setDefaultResultOrder('ipv4first');

// Load .env file
try {
  const envPath = path.resolve(process.cwd(), '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
} catch (e) {
  console.log('Error reading .env:', e.message);
}

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:5432/paylix';
const sql = postgres(dbUrl);

async function runEndToEndSimulation() {
  console.log('====================================================');
  console.log('🏆 PREDICTIONLAB END-TO-END C2B PAYMENT & SMS SIMULATION');
  console.log('====================================================');

  const testPhone = process.argv[2] || '254712345678';
  const testAmount = process.argv[3] || '50';
  const transId = `SIM${Date.now().toString().slice(-8)}`;

  console.log(`1. Simulating C2B Payment: ${transId} | Phone: ${testPhone} | Amount: KES ${testAmount}`);

  // Fetch active matching rule
  const rules = await sql`
    SELECT * FROM sms_automation_rules 
    WHERE is_active = true 
      AND min_amount::numeric <= ${testAmount}::numeric 
      AND max_amount::numeric >= ${testAmount}::numeric 
    ORDER BY min_amount ASC LIMIT 1;
  `;

  if (rules.length === 0) {
    console.log(`❌ No active SMS rule matched KES ${testAmount}`);
    await sql.end();
    return;
  }

  const rule = rules[0];
  console.log(`2. Matched Active Package Rule: "${rule.name}" (${rule.min_amount} - ${rule.max_amount} KES)`);

  // Build message using resolvePlaceholders formatting logic
  const dateStr = new Date().toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Africa/Nairobi'
  });

  const formattedAmount = new Intl.NumberFormat('en-KE', { minimumFractionDigits: 2 }).format(Number(testAmount));
  const defaultPredictions = "⚽ Chelsea vs Arsenal → 1X (1.45)\n⚽ Real Madrid vs Sevilla → OVER 2.5 (1.70)";
  const customerName = `0${testPhone.slice(-9)}`;

  let message = rule.message_template
    .replace(/\{customer_name\}/gi, customerName)
    .replace(/\{phone\}/gi, testPhone)
    .replace(/\{amount\}/gi, formattedAmount)
    .replace(/\{transaction_code\}/gi, transId)
    .replace(/\{date\}/gi, dateStr)
    .replace(/\{business_name\}/gi, 'PredictionLab')
    .replace(/\{predictions\}/gi, defaultPredictions);

  console.log('3. Generated SMS Payload:');
  console.log('----------------------------------------------------');
  console.log(message);
  console.log('----------------------------------------------------');

  // Insert payment into database
  const insertedPayment = await sql`
    INSERT INTO mpesa_payments (
      source, status, phone, amount, till_number, mpesa_receipt_number,
      account_reference, transaction_desc, result_code, result_desc, paid_at
    ) VALUES (
      'c2b_till', 'Success', ${testPhone}, ${testAmount}, ${process.env.MPESA_TILL_NUMBER || '232392'},
      ${transId}, 'SIMULATION', 'CustomerPayBillOnline', 0, 'C2B Confirmed', NOW()
    ) RETURNING id;
  `;
  const paymentId = insertedPayment[0].id;
  console.log(`4. Saved transaction to mpesa_payments table (ID: ${paymentId})`);

  // Dispatch via Onfon API
  console.log('5. Dispatching live SMS via Onfon Media API...');
  const payload = {
    ApiKey: process.env.ONFON_API_KEY,
    ClientId: process.env.ONFON_CLIENT_ID,
    SenderId: process.env.ONFON_SENDER_ID || 'NEBULA',
    MessageParameters: [{ Number: testPhone, Text: message }]
  };

  let resData = {};
  let isSuccess = false;
  try {
    const https = await import('https');
    const postData = JSON.stringify(payload);
    const resText = await new Promise((resolve, reject) => {
      const req = https.request('https://api.onfonmedia.co.ke/v1/sms/SendBulkSMS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        family: 4
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(body));
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
    resData = JSON.parse(resText);
    console.log('6. Onfon API Response:', JSON.stringify(resData));
    isSuccess = resData.ErrorCode === 0 || resData.Data?.[0]?.MessageErrorCode === 0 || resData.Data?.[0]?.MessageErrorCode === "200";
  } catch (fetchErr) {
    console.log('6. Onfon API Request Error:', fetchErr.message);
    resData = { error: fetchErr.message };
  }

  // Log dispatch in sms_logs
  await sql`
    INSERT INTO sms_logs (
      payment_id, rule_id, phone, amount, message, status, provider_response
    ) VALUES (
      ${paymentId}, ${rule.id}, ${testPhone}, ${testAmount}, ${message},
      ${isSuccess ? 'sent' : 'failed'}, ${JSON.stringify(resData)}
    );
  `;

  console.log(`7. Saved SMS dispatch record to sms_logs table (Status: ${isSuccess ? 'SENT ✓' : 'FAILED ✗'})`);
  console.log('====================================================');
  console.log(isSuccess ? '🎉 END-TO-END SIMULATION SUCCESSFUL!' : '⚠️ SIMULATION COMPLETED WITH WARNING');
  console.log('====================================================');

  await sql.end();
}

runEndToEndSimulation();

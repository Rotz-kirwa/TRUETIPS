import fs from 'fs';
import path from 'path';

// Parse .env file manually
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

import { stkPush } from '../src/lib/mpesa.server.ts';

async function main() {
  const phone = '0791260817';
  const amount = 1;
  console.log(`=================================================`);
  console.log(`🚀 INITIATING LIVE STK PUSH TO: ${phone} (KES ${amount})`);
  console.log(`=================================================`);

  try {
    const res = await stkPush(phone, amount, 'TEST_PAYMENT', 'Sure10 Test');
    console.log('✅ STK Push Dispatch Success!');
    console.log('Response Details:', JSON.stringify(res, null, 2));
    console.log('\n📲 CHECK YOUR PHONE FOR THE M-PESA STK POPUP PIN PROMPT NOW!');
  } catch (err) {
    console.error('❌ STK Push Dispatch Failed:', err);
  }
}

main();

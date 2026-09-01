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
  const { stkPush } = await import('../src/lib/mpesa.server.ts');
  const args = process.argv.slice(2);
  const phone = args[0] || '0791260817';
  const amount = Number(args[1] || 1);

  console.log(`=================================================`);
  console.log(`🚀 SENDING STK PUSH TO: ${phone} (KES ${amount})`);
  console.log(`=================================================`);

  try {
    const res = await stkPush(phone, amount, 'SHELL_PUSH', 'Terminal STK');
    console.log('✅ SUCCESS! STK Push Accepted by Safaricom:');
    console.log(JSON.stringify(res, null, 2));
    console.log('\n📲 Check phone for M-Pesa PIN prompt!');
  } catch (err) {
    console.error('❌ STK Push Error:', err instanceof Error ? err.message : err);
  }
}

run();

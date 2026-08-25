import fs from 'fs';
import path from 'path';

// Read .env file to load environment variables
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

const apiKey = process.env.ONFON_API_KEY;
const clientId = process.env.ONFON_CLIENT_ID;
const senderId = process.env.ONFON_SENDER_ID || 'NEBULA';
const testPhone = process.argv[2] || '254712345678';
const testMessage = 'PredictionLab Test SMS: Automated M-Pesa prediction delivery is active! 🏆 Play Smart, Win Big';

console.log('--- ONFON SMS SIMULATION TEST ---');
console.log('API Key:', apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : 'MISSING');
console.log('Client ID:', clientId);
console.log('Sender ID:', senderId);
console.log('Target Phone:', testPhone);
console.log('Message:', testMessage);
console.log('--------------------------------');

const payload = {
  ApiKey: apiKey,
  ClientId: clientId,
  SenderId: senderId,
  MessageParameters: [
    { Number: testPhone, Text: testMessage }
  ]
};

async function testSend() {
  const url = 'https://api.onfonmedia.co.ke/v1/sms/SendBulkSMS';
  console.log(`Sending POST to ${url}...`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const status = res.status;
    const rawText = await res.text();
    console.log(`HTTP Status: ${status}`);
    console.log(`Response Raw: ${rawText}`);

    try {
      const parsed = JSON.parse(rawText);
      console.log('Parsed Response JSON:', JSON.stringify(parsed, null, 2));
    } catch {
      // Raw non-JSON text response
    }
  } catch (err) {
    console.error('Fetch Error:', err);
  }
}

testSend();

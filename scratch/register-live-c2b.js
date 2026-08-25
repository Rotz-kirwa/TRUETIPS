import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';

// Load .env file variables
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

const key = process.env.MPESA_CONSUMER_KEY || "OWzibbuoj9it15pJLqY3RLuriXxthJVYUU4MmVgnohMg6nRG";
const secret = process.env.MPESA_CONSUMER_SECRET || "vULjb5gAFfAsxEmtMnFVMpl5H6wj66yVj6cXFh02SAv4MNCApqvUDYNGa3cXrRQd";
const shortCode = process.env.MPESA_SHORTCODE || "4980406";
const domain = "https://www.sure-10.com";

const confirmationUrl = `${domain}/api/payments/c2b/confirmation`;
const validationUrl = `${domain}/api/payments/c2b/validation`;

const BASE = "https://api.safaricom.co.ke";

async function httpGetJson(urlStr, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request(u, { method: 'GET', headers, family: 4 }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function httpPostJson(urlStr, headers, payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const postData = JSON.stringify(payload);
    const req = https.request(u, {
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(postData) },
      family: 4
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(body); } catch { parsed = { raw: body }; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log("=================================================");
  console.log("🏆 SAFARICOM DARAJA C2B LIVE URL REGISTRATION");
  console.log("=================================================");
  console.log(`Domain:           ${domain}`);
  console.log(`ShortCode:        ${shortCode}`);
  console.log(`Confirmation URL: ${confirmationUrl}`);
  console.log(`Validation URL:   ${validationUrl}`);
  console.log("-------------------------------------------------");

  console.log("1. Requesting OAuth access token from Safaricom Production API...");
  const authHeader = "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
  const authRes = await httpGetJson(`${BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    Authorization: authHeader
  });

  if (authRes.status !== 200 || !authRes.body.access_token) {
    console.error("❌ OAuth Failed:", authRes);
    process.exit(1);
  }

  const token = authRes.body.access_token;
  console.log("✓ OAuth Token obtained successfully!");

  console.log("2. Registering C2B Webhook URLs with Safaricom...");
  const registerPayload = {
    ShortCode: shortCode,
    ResponseType: "Completed",
    ConfirmationURL: confirmationUrl,
    ValidationURL: validationUrl
  };

  const regRes = await httpPostJson(
    `${BASE}/mpesa/c2b/v2/registerurl`,
    { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    registerPayload
  );

  console.log("-------------------------------------------------");
  console.log("Safaricom Daraja API Response:");
  console.log(`HTTP Status: ${regRes.status}`);
  console.log(JSON.stringify(regRes.body, null, 2));
  console.log("=================================================");

  if (regRes.status === 200 || regRes.body.ResponseCode === "0" || regRes.body.errorMessage === "URLs are already registered") {
    console.log("🎉 SAFARICOM C2B URL REGISTRATION SUCCESSFUL!");
  } else {
    console.log("⚠️ C2B URL REGISTRATION RESPONSE SUMMARY ABOVE");
  }
}

main().catch(console.error);

import https from 'node:https';

const key = "OWzibbuoj9it15pJLqY3RLuriXxthJVYUU4MmVgnohMg6nRG";
const secret = "vULjb5gAFfAsxEmtMnFVMpl5H6wj66yVj6cXFh02SAv4MNCApqvUDYNGa3cXrRQd";
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

async function registerShortcode(token, code) {
  console.log(`\nRegistering C2B URLs for ShortCode / Till: ${code} ...`);
  const registerPayload = {
    ShortCode: code,
    ResponseType: "Completed",
    ConfirmationURL: confirmationUrl,
    ValidationURL: validationUrl
  };

  const regRes = await httpPostJson(
    `${BASE}/mpesa/c2b/v2/registerurl`,
    { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    registerPayload
  );

  console.log(`ShortCode ${code} Response (${regRes.status}):`, regRes.body);
}

async function main() {
  console.log("=================================================");
  console.log("🏆 SAFARICOM C2B URL REGISTRATION FOR TILL & SHORTCODE");
  console.log("=================================================");

  const authHeader = "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
  const authRes = await httpGetJson(`${BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    Authorization: authHeader
  });

  if (authRes.status !== 200 || !authRes.body.access_token) {
    console.error("❌ OAuth Failed:", authRes);
    process.exit(1);
  }

  const token = authRes.body.access_token;
  console.log("✓ OAuth Token obtained!");

  await registerShortcode(token, "4980406");
  await registerShortcode(token, "232392");
}

main().catch(console.error);

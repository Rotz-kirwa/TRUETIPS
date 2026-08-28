import https from 'node:https';

const key = "OWzibbuoj9it15pJLqY3RLuriXxthJVYUU4MmVgnohMg6nRG";
const secret = "vULjb5gAFfAsxEmtMnFVMpl5H6wj66yVj6cXFh02SAv4MNCApqvUDYNGa3cXrRQd";
const domain = "https://moonlight-games.onrender.com";

const confirmationUrls = [
  `${domain}/api/payments/c2b/confirmation`,
  `${domain}/c2b/confirmation`,
];

const validationUrls = [
  `${domain}/api/payments/c2b/validation`,
  `${domain}/c2b/validation`,
];

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
  console.log("⚡ REGISTERING SAFARICOM C2B URLS FOR MOONLIGHT-GAMES");
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

  const shortcodes = ["4980404", "4980406", "232392"];
  const endpoints = [
    `${BASE}/mpesa/c2b/v1/registerurl`,
    `${BASE}/mpesa/c2b/v2/registerurl`,
  ];

  for (const shortcode of shortcodes) {
    for (const ep of endpoints) {
      console.log(`\n-------------------------------------------------`);
      console.log(`📡 ShortCode: ${shortcode} | Endpoint: ${ep}`);
      const payload = {
        ShortCode: shortcode,
        ResponseType: "Completed",
        ConfirmationURL: `${domain}/api/payments/c2b/confirmation`,
        ValidationURL: `${domain}/api/payments/c2b/validation`
      };
      const res = await httpPostJson(
        ep,
        { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        payload
      );
      console.log(`Result (${res.status}):`, JSON.stringify(res.body, null, 2));
    }
  }
}

main().catch(console.error);

import https from 'node:https';

function postPayload(urlStr, payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const postData = JSON.stringify(payload);
    const req = https.request(u, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      family: 4,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  const sampleC2B = {
    TransactionType: "CustomerPayBillOnline",
    TransID: "SI10" + Date.now().toString().slice(-6),
    TransTime: "20260825233000",
    TransAmount: "50.00",
    BusinessShortCode: "232392",
    BillRefNumber: "254791260817",
    InvoiceNumber: "",
    OrgAccountBalance: "1000.00",
    ThirdPartyTransID: "",
    MSISDN: "254791260817",
    FirstName: "Test",
    MiddleName: "User",
    LastName: "Pay"
  };

  console.log("=================================================");
  console.log("🧪 TESTING C2B CONFIRMATION WEBHOOK ENDPOINTS");
  console.log("=================================================");

  console.log("\n1. Testing Vercel domain: https://www.sure-10.com/api/payments/c2b/confirmation ...");
  const vercelRes = await postPayload("https://www.sure-10.com/api/payments/c2b/confirmation", sampleC2B);
  console.log("Vercel Response:", vercelRes);

  console.log("\n2. Testing Render domain: https://moonlight-games.onrender.com/api/payments/c2b/confirmation ...");
  const renderRes = await postPayload("https://moonlight-games.onrender.com/api/payments/c2b/confirmation", sampleC2B);
  console.log("Render Response:", renderRes);
}

main().catch(console.error);

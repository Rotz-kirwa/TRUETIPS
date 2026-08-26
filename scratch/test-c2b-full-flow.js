import http from 'node:http';

async function testEndpoint(path, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3001,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Safaricom-C2B-Gateway/1.0',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log("=================================================");
  console.log("🧪 TESTING C2B CONFIRMATION CALLBACK FLOW");
  console.log("=================================================");

  const testPayload = {
    TransactionType: "Pay Bill",
    TransID: "RKT" + Math.floor(100000 + Math.random() * 900000),
    TransTime: "20260826115000",
    TransAmount: "30.00",
    BusinessShortCode: "4980406",
    BillRefNumber: "232392",
    InvoiceNumber: "",
    ThirdPartyTransID: "",
    MSISDN: "254712345678",
    FirstName: "JOHN",
    MiddleName: "K",
    LastName: "DOE"
  };

  console.log("Payload:", testPayload);

  try {
    const res1 = await testEndpoint('/api/payments/c2b/confirmation', testPayload);
    console.log(`\n✓ Endpoint /api/payments/c2b/confirmation responded: HTTP ${res1.status}`);
    console.log(`  Body: ${res1.data}`);
  } catch (err) {
    console.log(`❌ Test request failed (Ensure server node api/render-server.js is running on 3000): ${err.message}`);
  }
}

main().catch(console.error);

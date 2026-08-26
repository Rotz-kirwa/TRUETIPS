import http from "node:http";

const samplePayload = {
  TransactionType: "Pay Bill",
  TransID: "RKT9999999",
  TransTime: "20260826112500",
  TransAmount: "30.00",
  BusinessShortCode: "4980406",
  BillRefNumber: "ACC123",
  InvoiceNumber: "",
  OrgAccountBalance: "",
  ThirdPartyTransID: "",
  MSISDN: "254712345678",
  FirstName: "TEST",
  MiddleName: "USER",
  LastName: "SURE10"
};

async function sendPost(path) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(samplePayload);
    const req = http.request({
      hostname: "localhost",
      port: 3000,
      path: path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log("Testing POST /api/payments/c2b/confirmation ...");
  const res1 = await sendPost("/api/payments/c2b/confirmation");
  console.log("Res 1:", res1);

  console.log("Testing POST /c2b/confirmation ...");
  const res2 = await sendPost("/c2b/confirmation");
  console.log("Res 2:", res2);
}

main().catch(console.error);

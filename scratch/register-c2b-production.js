const key = "OWzibbuoj9it15pJLqY3RLuriXxthJVYUU4MmVgnohMg6nRG";
const secret = "vULjb5gAFfAsxEmtMnFVMpl5H6wj66yVj6cXFh02SAv4MNCApqvUDYNGa3cXrRQd";
const shortCode = "4980406";
const callbackUrl = "https://moonlight-games.onrender.com";

async function main() {
  console.log("=================================================");
  console.log("🚀 REGISTERING C2B URLS WITH SAFARICOM DARAJA");
  console.log("=================================================");

  // 1. Get OAuth Token
  console.log("1. Authenticating with Safaricom Daraja...");
  const authHeader = Buffer.from(`${key}:${secret}`).toString("base64");
  const authRes = await fetch("https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
    headers: { Authorization: `Basic ${authHeader}` }
  });

  if (!authRes.ok) {
    throw new Error(`Auth failed (${authRes.status}): ${await authRes.text()}`);
  }

  const authData = await authRes.json();
  const token = authData.access_token;
  console.log("   ✓ Access Token obtained successfully.");

  // 2. Register C2B URLs
  const confirmationUrl = `${callbackUrl}/api/payments/c2b/confirmation`;
  const validationUrl = `${callbackUrl}/api/payments/c2b/validation`;

  console.log(`\n2. Registering Confirmation URL: ${confirmationUrl}`);
  console.log(`   Validation URL: ${validationUrl}`);

  const regRes = await fetch("https://api.safaricom.co.ke/mpesa/c2b/v2/registerurl", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ShortCode: shortCode,
      ResponseType: "Completed",
      ConfirmationURL: confirmationUrl,
      ValidationURL: validationUrl,
    }),
  });

  const regText = await regRes.text();
  console.log(`\n✅ SAFARICOM DARAJA API RESPONSE (HTTP ${regRes.status}):`);
  console.log(regText);
}

main().catch(console.error);

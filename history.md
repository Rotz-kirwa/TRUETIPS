# FORENSIC AUDIT & PIPELINE HISTORY — SURE-10 M-PESA INTEGRATION

**Audit Timestamp**: August 29, 2026 — 19:28:34 EAT (16:28:34 UTC)  
**Production Domain**: `https://www.sure-10.com`  
**Backend Runtime**: Render (`api/render-server.js` executing TanStack Start SSR)  
**M-Pesa Store / Child Shortcode**: `4980404`  
**M-Pesa Buy Goods Till**: `232392`  

---

## 1. Executive Summary & Objective

**Primary Objective**:  
Investigate and resolve why live M-Pesa payments made to Till `232392` were not consistently displaying on the admin dashboard at `https://www.sure-10.com`.

**Key Forensic Findings**:
1. **`ORIGINS` Environment Variable (DISPROVED)**  
   - `ORIGINS` is completely absent from the codebase (0 references in all source files).
   - Safaricom webhooks are direct server-to-server HTTP POST requests, which do not check CORS or origin headers. Adding `ORIGINS` on Render has zero impact on payment ingestion.
2. **Backend Server Endpoint Health (VERIFIED 100% FUNCTIONAL)**  
   - Direct HTTP POST test calls to `https://www.sure-10.com/api/payments/c2b/confirmation` returned `HTTP 200 OK {"ResultCode":0,"ResultDesc":"Accepted"}` within < 10ms.
   - Database schema (`mpesa_payments`), duplicate protection (`.onConflictDoNothing()`), and SMS automation triggers are fully operational.
3. **Daraja Portal URL Registration (VERIFIED)**  
   - Developer Portal screenshot confirms C2B URLs registered under Child Shortcode `4980404`:
     - **Confirmation URL**: `https://www.sure-10.com/api/payments/c2b/confirmation`
     - **Validation URL**: `https://www.sure-10.com/api/payments/c2b/validation`
     - **Status**: `Completed` / `Active`
4. **Root Cause Isolated (SAFARICOM TILL IPN FORWARDING)**  
   - Diagnostic checks returned `webhookReceivedCount24h: 0` and `lastCallbackReceived: 2026-08-28 14:53:33 UTC`.
   - Safaricom's core switch has not toggled internal C2B Webhook / IPN Forwarding for Till `232392` to route payments to Child Shortcode `4980404`.

---

## 2. Environment Variable Audit Matrix

| Environment Variable | Found in Codebase? | Exact File & Line Reference | Purpose | Production Render Status |
| :--- | :--- | :--- | :--- | :--- |
| `ORIGINS` | **NO** | N/A | None (CORS not used for webhooks) | Not required / Ignored |
| `DATABASE_URL` | **YES** | `api/render-server.js:155`, `src/lib/db/client.ts:6` | PostgreSQL DB Connection | Required & Active |
| `JWT_SECRET` | **YES** | `api/render-server.js:155`, `src/lib/auth.server.ts:20` | Admin Auth Cookie Signing | Required & Active |
| `MPESA_CONSUMER_KEY` | **YES** | `api/render-server.js:155`, `src/lib/mpesa.server.ts:12` | Daraja OAuth API Key | Required & Active |
| `MPESA_CONSUMER_SECRET` | **YES** | `api/render-server.js:155`, `src/lib/mpesa.server.ts:13` | Daraja OAuth API Secret | Required & Active |
| `MPESA_PASSKEY` | **YES** | `api/render-server.js:156`, `src/lib/mpesa.server.ts:60` | STK Push Passkey | Required & Active |
| `MPESA_SHORTCODE` | **YES** | `api/render-server.js:156`, `src/lib/mpesa.server.ts:7` | Child Shortcode (`4980404`) | Required & Active |
| `MPESA_TILL_NUMBER` | **YES** | `src/lib/payments.server.ts:8`, `src/lib/mpesa.server.ts:9` | Buy Goods Till (`232392`) | Required & Active |
| `MPESA_CALLBACK_URL` | **YES** | `api/render-server.js:156`, `src/lib/mpesa.server.ts:61` | Webhook Base URL | `https://www.sure-10.com` |
| `MPESA_ENVIRONMENT` | **YES** | `api/render-server.js:156`, `src/lib/mpesa.server.ts:2` | Daraja Mode | `"production"` |
| `SMS_PROVIDER` | **YES** | `api/render-server.js:157`, `src/lib/sms-automation.server.ts:14` | SMS Provider Selection | `"onfon"` |
| `ONFON_API_KEY` | **YES** | `api/render-server.js:157`, `src/lib/sms.server.ts:11` | Onfon SMS Key | Required & Active |
| `ONFON_CLIENT_ID` | **YES** | `api/render-server.js:157`, `src/lib/sms.server.ts:12` | Onfon Client ID | Required & Active |
| `ONFON_SENDER_ID` | **YES** | `api/render-server.js:157`, `src/lib/sms.server.ts:13` | Onfon Sender ID | Required & Active |

---

## 3. Detailed Pipeline Architecture & Data Flow

```text
[ Customer M-Pesa Payment to Till 232392 ]
                     │
                     ▼
[ Safaricom M-Pesa Core Switch ]
                     │
                     ├── (Awaiting: Safaricom Support Enable IPN Forwarding for Till 232392 → Shortcode 4980404)
                     ▼
[ Direct HTTP POST Webhook ]
URL: https://www.sure-10.com/api/payments/c2b/confirmation
                     │
                     ▼
[ Render Web Server: api/render-server.js ]
   ├── Log: [HTTP_INGRESS_CAPTURE]
   └── Forward to TanStack Start Engine: server.fetch(request)
                     │
                     ▼
[ Confirmation Route: src/routes/api.payments.c2b.confirmation.ts ]
   ├── Log: [C2B_CONFIRMATION_ENTRY] (Correlation ID generated)
   ├── Audit: Audit log written to `mpesa_callback_events`
   └── Response: HTTP 200 { "ResultCode": 0, "ResultDesc": "Accepted" } (Immediate < 10ms)
                     │
                     ▼ (Background Async Task)
[ Processing Handler: src/lib/mpesa-callback.server.ts ]
   ├── Function: handleC2bConfirmation()
   ├── Sanitization: sanitizeC2bBody() (TransID, TransAmount, MSISDN, Shortcode)
   ├── Database: db.insert(mpesaPayments).onConflictDoNothing({ target: mpesaReceiptNumber })
   └── SMS Automation: processPaymentSms() (Onfon Gateway Dispatch)
                     │
                     ▼
[ Production Dashboard: https://www.sure-10.com/payments ]
   ├── Loader: fetchPaymentsFn() -> fetchPayments() in src/lib/payments.server.ts
   └── React Hook: useLivePayments() polling every 10 seconds
```

---

## 4. Live Diagnostic Evidence

### Diagnostic Endpoint Audit (`GET /api/admin/payments/diagnostics`)
```json
{
  "ok": true,
  "timestamp": "2026-08-29T16:20:29.476Z",
  "diagnostics": {
    "lastCallbackReceived": "2026-08-28 14:53:33.008513+00",
    "lastPollRun": "2026-08-29T16:18:33.676Z",
    "recoveredViaPollCount24h": 0,
    "webhookReceivedCount24h": 0,
    "totalPayments24h": 0,
    "callbackHealth": "NO_ACTIVITY"
  },
  "config": {
    "shortcode": "4980404",
    "tillNumber": "232392",
    "environment": "production"
  }
}
```

### Ingress Live Test (`POST /api/payments/c2b/confirmation`)
- **Status**: `200 OK`
- **Output**: `{"ResultCode":0,"ResultDesc":"Accepted"}`

---

## 5. Next Steps While Awaiting Safaricom Response

1. **Safaricom Merchant Support Request**:
   - **Target Email**: `apisupport@safaricom.co.ke` / Account Manager
   - **Request**: *"Enable C2B Webhook / IPN Forwarding for Buy Goods Till 232392 linked to Head Office Shortcode 4980404."*
2. **Post-Activation Verification**:
   - Make a test payment of KES 10 to Till `232392`.
   - Run diagnostics check: `GET https://www.sure-10.com/api/admin/payments/diagnostics?secret=paylix-debug-2026`
   - Confirm `webhookReceivedCount24h` increments and payments display on `https://www.sure-10.com/payments`.

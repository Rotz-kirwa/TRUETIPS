# M-Pesa Ingestion Pipeline & Architecture History Log
**Date:** September 2, 2026  
**Project:** Payvora / Moonlight Games  
**Backend Host:** Render (`moonlight-games.onrender.com`)  
**Frontend Host:** Vercel (`www.sure-10.com`)  
**Shortcode:** `4980404` (Head Office: `4980406`) | **Till Number:** `232392`  

---

## Executive Summary & Current System Status (As of Sep 2, 2026)

| Milestone / Metric | Status | Details |
| :--- | :--- | :--- |
| **Daraja API URL Registration** | 🟢 **ACTIVE (`00000000`)** | Registered directly on Master Shortcode `4980406` to `moonlight-games.onrender.com` |
| **Direct Backend Reachability** | 🟢 **HTTP 200 OK** | Zero redirects (`301`/`308`), Cloudflare/Render edge returning clean JSON responses |
| **PostgreSQL Persistence** | 🟢 **OPERATIONAL** | Payments & raw callback events logged in real time into `mpesa_payments` & `mpesa_callback_events` |
| **Admin Dashboard Sync** | 🟢 **OPERATIONAL** | 5-second polling loop active at `https://www.sure-10.com/payments` |
| **Safaricom G2 Core IPN Forwarding** | 🔴 **PENDING SAFARICOM** | Till `232392` requires Safaricom Support to toggle IPN Auto-Forwarding in G2 Merchant System |
| **STK Push (Lipa Na M-Pesa Online)** | 🟠 **AWAITING ACTIVATION** | ResultCode `4999` ("Merchant does not exist") returned due to inactive core STK mapping on Safaricom G2 |

---

## Comprehensive Architecture & Troubleshooting Timeline

```mermaid
timeline
    title M-Pesa Integration Progression (Aug 28 - Sep 2, 2026)
    section Discovery & Deployment
        Aug 28 : Initial C2B setup under Shortcode 4980404
               : Identified database schema & webhook handlers
        Aug 30 : Migration to persistent Render infrastructure
               : Fixed SMS credit automation for shortcode 4980404
    section Forensic Audit
        Sep 01 : Discovered HTTP 308 permanent redirects on Vercel apex domain
               : Added Admin Payment Diagnostics endpoint (/api/admin/payments/diagnostics)
               : Built STK Push Trigger Modal UI on Payments Dashboard
    section Direct Routing & Parity
        Sep 02 : Bypassed Vercel proxies by registering direct Render endpoints on Daraja
               : Re-registered C2B endpoints under Master Shortcode 4980406 (ResponseCode 00000000)
               : Verified zero-redirect HTTP 200 OK responses via curl
               : Sent formal update request to Safaricom Technical Support for G2 IPN activation
```

---

## Detailed Log of Work & Fixes Completed

### 1. Webhook Infrastructure & Endpoint Alignment
- **Problem:** Safaricom’s proxy (`fs-c2b-v2`) failed with `RF-ServerError` when hitting `https://sure-10.com` due to Vercel apex domain `308 Permanent Redirects` pointing to `www.sure-10.com`.
- **Solution:** Re-routed all Daraja webhooks directly to the Render backend server (`https://moonlight-games.onrender.com/api/payments/c2b/confirmation`).
- **Verification:** Ran `curl -IL https://moonlight-games.onrender.com/api/payments/c2b/confirmation` and confirmed immediate `HTTP/2 200 OK` with 0 redirects.

### 2. Daraja Portal & API URL Registration
- **Action:** Automated registration via Safaricom OAuth API on Master Shortcode `4980406`.
- **API Response:**
  ```json
  {
    "OriginatorCoversationID": "a2c8-451a-b5ea-99ed765c8b871429020",
    "ResponseCode": "00000000",
    "ResponseDescription": "Success"
  }
  ```
- **Portal Verification:** Verified visually on the Daraja Developer Portal UI that the direct Render URLs are active under **URL Management**.

### 3. Database Logging & Administrative Controls
- **Audit Table:** Verified `mpesa_callback_events` records raw JSON payloads, source IPs (`196.201.214.*`), and processing timestamps.
- **Manual Entry & Diagnostics:** Built `/api/admin/payments/diagnostics` and added `+ Record Payment` and `⚡ Trigger STK Push` modal dialogs to `_app.payments.tsx`.
- **Live Ingestion Test:** Ingested synthetic test POST payload `SLIVE_482811` directly into `moonlight-games.onrender.com`; database persisted payment instantly with `status: Success`.

---

## Active Shortcomings & External Blockers

### 1. Safaricom G2 Core C2B IPN Forwarding (Till 232392)
- **Symptom:** Customers pay Till `232392` from mobile phones and receive official M-Pesa SMS confirmation receipts, but Safaricom dispatches 0 callbacks to the registered URL.
- **Root Cause:** Safaricom’s internal G2 core engine has not toggled "C2B IPN Webhook Auto-Forwarding" for Till `232392`.
- **Resolution Path:** Submitted ticket update to Safaricom Technical Support requesting IPN toggle in G2 Merchant Portal.

### 2. STK Push ResultCode 4999 ("Merchant does not exist")
- **Symptom:** Triggering STK Push returns `ResultCode 4999`.
- **Root Cause:** Online STK Push (Lipa Na M-Pesa Online) is not mapped to Shortcode `4980404` / Till `232392` on Safaricom's core.
- **Resolution Path:** Requested Safaricom Technical Support to authorize Lipa Na M-Pesa Online for Shortcode `4980404`.

---

## Active Environment Variable Configuration (Render `moonlight-games`)

```env
BUSINESS_NAME=PredictionLab
DATABASE_URL=postgresql://sure_10_user:K7zAvCJ7eoxJ5OeOgtpnbqrBX95VZGXZ@dpg-da6vlf61egvs73esj6r0-a.oregon-postgres.render.com/sure_10
JWT_SECRET=paylix-super-secret-jwt-key-2026-secure

MPESA_C2B_CONFIRMATION_URL=https://moonlight-games.onrender.com/api/payments/c2b/confirmation
MPESA_C2B_VALIDATION_URL=https://moonlight-games.onrender.com/api/payments/c2b/validation
MPESA_C2B_SHORTCODE=4980404
MPESA_CALLBACK_URL=https://moonlight-games.onrender.com

MPESA_CONSUMER_KEY=OWzibbuoj9it15pJLqY3RLuriXxthJVYUU4MmVgnohMg6nRG
MPESA_CONSUMER_SECRET=vULjb5gAFfAsxEmtMnFVMpl5H6wj66yVj6cXFh02SAv4MNCApqvUDYNGa3cXrRQd
MPESA_ENVIRONMENT=production
MPESA_PASSKEY=cb69fb59b02bbb0ab518f7de1c1b91645ce7408201096b6ddc169057d56d824b
MPESA_SHORTCODE=4980404
MPESA_TILL_NUMBER=232392

ONFON_API_KEY=2rYG3PR90oQzwMH4abIm18pTKUvxJkcfZiA67FuBShqgsE5X
ONFON_CLIENT_ID=nebula
ONFON_SENDER_ID=NEBULA
SMS_PROVIDER=onfon

ORIGINS=https://www.sure-10.com,https://sure-10.com,https://moonlight-games.onrender.com
VITE_API_URL=https://www.sure-10.com
```

---

## Next Steps Upon Safaricom Support Confirmation

1. **Verify Ingestion:** Monitor `GET /api/admin/payments/diagnostics` to confirm live callbacks from Safaricom (`source_ip: 196.201.214.*`).
2. **Dashboard Validation:** Confirm live till payments automatically credit user accounts and display on `https://www.sure-10.com/payments`.
3. **STK Push Re-Testing:** Test `⚡ Trigger STK Push` modal to verify mobile prompts.

# 📱 Payvora / Sure-10 Predict — M-Pesa C2B Integration Architecture & Production Guide

> **Production Status**: Production-hardened with zero-downtime HTTP 200 fail-safe responses, audit trail logging, and decoupled SMS prediction dispatch.

---

## 🛠️ 1. Production Configuration & Credentials

The application uses **Safaricom Daraja C2B (Customer to Business)** for Buy Goods Till payments and **Onfon Media / Africa's Talking** for automated prediction SMS delivery.

| Parameter | Production Value | Environment Variable Key |
| :--- | :--- | :--- |
| **M-Pesa Environment** | `production` | `MPESA_ENVIRONMENT` |
| **Child Shortcode (C2B URL Target)** | `4980404` | `MPESA_SHORTCODE` |
| **Head Office (HO) Shortcode** | `4980406` | — |
| **Buy Goods Store Till Number** | `232392` | `MPESA_TILL_NUMBER` |
| **Consumer Key** | `OWzibbuoj9it15pJLqY3RLuriXxthJVYUU4MmVgnohMg6nRG` | `MPESA_CONSUMER_KEY` |
| **Consumer Secret** | `vULjb5gAFfAsxEmtMnFVMpl5H6wj66yVj6cXFh02SAv4MNCApqvUDYNGa3cXrRQd` | `MPESA_CONSUMER_SECRET` |
| **Passkey** | `cb69fb59b02bbb0ab518f7de1c1b91645ce7408201096b6ddc169057d56d824b` | `MPESA_PASSKEY` |
| **Production Domain URL** | `https://moonlight-games.onrender.com` | `MPESA_CALLBACK_URL` |
| **Primary SMS Provider** | `onfon` | `SMS_PROVIDER` |
| **Onfon Client ID** | `nebula` | `ONFON_CLIENT_ID` |
| **Onfon Sender ID** | `NEBULA` | `ONFON_SENDER_ID` |
| **Onfon API Key** | `2rYG3PR90oQzwMH4abIm18pTKUvxJkcfZiA67FuBShqgsE5X` | `ONFON_API_KEY` |
| **Database Connection** | `postgres://postgres@127.0.0.1:5432/paylix` | `DATABASE_URL` |

---

## 🔄 2. End-to-End Payment Flow Architecture

```
[ Customer Phone ] ---> Pay KES 30 to Till 232392
         |
         v
[ Safaricom Daraja C2B Gateway ]
         |
         +---> (Step A: Validation) POST /api/payments/c2b/validation
         |                          <--- HTTP 200 {"ResultCode":0, "ResultDesc":"Accepted"}
         |
         +---> (Step B: Confirmation) POST /api/payments/c2b/confirmation
                                     |
                                     v
                       [ Render Production Server ]
                                     |
                                     +---> 1. Audit Request -> mpesa_callback_events
                                     +---> 2. Insert Payment -> mpesa_payments (status='Success')
                                     +---> 3. Return HTTP 200 Accepted to Safaricom
                                     |
                                     v
                       [ Decoupled SMS Engine ]
                                     |
                                     +---> Match rule (e.g. Basket Matches 🏀)
                                     +---> Dispatch Prediction SMS via Onfon/Africastalking
```

---

## 🌐 3. Registered Endpoint Routes & Fail-Safe Mechanisms

To ensure Safaricom never blackholes our callback URLs or rejects transactions, multiple redundant routes are registered:

### 1. C2B Validation Endpoints
- **Primary Route**: `POST /api/payments/c2b/validation`
- **Legacy Route**: `POST /c2b/validation`
- **Response**: Always returns `HTTP 200 OK` with `{ "ResultCode": 0, "ResultDesc": "Accepted" }`.
- **Purpose**: Informs Safaricom instantly that the customer's payment is authorized.

### 2. C2B Confirmation Endpoints
- **Primary Route**: `POST /api/payments/c2b/confirmation`
- **Legacy Route**: `POST /c2b/confirmation`
- **STK Callback Route**: `POST /api/mpesa/callback`
- **Response**: Always returns `HTTP 200 OK` with `{ "ResultCode": 0, "ResultDesc": "Accepted" }`.
- **Purpose**: Receives payment payload (`TransID`, `TransAmount`, `MSISDN`, `BillRefNumber`), inserts transaction record into `mpesa_payments`, and triggers SMS automation.

---

## 🗄️ 4. Database Schema Structure

### Table: `mpesa_payments`
Stores all successful and pending payment records.

```sql
CREATE TABLE IF NOT EXISTS mpesa_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'c2b_till',
  status TEXT NOT NULL DEFAULT 'Success',
  phone TEXT NOT NULL,
  payer_name TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  business_shortcode TEXT DEFAULT '4980406',
  till_number TEXT DEFAULT '232392',
  merchant_request_id TEXT,
  checkout_request_id TEXT UNIQUE,
  mpesa_receipt_number TEXT UNIQUE,
  result_code INTEGER DEFAULT 0,
  result_desc TEXT DEFAULT 'C2B Confirmed',
  account_reference TEXT,
  transaction_desc TEXT,
  raw_request_json JSONB,
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mpesa_payments_created_at ON mpesa_payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mpesa_payments_phone ON mpesa_payments(phone);
```

### Table: `mpesa_callback_events`
Audit trail recording raw request bodies from Safaricom for troubleshooting.

```sql
CREATE TABLE IF NOT EXISTS mpesa_callback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source_ip TEXT,
  user_agent TEXT,
  content_type TEXT,
  trans_id TEXT,
  checkout_request_id TEXT,
  phone_masked TEXT,
  amount NUMERIC(12,2),
  shortcode TEXT,
  payload JSONB,
  raw_body TEXT,
  result_code INTEGER,
  result_desc TEXT,
  processing_status TEXT NOT NULL DEFAULT 'received',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mpesa_callback_events_created_at ON mpesa_callback_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mpesa_callback_events_trans_id ON mpesa_callback_events(trans_id);
```

---

## ⚡ 5. Decoupled SMS Dispatch Engine

Managed by `src/lib/sms-automation.server.ts`:
1. When a payment of amount $A$ is inserted:
   - System searches `sms_automation_rules` for an active rule matching $A \in [\text{minAmount}, \text{maxAmount}]$.
   - If no exact match is found, system automatically matches the **nearest active rule**.
2. **Error Isolation**:
   - `processPaymentSms()` runs inside its own `try...catch` block.
   - If Onfon or Africastalking SMS gateway experiences temporary downtime, the payment insertion into `mpesa_payments` is **100% preserved**.

---

## 📋 6. Checklist to Verify Production Environment Variables on Render

Ensure the following variables are set in your **Render Environment Tab**:

- [x] `DATABASE_URL` = `postgres://...`
- [x] `MPESA_ENVIRONMENT` = `production`
- [x] `MPESA_SHORTCODE` = `4980404` (Child shortcode for C2B registration)
- [x] `MPESA_TILL_NUMBER` = `232392`
- [x] `MPESA_CONSUMER_KEY` = `OWzibbuoj9it15pJLqY3RLuriXxthJVYUU4MmVgnohMg6nRG`
- [x] `MPESA_CONSUMER_SECRET` = `vULjb5gAFfAsxEmtMnFVMpl5H6wj66yVj6cXFh02SAv4MNCApqvUDYNGa3cXrRQd`
- [x] `MPESA_PASSKEY` = `cb69fb59b02bbb0ab518f7de1c1b91645ce7408201096b6ddc169057d56d824b`
- [x] `MPESA_CALLBACK_URL` = `https://moonlight-games.onrender.com`
- [x] `SMS_PROVIDER` = `onfon`
- [x] `ONFON_API_KEY` = `2rYG3PR90oQzwMH4abIm18pTKUvxJkcfZiA67FuBShqgsE5X`
- [x] `ONFON_CLIENT_ID` = `nebula`
- [x] `ONFON_SENDER_ID` = `NEBULA`

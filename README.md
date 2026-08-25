# 🏆 PredictionLab — Sports Prediction Console & M-Pesa SMS Automation Platform

**PredictionLab** is an enterprise-grade, full-stack Sports Prediction Management System and automated M-Pesa SMS dispatch engine. Engineered for sports analytics platforms, tipster services, and subscription-based betting consoles, PredictionLab provides seamless prediction distribution, jackpot fixture management, instant payment reconciliation via Safaricom Daraja API, and dynamic automated SMS delivery to subscribers.

---

## 🌟 Key Modules & Feature Highlights

### ⚽ 1. Sports Prediction Console
* **Multi-Sport Management**: Full support for Football & Basketball match predictions with configurable odds, confidence scores, and league tagging.
* **Tiered Access Control**: Organize predictions by access tier (*Gold*, *Silver*, *Platinum*) and publishing status (*Published*, *Draft*).
* **Settlement Engine**: Real-time match outcome updates (Won, Lost, Void, Pending) with automatic record updates.
* **Persistent Data System**: Hardened non-volatile prediction engine — user-defined predictions remain permanent and are never overwritten by background re-seeding.

### 🏆 2. Jackpot Management System
* **Custom Jackpot Fixtures**: Complete management of Mega Jackpots, Midweek Jackpots, and daily jackpot pools.
* **Interactive Fixtures Order**: Order matches sequentially with home team, away team, predicted result, and scorelines.
* **Live Status Tracking**: Toggle jackpot states (*OPEN*, *CLOSED*, *SETTLED*) with real-time total odds calculation.

### 💬 3. M-Pesa Automated SMS Dispatch Engine
* **Rule-Based Tier Automation**: Automatically matches customer payment amounts to specific prediction package rules (e.g., Daily Football ⚽, Jackpot Matches 🏆, Basketball Picks 🏀, Weekly & Monthly Subscriptions).
* **Dual Editor Modes**:
  * **Table Builder**: Interactive match fixture grid supporting team home/away entries, pick selection, inline row additions, and quick deletion.
  * **Raw Text Editor**: Monospaced text input with live character counter, tag insertions (`{customer_name}`, `{phone}`, `{amount}`, `{transaction_code}`), and formatting tools.
* **Smart Match Parser**: Automatic detection and auto-splitting of bulk-pasted text into structured match fixture rows.
* **Clean Starter Templates**: Decoupled from hardcoded boilerplate fixtures — package rules preserve exact user edits with zero unwanted sample re-injections.

### 💳 4. Safaricom Daraja M-Pesa Payment Integration
* **STK Push (Lipa Na M-Pesa Online)**: Direct mobile payment initiation with instant push notification prompts.
* **C2B Buy Goods & Paybill Reconciler**: Webhook listeners (`/api/payments/c2b/confirmation` and validation) for automated instant payment capture.
* **Financial Metrics Dashboard**: Real-time transaction metrics tracking daily, weekly, monthly, and lifetime revenue.

### 📊 5. Customer & Subscriber Analytics
* **Subscriber Intelligence**: Detailed view of registered customer phones, total expenditure, tier breakdown, and payment history.
* **Audit & Dispatch Logs**: Complete visibility into incoming payment callbacks and outgoing SMS delivery statuses.

---

## 🛠️ Tech Stack & Architecture

| Layer | Technology |
| :--- | :--- |
| **Framework** | React 19, TanStack Start (`@tanstack/react-start`), TanStack Router |
| **Language & Tooling** | TypeScript, Vite 7 |
| **Styling & UI** | Tailwind CSS v4, Glassmorphic UI System, Lucide React Icons, Radix UI |
| **Database & ORM** | PostgreSQL, Drizzle ORM (`drizzle-orm`, `postgres`) |
| **Notifications** | Sonner Toast System |
| **Authentication** | JWT HTTP-Only Cookies (`jose`), `bcryptjs` Hashing |

---

## ⚙️ Environment Configuration

Create a `.env` file in the root directory:

```env
# Database & Auth
DATABASE_URL="postgres://postgres@127.0.0.1:5432/predictionlab"
JWT_SECRET="predictionlab-super-secret-jwt-key-2026-secure"

# M-Pesa Daraja Configuration
MPESA_ENVIRONMENT="sandbox" # "sandbox" or "production"
MPESA_CONSUMER_KEY="your_consumer_key"
MPESA_CONSUMER_SECRET="your_consumer_secret"
MPESA_PASSKEY="your_passkey"
MPESA_SHORTCODE="174379"
MPESA_TILL_NUMBER="174379"
MPESA_CALLBACK_URL="http://localhost:8080"

# SMS Provider Configuration
SMS_PROVIDER="onfon" # "onfon" | "africastalking" | "safaricom" | "custom"
ONFON_API_KEY="your_onfon_api_key"
ONFON_CLIENT_ID="your_onfon_client_id"
ONFON_SENDER_ID="NEBULA"
```

---

## 🚀 Quick Start Guide

### 1. Install Dependencies
```bash
npm install
```

### 2. Initialize PredictionLab PostgreSQL Database
Execute the database initialization script to provision schemas, create default package tiers, and set initialization flags:
```bash
node scratch/init-paylix-db.js
```

### 3. Start Development Server
Launch the development environment:
```bash
npm run dev
```
Access the application at `http://localhost:8080`.

### 4. Build for Production
Validate code integrity and generate the optimized build:
```bash
npm run build
```

---

## 📋 Database Maintenance Utilities

The project includes utility scripts inside the `scratch/` directory for database administration:

* **Initialize Database**: `node scratch/init-paylix-db.js` — Sets up all tables and clean package tiers.
* **Clear Predictions Slate**: `node scratch/clear-predictions.js` — Purges active predictions and jackpots while retaining seeded settings.
* **Clean Package Rule Templates**: `node scratch/clean-rule-templates.js` — Cleans sample match fixtures from all SMS package rules.

---

## 🛡️ Production Deployment

PredictionLab supports flexible production execution models:

* **Node.js Production Server**: `node api/render-server.js` (Serves static client assets while delegating server RPCs and API webhooks).
* **Serverless Deployment**: Ready for Vercel / Render deployment via `api/server.js`.

---

## 📄 License

Private & Confidential — **PredictionLab HQ**. All Rights Reserved.

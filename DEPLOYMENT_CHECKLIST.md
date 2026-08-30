# C2B Handler Fix - Deployment Checklist

**Status:** Ready for deployment  
**Risk Level:** MEDIUM  
**Difficulty:** EASY  
**Estimated Time:** 30-45 minutes per environment  

---

## PRE-DEPLOYMENT (Before Any Changes)

### 1. Documentation Review
- [ ] Read `M-PESA_C2B_PRODUCTION_FORENSIC_AUDIT.md` (understand root cause)
- [ ] Read `C2B_HANDLER_FIX_IMPLEMENTATION.md` (understand solution)
- [ ] Read `C2B_PRODUCTION_INCIDENT_SUMMARY.md` (overview)
- [ ] Review `src/routes/api.payments.c2b.confirmation.FIXED.ts` (code review)

### 2. Environment Preparation
- [ ] Access Render dashboard (production server)
- [ ] Access Vercel dashboard (if applicable)
- [ ] Access PostgreSQL admin tools
- [ ] Set up log monitoring (Render logs or CloudWatch)
- [ ] Prepare rollback script (save to safe location)

### 3. Stakeholder Notification
- [ ] Notify team that C2B deployment happening
- [ ] Disable alerts that might trigger during deployment
- [ ] Schedule maintenance window (optional, fix is safe to deploy anytime)

### 4. Backup Original
```bash
cd /home/user/sas/Payvora
cp src/routes/api.payments.c2b.confirmation.ts \
   src/routes/api.payments.c2b.confirmation.ORIGINAL.ts
git add src/routes/api.payments.c2b.confirmation.ORIGINAL.ts
git commit -m "backup: save original C2B handler before fix deployment"
git push
```

---

## STAGE 1: DEVELOPMENT TESTING (Local)

### 1. Code Review
```bash
# View the fixed handler
code src/routes/api.payments.c2b.confirmation.FIXED.ts

# Compare with original
diff src/routes/api.payments.c2b.confirmation.ts \
     src/routes/api.payments.c2b.confirmation.FIXED.ts

# Check for syntax errors
npm run lint -- src/routes/api.payments.c2b.confirmation.FIXED.ts
```

**Approval Checklist:**
- [ ] Code follows project style guide
- [ ] All async operations properly awaited
- [ ] Error handling covers all paths
- [ ] Logging statements are clear
- [ ] No breaking API changes
- [ ] Comments explain critical sections

### 2. Type Checking
```bash
# Verify TypeScript compilation
npx tsc --noEmit src/routes/api.payments.c2b.confirmation.FIXED.ts
```

**Result:** Should compile without errors

### 3. Unit Tests
```bash
# Run existing tests (should all pass)
npm run test

# Check if any C2B-specific tests exist
npm run test -- --testNamePattern="c2b|confirmation"
```

**Expected:** All tests pass

### 4. Local Synthetic Test
```bash
# Copy FIXED version for testing
cp src/routes/api.payments.c2b.confirmation.FIXED.ts \
   src/routes/api.payments.c2b.confirmation.ts

# Start development server
npm run dev

# In another terminal, send synthetic callback
node scratch/test-c2b-simulation.js

# Expected output: Payment created successfully
```

**Check Results:**
```bash
# Query local database
sqlite3 paylix.db "SELECT COUNT(*) FROM mpesa_payments WHERE source='c2b_till';"

# Should return: 1 (payment created)
```

### 5. Restore Original (If Testing Locally)
```bash
# If you tested with FIXED version, restore original
git checkout src/routes/api.payments.c2b.confirmation.ts
```

---

## STAGE 2: STAGING DEPLOYMENT

### 1. Deploy to Render Staging

**Option A: Via Git Push**
```bash
# Ensure FIXED version is in repo
cp src/routes/api.payments.c2b.confirmation.FIXED.ts \
   src/routes/api.payments.c2b.confirmation.STAGING.ts

git add src/routes/api.payments.c2b.confirmation.STAGING.ts
git commit -m "staging: deploy C2B handler fix to staging environment"
git push

# Render auto-deploys from main branch
# (assuming you're deploying from main; adjust if needed)
```

**Option B: Via Render Dashboard**
1. Go to Render dashboard
2. Select staging service
3. Manual deploy from Git branch
4. Wait for deployment to complete

### 2. Verify Staging Deployment

```bash
# Check deployment status
curl https://staging-sure-10.onrender.com/api/payments/c2b/confirmation -X GET

# Expected: HTTP 200 with service status
```

### 3. Test with Staging Database

```bash
# Verify database connection
curl -H "x-debug-token: paylix-debug-2026" \
  https://staging-sure-10.onrender.com/api/admin/payments/diagnostics

# Expected: All config values correct, environment="staging"
```

### 4. Send Staging C2B Callback

```bash
# Use Safaricom sandbox credentials
node scratch/test-c2b-simulation.js \
  --endpoint "https://staging-sure-10.onrender.com/api/payments/c2b/confirmation" \
  --environment "sandbox"

# Expected: HTTP 200 response
```

### 5. Verify Staging Payment Creation

```bash
# Query staging database
psql $STAGING_DATABASE_URL \
  "SELECT COUNT(*) FROM mpesa_payments WHERE source='c2b_till' AND created_at > NOW() - INTERVAL '5 minutes';"

# Expected: 1 (payment created successfully)
```

### 6. Check Staging Audit Trail

```bash
# Verify callback audit recorded
psql $STAGING_DATABASE_URL \
  "SELECT * FROM mpesa_callback_events WHERE created_at > NOW() - INTERVAL '5 minutes' ORDER BY created_at DESC LIMIT 1;"

# Expected: Audit record exists with processing_status='accepted'
```

### 7. Verify Staging Logs

```bash
# Check Render logs for expected entries
# Should see:
# [C2B_CONFIRMATION_ENTRY] - Request received
# [C2B_CALLBACK_PERSISTED] - Audit created
# [C2B_PROCESSING_COMPLETE] - Payment processed
# [C2B_AUDIT_RESULT_MARKED] - Result recorded
# [C2B_CONFIRMATION_RESPONSE] - Response sent
# [C2B_SMS_TRIGGER] - SMS queued
```

**Approval Checklist:**
- [ ] Staging deployment successful
- [ ] Test callback received and processed
- [ ] Payment created in database
- [ ] Audit trail recorded
- [ ] Expected log entries present
- [ ] SMS automation triggered

---

## STAGE 3: PRODUCTION DEPLOYMENT

### 1. Enable Production Monitoring

**Open these in separate browser tabs:**
- [ ] Render production logs
- [ ] Production database query tool (psql)
- [ ] Diagnostics endpoint: `/api/admin/payments/diagnostics`
- [ ] Application error tracking

### 2. Deploy Fixed Version to Production

```bash
# Deploy FIXED version
cp src/routes/api.payments.c2b.confirmation.FIXED.ts \
   src/routes/api.payments.c2b.confirmation.ts

# Commit
git add src/routes/api.payments.c2b.confirmation.ts
git commit -m "deploy(c2b): fix Vercel serverless race condition in production

This critical fix resolves the issue where C2B callbacks from Safaricom
were not being processed and payments were lost.

Root cause: Fire-and-forget async pattern in Vercel serverless caused
Lambda termination after HTTP response, interrupting database operations.

Fix: Move all database operations BEFORE HTTP response. Response time
increases from 30ms to 500-2000ms (still within Safaricom SLA).

Expected improvements:
- webhookReceivedCount24h: 0 → > 0
- lastCallbackReceived: null → recent timestamp
- callbackHealth: NO_ACTIVITY → HEALTHY
- Payments now successfully recorded

Related: M-PESA_C2B_PRODUCTION_FORENSIC_AUDIT.md"

git push
```

**Wait for:** Vercel/Render to auto-deploy (typically 2-5 minutes)

### 3. Verify Production Deployment

```bash
# Confirm handler updated
curl https://www.sure-10.com/api/payments/c2b/confirmation -X GET

# Check deployment timestamp
curl -H "x-debug-token: paylix-debug-2026" \
  https://www.sure-10.com/api/admin/payments/diagnostics | jq '.diagnostics'
```

**Expected:** Response contains fresh deployment info

### 4. Monitor Production Logs (First 10 Minutes)

```bash
# Watch for errors
grep -i "error\|failed" <(tail -f render-production.log)

# Watch for expected log entries
grep "C2B_CONFIRMATION_RESPONSE" <(tail -f render-production.log)
```

**Normal Log Pattern:**
```
[C2B_CONFIRMATION_ENTRY] Request received
[C2B_CALLBACK_PERSISTED] Audit created
[C2B_PROCESSING_COMPLETE] Payment processed
[C2B_AUDIT_RESULT_MARKED] Result recorded
[C2B_CONFIRMATION_RESPONSE] Status:200 PaymentCreated:true
[C2B_SMS_TRIGGER] SMS queued
```

**If You See Errors:** Stop here and review error messages

### 5. Test with Real Safaricom (If Possible)

```bash
# Contact Safaricom support to send test payment to Till 232392
# OR arrange for customer to send small test payment
# Amount: KES 1-10 (minimal)
# Till: 232392
# Expected timeframe: Within 30 seconds
```

**Monitoring During Test:**
- [ ] Verify payment appears in database
- [ ] Verify audit trail recorded
- [ ] Verify SMS sent to customer
- [ ] Check diagnostics endpoint updated

### 6. Verify Production Metrics

```bash
# Query production database
psql $PRODUCTION_DATABASE_URL \
  "SELECT COUNT(*) FROM mpesa_payments WHERE source='c2b_till' AND created_at > NOW() - INTERVAL '1 hour';"

# Expected: > 0 (should match real Safaricom payments received)
```

### 7. Check Production Diagnostics

```bash
# Call diagnostics endpoint
curl -H "x-debug-token: paylix-debug-2026" \
  https://www.sure-10.com/api/admin/payments/diagnostics

# Expected output:
{
  "ok": true,
  "diagnostics": {
    "lastCallbackReceived": "2026-08-30T10:15:33.123Z",  // ← Not null
    "webhookReceivedCount24h": 5,                        // ← Not 0
    "totalPayments24h": 5,                              // ← Not 0
    "callbackHealth": "HEALTHY"                         // ← Not NO_ACTIVITY
  }
}
```

**Approval Checklist:**
- [ ] Production deployment successful
- [ ] No critical errors in logs
- [ ] Test payment created successfully
- [ ] Audit trail complete
- [ ] SMS delivered
- [ ] Diagnostics metrics improved
- [ ] All monitoring systems healthy

---

## STAGE 4: POST-DEPLOYMENT VERIFICATION (24 Hours)

### 1. Review 24-Hour Metrics

```bash
# After 24 hours, run diagnostics
curl -H "x-debug-token: paylix-debug-2026" \
  https://www.sure-10.com/api/admin/payments/diagnostics

# Compare to pre-deployment:
# BEFORE: webhookReceivedCount24h = 0
# AFTER:  webhookReceivedCount24h = [your_payment_count]
```

### 2. Sample Production Data

```bash
# View latest payments
psql $PRODUCTION_DATABASE_URL \
  "SELECT id, source, status, amount, phone, created_at FROM mpesa_payments 
   WHERE source='c2b_till' 
   ORDER BY created_at DESC LIMIT 10;"

# Expected: Multiple successful payments with timestamps after deployment
```

### 3. Verify SMS Delivery

```bash
# Check SMS logs
psql $PRODUCTION_DATABASE_URL \
  "SELECT COUNT(*) FROM sms_logs 
   WHERE created_at > NOW() - INTERVAL '24 hours' AND status='sent';"

# Expected: Should match payment count (one SMS per payment)
```

### 4. Customer Feedback

- [ ] Monitor support tickets for complaints about missing payments
- [ ] Verify customers report receiving SMS confirmations
- [ ] Check if payment receipts are appearing in customer accounts

### 5. Database Health

```bash
# Check for any locked transactions
psql $PRODUCTION_DATABASE_URL \
  "SELECT * FROM pg_stat_activity WHERE state = 'active';"

# Expected: Normal query activity, no long-running transactions
```

### 6. Performance Metrics

```bash
# Check response times (if available in your monitoring)
# Expected: 500-2000ms for C2B confirmation (slower than before, but acceptable)

# Check database connection pool
# Expected: Stable at max: 1 connection per Lambda
```

---

## TROUBLESHOOTING

### Issue: Payments Still Not Created After Deployment

**Diagnostic Steps:**
1. Check logs for errors
2. Verify database connection string
3. Verify MPESA_SHORTCODE and MPESA_TILL_NUMBER env vars
4. Test direct SQL insert
5. Check for database permission issues

**Resolution:**
- Review `C2B_HANDLER_FIX_IMPLEMENTATION.md` troubleshooting section
- Check database logs for errors
- Verify all environment variables

### Issue: Response Time Exceeds SLA

**Diagnostic Steps:**
1. Measure database query time
2. Check database connection latency
3. Verify no long-running queries

**Resolution:**
- Response time of 500-2000ms is acceptable
- If slower, investigate database performance
- May need database optimization (not code change)

### Issue: SMS Not Sending

**Diagnostic Steps:**
1. Verify SMS configuration
2. Check SMS provider API status
3. Review SMS logs for errors

**Resolution:**
- SMS failures are non-blocking (payment succeeds regardless)
- Configure SMS provider credentials in `.env`
- Review SMS automation logs

---

## ROLLBACK (Emergency Only)

If critical production issues occur:

```bash
# Restore original handler
cp src/routes/api.payments.c2b.confirmation.ORIGINAL.ts \
   src/routes/api.payments.c2b.confirmation.ts

# Commit immediately
git add src/routes/api.payments.c2b.confirmation.ts
git commit -m "EMERGENCY ROLLBACK: revert C2B handler to original

This restores the fire-and-forget pattern. Use only if deployment
causes production outages. Payment loss will resume."

git push

# Wait for re-deployment (2-5 minutes)
```

**Post-Rollback:**
- Debug the issue offline
- Do NOT re-deploy until root cause found
- Create GitHub issue with detailed error logs

---

## SUCCESS CRITERIA

Deployment is successful if ALL of the following are true:

1. ✅ Production deployment completed without errors
2. ✅ No critical errors in application logs
3. ✅ Diagnostics endpoint shows updated metrics
4. ✅ Test payment created successfully in database
5. ✅ Audit trail recorded for test payment
6. ✅ SMS sent for test payment
7. ✅ 24-hour metrics show C2B payments recorded
8. ✅ No increase in error rate
9. ✅ No database performance degradation
10. ✅ Customer feedback confirms payment receipt

**If All 10 Are True:** 🎉 **DEPLOYMENT SUCCESSFUL**

---

## Post-Deployment Tasks

### 1. Update Documentation
- [ ] Update README with latest payment flow
- [ ] Document C2B handler changes in architecture docs
- [ ] Add incident and resolution to runbook

### 2. Alert Safaricom (Optional)
- [ ] Notify Safaricom support that webhook processing is now fixed
- [ ] Provide diagnostics endpoint for verification
- [ ] Request confirmation of webhook delivery

### 3. Cleanup
- [ ] Remove FIXED.ts file from repository (if desired)
- [ ] Archive original backup for reference
- [ ] Update deployment procedures

### 4. Monitor Ongoing
- [ ] Set up alerts for payment count anomalies
- [ ] Monitor response time SLA
- [ ] Track SMS delivery success rate

---

## Support & Questions

**For deployment help:** Contact your DevOps team  
**For technical questions:** Review `C2B_HANDLER_FIX_IMPLEMENTATION.md`  
**For root cause details:** Review `M-PESA_C2B_PRODUCTION_FORENSIC_AUDIT.md`  

---

**Deployment Checklist Version:** 1.0  
**Last Updated:** 2026-08-30  
**Status:** Ready for deployment ✅

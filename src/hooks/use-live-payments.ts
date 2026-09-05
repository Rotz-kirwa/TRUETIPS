import { useCallback, useEffect, useRef, useState, startTransition } from "react";
import { fetchPaymentsFn, type MpesaPayment } from "@/lib/payments";

export function useLivePayments(initialPayments: MpesaPayment[], intervalMs = 10000) {
  const [payments, setPayments] = useState<MpesaPayment[]>(initialPayments);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Guard against in-flight duplicate requests
  const pendingRef = useRef(false);
  // Stable ref to latest payments so interval callback never stales out
  const paymentsRef = useRef(payments);
  paymentsRef.current = payments;

  useEffect(() => {
    setIsMounted(true);
    setLastUpdated(new Date());
  }, []);

  // Sync if initial data changes (e.g. route invalidation)
  useEffect(() => {
    setPayments((prev) => {
      if (!initialPayments?.length) return prev;
      // Only update if something actually changed — avoid spurious re-renders
      if (
        prev.length === initialPayments.length &&
        prev[0]?.id === initialPayments[0]?.id &&
        prev[0]?.updatedAt === initialPayments[0]?.updatedAt
      ) {
        return prev;
      }
      return initialPayments;
    });
  }, [initialPayments]);

  // Stable refresh function — deps array is empty so interval never rebuilds
  const refresh = useCallback(async () => {
    if (pendingRef.current) return paymentsRef.current;
    pendingRef.current = true;
    setIsRefreshing(true);
    try {
      const fresh = (await fetchPaymentsFn()) as MpesaPayment[];
      startTransition(() => {
        setPayments((prev) => {
          // Bail out if nothing changed — prevents React from doing a full reconcile
          if (
            prev.length === fresh.length &&
            prev[0]?.id === fresh[0]?.id &&
            prev[0]?.status === fresh[0]?.status
          ) {
            return prev;
          }
          return fresh;
        });
        setLastUpdated(new Date());
      });
      return fresh;
    } catch {
      return paymentsRef.current;
    } finally {
      pendingRef.current = false;
      setIsRefreshing(false);
    }
  }, []); // ← empty deps: stable reference, interval never rebuilds

  useEffect(() => {
    const timer = window.setInterval(() => {
      // Don't poll if tab is hidden — saves battery + bandwidth
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refresh();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs, refresh]);

  return { payments, refresh, isRefreshing, lastUpdated, isMounted };
}

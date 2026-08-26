import { startTransition, useEffect, useRef, useState } from "react";
import { fetchPaymentsFn, type MpesaPayment } from "@/lib/payments";

export function useLivePayments(initialPayments: MpesaPayment[], intervalMs = 10000) {
  const [payments, setPayments] = useState(initialPayments);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    setIsMounted(true);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    setPayments(initialPayments);
  }, [initialPayments]);

  const refresh = async () => {
    if (pendingRef.current) return payments;
    pendingRef.current = true;
    setIsRefreshing(true);
    try {
      const fresh = await fetchPaymentsFn();
      startTransition(() => {
        setPayments(fresh);
        setLastUpdated(new Date());
      });
      return fresh;
    } finally {
      pendingRef.current = false;
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh().catch(() => {
        // Keep current snapshot if background refresh fails.
      });
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [intervalMs]);

  return { payments, refresh, isRefreshing, lastUpdated, isMounted };
}

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PeriodMetrics } from "@/types";

const EMPTY: PeriodMetrics = {
  sales_count: 0,
  gross_revenue: 0,
  net_revenue: 0,
  refunds_count: 0,
  refunded_amount: 0,
  avg_ticket: 0,
  total_spend: 0,
  meta_spend: 0,
  google_spend: 0,
  roas: null,
  net_profit: 0,
  margin_pct: null,
};

interface UseDashboardMetricsParams {
  clientId: string | null;
  fromStr: string;
  toStr: string;
  prevFromStr: string;
  prevToStr: string;
}

export function useDashboardMetrics({
  clientId,
  fromStr,
  toStr,
  prevFromStr,
  prevToStr,
}: UseDashboardMetricsParams) {
  const [current, setCurrent]   = useState<PeriodMetrics>(EMPTY);
  const [previous, setPrevious] = useState<PeriodMetrics>(EMPTY);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function fetch() {
      const [curr, prev] = await Promise.all([
        supabase.rpc("get_period_metrics", {
          p_client_id: clientId,
          p_date_from: fromStr,
          p_date_to:   toStr,
        }),
        supabase.rpc("get_period_metrics", {
          p_client_id: clientId,
          p_date_from: prevFromStr,
          p_date_to:   prevToStr,
        }),
      ]);

      if (cancelled) return;

      if (curr.error) {
        setError(curr.error.message);
        setLoading(false);
        return;
      }

      setCurrent((curr.data?.[0] as PeriodMetrics) ?? EMPTY);
      setPrevious((prev.data?.[0] as PeriodMetrics) ?? EMPTY);
      setLoading(false);
    }

    fetch();
    return () => { cancelled = true; };
  }, [clientId, fromStr, toStr, prevFromStr, prevToStr]);

  // Calcula variação % entre os dois períodos
  function delta(curr: number, prev: number): number | null {
    if (prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  }

  const deltas = {
    sales_count:   delta(current.sales_count,   previous.sales_count),
    gross_revenue: delta(current.gross_revenue, previous.gross_revenue),
    net_revenue:   delta(current.net_revenue,   previous.net_revenue),
    total_spend:   delta(current.total_spend,   previous.total_spend),
    meta_spend:    delta(current.meta_spend,     previous.meta_spend),
    google_spend:  delta(current.google_spend,   previous.google_spend),
    roas:          current.roas !== null && previous.roas !== null
                     ? delta(current.roas, previous.roas)
                     : null,
    avg_ticket:    delta(current.avg_ticket,     previous.avg_ticket),
  };

  return { current, previous, deltas, loading, error };
}

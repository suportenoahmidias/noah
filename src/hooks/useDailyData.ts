import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import type { DashboardDaily, CampaignPerformance } from "@/types";

export function useDailyData(
  clientId: string | null,
  fromStr: string,
  toStr: string
) {
  const [daily, setDaily]     = useState<DashboardDaily[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setLoading(true);

    supabase
      .from("v_dashboard_daily")
      .select("*")
      .eq("client_id", clientId)
      .gte("day", fromStr)
      .lte("day", toStr)
      .order("day")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else setDaily((data as DashboardDaily[]) ?? []);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [clientId, fromStr, toStr]);

  // Formata para os gráficos de Recharts
  const chartData = daily.map((d) => ({
    day:           format(new Date(d.day + "T00:00:00"), "dd/MM"),
    faturamento:   d.gross_revenue,
    liquido:       d.net_revenue,
    meta:          d.meta_spend,
    google:        d.google_spend,
    investimento:  d.total_spend,
    roas:          d.roas ?? 0,
    vendas:        d.sales_count,
  }));

  return { daily, chartData, loading, error };
}

export function useCampaignPerformance(
  clientId: string | null,
  fromStr: string,
  toStr: string
) {
  const [campaigns, setCampaigns] = useState<CampaignPerformance[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setLoading(true);

    supabase
      .from("v_campaign_performance")
      .select("*")
      .eq("client_id", clientId)
      .gte("day", fromStr)
      .lte("day", toStr)
      .order("gross_revenue", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setCampaigns((data as CampaignPerformance[]) ?? []);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [clientId, fromStr, toStr]);

  // Agrega por campanha (soma todos os dias)
  const aggregated = campaigns.reduce<
    Map<string, CampaignPerformance & { days: number }>
  >((acc, row) => {
    const key = row.campaign ?? "Sem campanha";
    const existing = acc.get(key);
    if (existing) {
      existing.gross_revenue += row.gross_revenue;
      existing.net_revenue   += row.net_revenue;
      existing.total_spend   += row.total_spend;
      existing.sales_count   += row.sales_count;
      existing.days++;
      existing.roas =
        existing.total_spend > 0
          ? existing.gross_revenue / existing.total_spend
          : null;
    } else {
      acc.set(key, { ...row, days: 1 });
    }
    return acc;
  }, new Map());

  const campaignList = Array.from(aggregated.values()).sort(
    (a, b) => (b.roas ?? 0) - (a.roas ?? 0)
  );

  return { campaignList, loading };
}

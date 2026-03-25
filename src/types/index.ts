// ── Tipos do banco de dados ──────────────────────────────────

export interface Client {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  client_id: string;
  hotmart_product_id: string;
  name: string;
  active: boolean;
}

// ── Tipos das views de métricas ──────────────────────────────

/** Retorno da função get_period_metrics() */
export interface PeriodMetrics {
  sales_count: number;
  gross_revenue: number;
  net_revenue: number;
  refunds_count: number;
  refunded_amount: number;
  avg_ticket: number;
  total_spend: number;
  meta_spend: number;
  google_spend: number;
  roas: number | null;
  net_profit: number;
  margin_pct: number | null;
}

/** Linha da view v_dashboard_daily */
export interface DashboardDaily {
  client_id: string;
  day: string; // "YYYY-MM-DD"
  sales_count: number;
  gross_revenue: number;
  net_revenue: number;
  refunds_count: number;
  refunded_amount: number;
  avg_ticket: number;
  total_spend: number;
  meta_spend: number;
  google_spend: number;
  total_impressions: number;
  total_clicks: number;
  roas: number | null;
  net_profit: number;
  margin_pct: number | null;
}

/** Linha da view v_campaign_performance */
export interface CampaignPerformance {
  client_id: string;
  campaign: string;
  day: string;
  sales_count: number;
  gross_revenue: number;
  net_revenue: number;
  total_spend: number;
  platform: string | null;
  roas: number | null;
}

// ── Tipos do seletor de período ──────────────────────────────

export type PresetPeriod =
  | "today"
  | "yesterday"
  | "last7"
  | "last14"
  | "last30"
  | "this_month"
  | "last_month"
  | "custom";

export interface DateRange {
  from: Date;
  to: Date;
  preset: PresetPeriod;
}

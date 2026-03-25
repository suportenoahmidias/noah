-- ============================================================
-- MIGRATION 003 - Views de Métricas para o Dashboard
-- Todas as queries que o Lovable vai consumir
-- ============================================================

-- ============================================================
-- VIEW: Resumo diário de vendas por cliente
-- Faturamento bruto, líquido, número de vendas, ticket médio
-- ============================================================
CREATE OR REPLACE VIEW v_sales_daily AS
SELECT
  client_id,
  product_id,
  DATE(sale_date AT TIME ZONE 'America/Sao_Paulo') AS sale_day,
  utm_source,
  utm_medium,
  utm_campaign,

  -- Apenas vendas aprovadas e completas geram receita
  COUNT(*) FILTER (WHERE status IN ('APPROVED', 'COMPLETE'))       AS total_sales,
  SUM(gross_amount) FILTER (WHERE status IN ('APPROVED', 'COMPLETE')) AS gross_revenue,
  SUM(net_amount)   FILTER (WHERE status IN ('APPROVED', 'COMPLETE')) AS net_revenue,

  -- Reembolsos e chargebacks (para controle)
  COUNT(*) FILTER (WHERE status IN ('REFUNDED', 'CHARGEBACK'))     AS total_refunds,
  SUM(gross_amount) FILTER (WHERE status IN ('REFUNDED', 'CHARGEBACK')) AS refunded_amount,

  -- Ticket médio
  CASE
    WHEN COUNT(*) FILTER (WHERE status IN ('APPROVED', 'COMPLETE')) > 0
    THEN SUM(gross_amount) FILTER (WHERE status IN ('APPROVED', 'COMPLETE'))
       / COUNT(*) FILTER (WHERE status IN ('APPROVED', 'COMPLETE'))
    ELSE 0
  END AS avg_ticket
FROM sales
GROUP BY
  client_id, product_id,
  DATE(sale_date AT TIME ZONE 'America/Sao_Paulo'),
  utm_source, utm_medium, utm_campaign;

-- ============================================================
-- VIEW: Resumo diário de investimento por cliente
-- Meta e Google separados + total consolidado
-- ============================================================
CREATE OR REPLACE VIEW v_ad_spend_daily AS
SELECT
  client_id,
  platform,
  campaign_id,
  campaign_name,
  adset_id,
  adset_name,
  spend_date,
  SUM(spend)       AS total_spend,
  SUM(impressions) AS total_impressions,
  SUM(clicks)      AS total_clicks,

  -- CPM e CPC calculados
  CASE WHEN SUM(impressions) > 0
    THEN (SUM(spend) / SUM(impressions)) * 1000
    ELSE 0
  END AS cpm,
  CASE WHEN SUM(clicks) > 0
    THEN SUM(spend) / SUM(clicks)
    ELSE 0
  END AS cpc
FROM ad_spend
GROUP BY
  client_id, platform, campaign_id, campaign_name,
  adset_id, adset_name, spend_date;

-- ============================================================
-- VIEW: Métricas consolidadas por dia (principal do dashboard)
-- Junta vendas + investimento = ROAS, lucro, etc.
-- ============================================================
CREATE OR REPLACE VIEW v_dashboard_daily AS
WITH daily_sales AS (
  SELECT
    client_id,
    sale_day        AS day,
    SUM(total_sales)     AS sales_count,
    SUM(gross_revenue)   AS gross_revenue,
    SUM(net_revenue)     AS net_revenue,
    SUM(total_refunds)   AS refunds_count,
    SUM(refunded_amount) AS refunded_amount,
    SUM(avg_ticket * total_sales) / NULLIF(SUM(total_sales), 0) AS avg_ticket
  FROM v_sales_daily
  GROUP BY client_id, sale_day
),
daily_spend AS (
  SELECT
    client_id,
    spend_date                                  AS day,
    SUM(total_spend)                            AS total_spend,
    SUM(total_spend) FILTER (WHERE platform = 'meta')   AS meta_spend,
    SUM(total_spend) FILTER (WHERE platform = 'google') AS google_spend,
    SUM(total_impressions)                      AS total_impressions,
    SUM(total_clicks)                           AS total_clicks
  FROM v_ad_spend_daily
  GROUP BY client_id, spend_date
)
SELECT
  COALESCE(s.client_id, a.client_id)   AS client_id,
  COALESCE(s.day, a.day)               AS day,

  -- Vendas
  COALESCE(s.sales_count, 0)           AS sales_count,
  COALESCE(s.gross_revenue, 0)         AS gross_revenue,
  COALESCE(s.net_revenue, 0)           AS net_revenue,
  COALESCE(s.refunds_count, 0)         AS refunds_count,
  COALESCE(s.refunded_amount, 0)       AS refunded_amount,
  COALESCE(s.avg_ticket, 0)            AS avg_ticket,

  -- Investimento
  COALESCE(a.total_spend, 0)           AS total_spend,
  COALESCE(a.meta_spend, 0)            AS meta_spend,
  COALESCE(a.google_spend, 0)          AS google_spend,
  COALESCE(a.total_impressions, 0)     AS total_impressions,
  COALESCE(a.total_clicks, 0)          AS total_clicks,

  -- ROAS = Faturamento Bruto / Investimento Total
  CASE WHEN COALESCE(a.total_spend, 0) > 0
    THEN COALESCE(s.gross_revenue, 0) / a.total_spend
    ELSE NULL
  END AS roas,

  -- Lucro líquido = Receita Líquida - Investimento
  COALESCE(s.net_revenue, 0) - COALESCE(a.total_spend, 0) AS net_profit,

  -- Margem = Lucro / Faturamento Bruto
  CASE WHEN COALESCE(s.gross_revenue, 0) > 0
    THEN (COALESCE(s.net_revenue, 0) - COALESCE(a.total_spend, 0))
       / s.gross_revenue * 100
    ELSE NULL
  END AS margin_pct

FROM daily_sales s
FULL OUTER JOIN daily_spend a
  ON s.client_id = a.client_id AND s.day = a.day;

-- ============================================================
-- VIEW: ROAS por campanha (para análise de performance)
-- ============================================================
CREATE OR REPLACE VIEW v_campaign_performance AS
WITH campaign_sales AS (
  SELECT
    client_id,
    utm_campaign,
    DATE(sale_date AT TIME ZONE 'America/Sao_Paulo') AS day,
    COUNT(*) FILTER (WHERE status IN ('APPROVED', 'COMPLETE')) AS sales_count,
    SUM(gross_amount) FILTER (WHERE status IN ('APPROVED', 'COMPLETE')) AS gross_revenue,
    SUM(net_amount)   FILTER (WHERE status IN ('APPROVED', 'COMPLETE')) AS net_revenue
  FROM sales
  GROUP BY client_id, utm_campaign, DATE(sale_date AT TIME ZONE 'America/Sao_Paulo')
),
campaign_spend AS (
  SELECT
    client_id,
    campaign_name,
    spend_date AS day,
    SUM(spend) AS total_spend,
    platform
  FROM ad_spend
  GROUP BY client_id, campaign_name, spend_date, platform
)
SELECT
  cs.client_id,
  cs.utm_campaign                     AS campaign,
  cs.day,
  COALESCE(cs.sales_count, 0)         AS sales_count,
  COALESCE(cs.gross_revenue, 0)       AS gross_revenue,
  COALESCE(cs.net_revenue, 0)         AS net_revenue,
  COALESCE(sp.total_spend, 0)         AS total_spend,
  sp.platform,
  CASE WHEN COALESCE(sp.total_spend, 0) > 0
    THEN COALESCE(cs.gross_revenue, 0) / sp.total_spend
    ELSE NULL
  END AS roas
FROM campaign_sales cs
LEFT JOIN campaign_spend sp
  ON cs.client_id = sp.client_id
 AND cs.utm_campaign = sp.campaign_name
 AND cs.day = sp.day;

-- ============================================================
-- FUNÇÃO: Métricas do período (para o seletor de datas do dash)
-- Uso: SELECT * FROM get_period_metrics('client-uuid', '2026-01-01', '2026-01-31')
-- ============================================================
CREATE OR REPLACE FUNCTION get_period_metrics(
  p_client_id  UUID,
  p_date_from  DATE,
  p_date_to    DATE
)
RETURNS TABLE (
  sales_count      BIGINT,
  gross_revenue    NUMERIC,
  net_revenue      NUMERIC,
  refunds_count    BIGINT,
  refunded_amount  NUMERIC,
  avg_ticket       NUMERIC,
  total_spend      NUMERIC,
  meta_spend       NUMERIC,
  google_spend     NUMERIC,
  roas             NUMERIC,
  net_profit       NUMERIC,
  margin_pct       NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    SUM(d.sales_count)::BIGINT,
    SUM(d.gross_revenue),
    SUM(d.net_revenue),
    SUM(d.refunds_count)::BIGINT,
    SUM(d.refunded_amount),
    CASE WHEN SUM(d.sales_count) > 0
      THEN SUM(d.gross_revenue) / SUM(d.sales_count)
      ELSE 0
    END,
    SUM(d.total_spend),
    SUM(d.meta_spend),
    SUM(d.google_spend),
    -- ROAS do período
    CASE WHEN SUM(d.total_spend) > 0
      THEN SUM(d.gross_revenue) / SUM(d.total_spend)
      ELSE NULL
    END,
    -- Lucro líquido do período
    SUM(d.net_revenue) - SUM(d.total_spend),
    -- Margem do período
    CASE WHEN SUM(d.gross_revenue) > 0
      THEN (SUM(d.net_revenue) - SUM(d.total_spend)) / SUM(d.gross_revenue) * 100
      ELSE NULL
    END
  FROM v_dashboard_daily d
  WHERE d.client_id = p_client_id
    AND d.day BETWEEN p_date_from AND p_date_to;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

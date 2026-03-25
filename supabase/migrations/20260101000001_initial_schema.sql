-- ============================================================
-- MIGRATION 001 - Schema Principal
-- Dashboard de Tráfego para Infoprodutos
-- ============================================================

-- Habilita extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CLIENTES
-- Cada cliente da agência é uma linha aqui
-- ============================================================
CREATE TABLE clients (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,  -- usado em URLs e identificação
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- USUÁRIOS POR CLIENTE (multi-tenant)
-- Liga usuários do Supabase Auth a clientes
-- ============================================================
CREATE TABLE client_users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, client_id)
);

-- ============================================================
-- PRODUTOS
-- Cada produto da Hotmart vinculado a um cliente
-- ============================================================
CREATE TABLE products (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  hotmart_product_id TEXT NOT NULL,
  name               TEXT NOT NULL,
  active             BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, hotmart_product_id)
);

CREATE INDEX idx_products_client_id ON products(client_id);
CREATE INDEX idx_products_hotmart_id ON products(hotmart_product_id);

-- ============================================================
-- VENDAS (Hotmart)
-- ÚNICO por transaction_id — resolve duplicatas
-- sale_date vem do payload Hotmart — resolve fora de ordem
-- ============================================================
CREATE TABLE sales (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  product_id     UUID REFERENCES products(id),

  -- Chave única da Hotmart — previne duplicatas no upsert
  transaction_id TEXT NOT NULL UNIQUE,

  -- Status da venda (vem diretamente da Hotmart)
  status         TEXT NOT NULL,  -- APPROVED, REFUNDED, CHARGEBACK, CANCELLED, COMPLETE

  -- Valores financeiros
  gross_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,  -- valor bruto
  net_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,  -- valor líquido (após taxas)
  currency       TEXT NOT NULL DEFAULT 'BRL',

  -- Informações do comprador
  buyer_email    TEXT,
  buyer_name     TEXT,
  payment_method TEXT,

  -- UTMs da venda (para atribuição)
  utm_source     TEXT,
  utm_medium     TEXT,
  utm_campaign   TEXT,
  utm_content    TEXT,
  utm_term       TEXT,

  -- IMPORTANTE: timestamp da venda na Hotmart, não da chegada do webhook
  -- Isso resolve o problema de dados chegando fora de ordem
  sale_date      TIMESTAMPTZ NOT NULL,

  -- Auditoria
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Payload completo para debug de discrepâncias
  raw_payload    JSONB
);

CREATE INDEX idx_sales_client_id ON sales(client_id);
CREATE INDEX idx_sales_product_id ON sales(product_id);
CREATE INDEX idx_sales_sale_date ON sales(sale_date);
CREATE INDEX idx_sales_status ON sales(status);
CREATE INDEX idx_sales_utm_campaign ON sales(utm_campaign);
CREATE INDEX idx_sales_transaction_id ON sales(transaction_id);

-- ============================================================
-- INVESTIMENTO EM ADS (Meta + Google)
-- ÚNICO por (client_id, platform, campaign_id, spend_date)
-- Upsert resolve duplicatas e atualizações retroativas
-- ============================================================
CREATE TABLE ad_spend (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  platform      TEXT NOT NULL CHECK (platform IN ('meta', 'google')),

  -- IDs das campanhas
  campaign_id   TEXT NOT NULL,
  campaign_name TEXT,
  adset_id      TEXT,
  adset_name    TEXT,
  ad_id         TEXT,
  ad_name       TEXT,

  -- Data do investimento (não da chegada do webhook)
  spend_date    DATE NOT NULL,

  -- Valores
  spend         NUMERIC(12,2) NOT NULL DEFAULT 0,
  impressions   INTEGER NOT NULL DEFAULT 0,
  clicks        INTEGER NOT NULL DEFAULT 0,

  -- Auditoria
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Payload completo para debug
  raw_payload   JSONB,

  -- Chave única: evita duplicatas por campanha/dia
  UNIQUE(client_id, platform, campaign_id, spend_date)
);

CREATE INDEX idx_ad_spend_client_id ON ad_spend(client_id);
CREATE INDEX idx_ad_spend_platform ON ad_spend(platform);
CREATE INDEX idx_ad_spend_spend_date ON ad_spend(spend_date);
CREATE INDEX idx_ad_spend_campaign_id ON ad_spend(campaign_id);

-- ============================================================
-- LOG DE WEBHOOKS
-- Registra TODOS os webhooks recebidos (auditoria completa)
-- Permite identificar exatamente onde está a discrepância
-- ============================================================
CREATE TABLE webhook_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source        TEXT NOT NULL CHECK (source IN ('hotmart', 'meta', 'google')),
  external_id   TEXT,   -- transaction_id ou campaign_id+date
  status        TEXT NOT NULL CHECK (status IN ('processed', 'updated', 'duplicate', 'error', 'ignored')),
  error_message TEXT,
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_logs_source ON webhook_logs(source);
CREATE INDEX idx_webhook_logs_status ON webhook_logs(status);
CREATE INDEX idx_webhook_logs_external_id ON webhook_logs(external_id);
CREATE INDEX idx_webhook_logs_created_at ON webhook_logs(created_at);

-- ============================================================
-- TRIGGER: atualiza updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sales_updated_at
  BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER ad_spend_updated_at
  BEFORE UPDATE ON ad_spend
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

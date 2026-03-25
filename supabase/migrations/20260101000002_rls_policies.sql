-- ============================================================
-- MIGRATION 002 - Row Level Security (RLS)
-- Segurança multi-tenant: cada usuário só vê dados do seu cliente
-- ============================================================

-- Habilita RLS em todas as tabelas de dados
ALTER TABLE clients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_spend     ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Função helper: retorna os client_ids do usuário autenticado
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_client_ids()
RETURNS UUID[] AS $$
  SELECT ARRAY(
    SELECT client_id FROM client_users
    WHERE user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- CLIENTS
-- ============================================================
CREATE POLICY "clients: usuário vê apenas seus clientes"
  ON clients FOR SELECT
  USING (id = ANY(get_user_client_ids()));

-- ============================================================
-- CLIENT_USERS
-- ============================================================
CREATE POLICY "client_users: usuário vê apenas seus vínculos"
  ON client_users FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE POLICY "products: usuário vê apenas produtos dos seus clientes"
  ON products FOR SELECT
  USING (client_id = ANY(get_user_client_ids()));

-- ============================================================
-- SALES
-- ============================================================
CREATE POLICY "sales: usuário vê apenas vendas dos seus clientes"
  ON sales FOR SELECT
  USING (client_id = ANY(get_user_client_ids()));

-- ============================================================
-- AD_SPEND
-- ============================================================
CREATE POLICY "ad_spend: usuário vê apenas investimentos dos seus clientes"
  ON ad_spend FOR SELECT
  USING (client_id = ANY(get_user_client_ids()));

-- ============================================================
-- WEBHOOK_LOGS
-- Admin pode ver os logs para auditoria de discrepâncias
-- ============================================================
CREATE POLICY "webhook_logs: admins veem logs dos seus clientes"
  ON webhook_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM client_users cu
      JOIN sales s ON s.client_id = cu.client_id
      WHERE cu.user_id = auth.uid()
        AND cu.role = 'admin'
        AND s.transaction_id = webhook_logs.external_id
    )
    OR
    EXISTS (
      SELECT 1 FROM client_users cu
      JOIN ad_spend a ON a.client_id = cu.client_id
      WHERE cu.user_id = auth.uid()
        AND cu.role = 'admin'
    )
  );

-- ============================================================
-- Service Role (Edge Functions) pode fazer tudo
-- As Edge Functions usam a service_role key que bypassa RLS
-- ============================================================

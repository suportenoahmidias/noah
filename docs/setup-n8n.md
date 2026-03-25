# Configuração do n8n — Pipeline de Dados

Este documento descreve como configurar os fluxos do n8n para enviar
dados corretamente para as Edge Functions do Supabase.

---

## URLs das Edge Functions

Após deploy no Supabase, as URLs seguem o padrão:

```
https://<PROJECT_REF>.supabase.co/functions/v1/webhook-hotmart
https://<PROJECT_REF>.supabase.co/functions/v1/webhook-meta
https://<PROJECT_REF>.supabase.co/functions/v1/webhook-google
```

---

## 1. Fluxo Hotmart → n8n → Supabase

### Configuração no n8n

1. **Trigger**: Webhook (recebe da Hotmart)
2. **Node HTTP Request**: POST para `webhook-hotmart`

**Headers obrigatórios:**
```
x-hotmart-hottok: <HOTMART_WEBHOOK_SECRET>
Content-Type: application/json
```

**Body**: repassar o payload da Hotmart diretamente (sem transformação).

A Edge Function extrai automaticamente:
- `data.purchase.transaction` → transaction_id (chave única, previne duplicatas)
- `data.purchase.approved_date` → sale_date (timestamp da Hotmart, resolve fora de ordem)
- `data.purchase.price.value` → gross_amount
- `data.purchase.price.base_value` → net_amount
- `data.purchase.utm.*` → UTMs de atribuição
- `data.product.id` → vincula ao produto cadastrado
- `data.buyer.email / name` → dados do comprador

### Cadastrar produtos no Supabase

Antes de receber webhooks, cada produto deve estar na tabela `products`:

```sql
INSERT INTO products (client_id, hotmart_product_id, name)
VALUES (
  'uuid-do-cliente',
  '123456',          -- ID do produto na Hotmart
  'Nome do Produto'
);
```

---

## 2. Fluxo Meta Ads → n8n → Supabase

### Configuração no n8n

O n8n precisa **transformar** os dados do Meta antes de enviar.
Configure um node **Set** ou **Code** para montar o payload:

**Payload (objeto único ou array):**
```json
{
  "client_id": "uuid-do-cliente",
  "date": "{{ $now.format('YYYY-MM-DD') }}",
  "campaign_id": "{{ $json.campaign_id }}",
  "campaign_name": "{{ $json.campaign_name }}",
  "adset_id": "{{ $json.adset_id }}",
  "adset_name": "{{ $json.adset_name }}",
  "spend": {{ $json.spend }},
  "impressions": {{ $json.impressions }},
  "clicks": {{ $json.clicks }}
}
```

**Headers obrigatórios:**
```
x-webhook-secret: <META_WEBHOOK_SECRET>
Content-Type: application/json
```

### Envio em lote (recomendado)

O n8n pode enviar um array com múltiplas campanhas de uma vez:
```json
[
  { "client_id": "...", "date": "2026-01-15", "campaign_id": "111", "spend": 100 },
  { "client_id": "...", "date": "2026-01-15", "campaign_id": "222", "spend": 200 }
]
```

### Quando reenviar dados (retroativo)

Se o Meta atualizar o gasto de dias anteriores (comum!), basta reenviar
o webhook com os valores corretos — o sistema fará um **upsert automático**
sem criar duplicatas.

---

## 3. Fluxo Google Ads → n8n → Supabase

Idêntico ao Meta. Payload:

```json
{
  "client_id": "uuid-do-cliente",
  "date": "2026-01-15",
  "campaign_id": "{{ $json.campaign.id }}",
  "campaign_name": "{{ $json.campaign.name }}",
  "adset_id": "{{ $json.adGroup.id }}",
  "adset_name": "{{ $json.adGroup.name }}",
  "spend": {{ $json.metrics.costMicros / 1000000 }},
  "impressions": {{ $json.metrics.impressions }},
  "clicks": {{ $json.metrics.clicks }}
}
```

**Atenção:** Google Ads retorna `costMicros` (micros), divida por `1.000.000`
para converter para reais/dólares antes de enviar.

**Headers:**
```
x-webhook-secret: <GOOGLE_WEBHOOK_SECRET>
Content-Type: application/json
```

---

## 4. Variáveis de Ambiente (Supabase Edge Functions)

Configure no painel do Supabase em **Settings > Edge Functions > Secrets**:

| Variável | Valor | Descrição |
|---|---|---|
| `HOTMART_WEBHOOK_SECRET` | `seu-token-hotmart` | Token `hottok` da Hotmart |
| `META_WEBHOOK_SECRET` | `senha-forte-aleatoria` | Secret compartilhado com n8n |
| `GOOGLE_WEBHOOK_SECRET` | `senha-forte-aleatoria` | Secret compartilhado com n8n |

---

## 5. Auditoria e Debug de Discrepâncias

Todos os webhooks recebidos são registrados em `webhook_logs`.

Para investigar uma discrepância:

```sql
-- Ver todos os webhooks de uma transação específica
SELECT * FROM webhook_logs
WHERE external_id = 'HP12345678901234'
ORDER BY created_at;

-- Ver erros recentes
SELECT * FROM webhook_logs
WHERE status = 'error'
ORDER BY created_at DESC
LIMIT 50;

-- Ver duplicatas bloqueadas
SELECT * FROM webhook_logs
WHERE status = 'duplicate'
  AND source = 'hotmart'
ORDER BY created_at DESC;
```

---

## 6. Consultas do Dashboard (Lovable)

### Métricas do período

```sql
SELECT * FROM get_period_metrics(
  'uuid-do-cliente',
  '2026-01-01',
  '2026-01-31'
);
```

### Série histórica (para gráficos)

```sql
SELECT * FROM v_dashboard_daily
WHERE client_id = 'uuid-do-cliente'
  AND day BETWEEN '2026-01-01' AND '2026-01-31'
ORDER BY day;
```

### Performance por campanha

```sql
SELECT * FROM v_campaign_performance
WHERE client_id = 'uuid-do-cliente'
  AND day BETWEEN '2026-01-01' AND '2026-01-31'
ORDER BY roas DESC NULLS LAST;
```

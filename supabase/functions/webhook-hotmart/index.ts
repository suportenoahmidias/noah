import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// Edge Function: webhook-hotmart
//
// Resolve os 3 problemas do pipeline original:
//  1. Duplicatas      → upsert por transaction_id (ON CONFLICT DO UPDATE)
//  2. Fora de ordem   → sale_date vem do payload da Hotmart
//  3. Discrepâncias   → log completo de cada evento recebido
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HOTMART_SECRET = Deno.env.get("HOTMART_WEBHOOK_SECRET");

// Status da Hotmart que representam receita real
const REVENUE_STATUSES = ["APPROVED", "COMPLETE"];
// Status que devemos processar (upsert)
const PROCESSABLE_STATUSES = [
  "APPROVED",
  "COMPLETE",
  "REFUNDED",
  "CHARGEBACK",
  "CANCELLED",
  "BILLET_PRINTED",
  "WAITING_PAYMENT",
];

serve(async (req: Request) => {
  // Apenas POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let payload: Record<string, unknown>;

  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Valida assinatura da Hotmart (opcional mas recomendado) ──
  if (HOTMART_SECRET) {
    const signature = req.headers.get("x-hotmart-hottok");
    if (signature !== HOTMART_SECRET) {
      await logWebhook(supabase, "hotmart", null, "error", payload,
        "Assinatura inválida (x-hotmart-hottok)");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // ── Extrai dados do payload da Hotmart ──
  const event = payload.event as string;
  const data = payload.data as Record<string, unknown>;

  if (!data || !event) {
    await logWebhook(supabase, "hotmart", null, "error", payload,
      "Payload sem campo 'event' ou 'data'");
    return new Response(JSON.stringify({ error: "Invalid payload structure" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const purchase = data.purchase as Record<string, unknown>;
  const product  = data.product  as Record<string, unknown>;
  const buyer    = data.buyer    as Record<string, unknown>;

  if (!purchase) {
    await logWebhook(supabase, "hotmart", null, "ignored", payload,
      `Evento ${event} sem dados de compra — ignorado`);
    return new Response(JSON.stringify({ status: "ignored", event }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const transactionId = purchase.transaction as string;
  const hotmartStatus = (purchase.status as string)?.toUpperCase();

  if (!transactionId) {
    await logWebhook(supabase, "hotmart", null, "error", payload,
      "transaction_id ausente no payload");
    return new Response(JSON.stringify({ error: "Missing transaction_id" }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Eventos que não precisamos processar
  if (!PROCESSABLE_STATUSES.includes(hotmartStatus)) {
    await logWebhook(supabase, "hotmart", transactionId, "ignored", payload,
      `Status '${hotmartStatus}' não processado`);
    return new Response(
      JSON.stringify({ status: "ignored", transaction_id: transactionId, hotmart_status: hotmartStatus }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Resolve client_id pelo product_id da Hotmart ──
  const hotmartProductId = String(product?.id ?? "");

  const { data: productRow, error: productError } = await supabase
    .from("products")
    .select("id, client_id")
    .eq("hotmart_product_id", hotmartProductId)
    .single();

  if (productError || !productRow) {
    await logWebhook(supabase, "hotmart", transactionId, "error", payload,
      `Produto Hotmart '${hotmartProductId}' não cadastrado no sistema`);
    return new Response(
      JSON.stringify({ error: "Product not found", hotmart_product_id: hotmartProductId }),
      { status: 422, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Extrai valores financeiros ──
  const priceObj   = purchase.price   as Record<string, unknown> | undefined;
  const grossAmount = Number(priceObj?.value      ?? 0);
  const netAmount   = Number(priceObj?.base_value ?? 0);
  const currency    = (priceObj?.currency_value as string) ?? "BRL";

  // ── Extrai UTMs ──
  const utmObj = purchase.utm as Record<string, unknown> | undefined;

  // ── Timestamp da venda na Hotmart (resolve fora de ordem) ──
  // approved_date é unix timestamp em ms
  const approvedTimestamp = purchase.approved_date as number | undefined;
  const orderDate         = purchase.order_date    as number | undefined;
  const rawTimestamp      = approvedTimestamp ?? orderDate;
  const saleDate          = rawTimestamp
    ? new Date(rawTimestamp).toISOString()
    : new Date().toISOString();

  // ── Upsert (resolve duplicatas e atualizações de status) ──
  const { error: upsertError } = await supabase
    .from("sales")
    .upsert(
      {
        client_id:      productRow.client_id,
        product_id:     productRow.id,
        transaction_id: transactionId,
        status:         hotmartStatus,
        gross_amount:   grossAmount,
        net_amount:     netAmount,
        currency:       currency,
        buyer_email:    buyer?.email as string | undefined,
        buyer_name:     buyer?.name  as string | undefined,
        payment_method: (purchase.payment as Record<string, unknown>)?.type as string | undefined,
        utm_source:     utmObj?.utm_source   as string | undefined,
        utm_medium:     utmObj?.utm_medium   as string | undefined,
        utm_campaign:   utmObj?.utm_campaign as string | undefined,
        utm_content:    utmObj?.utm_content  as string | undefined,
        utm_term:       utmObj?.utm_term     as string | undefined,
        sale_date:      saleDate,
        raw_payload:    payload,
      },
      {
        onConflict: "transaction_id",  // se já existe, atualiza (ex: APPROVED → REFUNDED)
        ignoreDuplicates: false,
      }
    );

  if (upsertError) {
    await logWebhook(supabase, "hotmart", transactionId, "error", payload,
      `Erro ao salvar: ${upsertError.message}`);
    return new Response(
      JSON.stringify({ error: "Database error", detail: upsertError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  await logWebhook(supabase, "hotmart", transactionId, "processed", payload);

  return new Response(
    JSON.stringify({ status: "processed", transaction_id: transactionId }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});

// ── Helper: registra todos os webhooks no log de auditoria ──
async function logWebhook(
  supabase: ReturnType<typeof createClient>,
  source: "hotmart" | "meta" | "google",
  externalId: string | null,
  status: "processed" | "updated" | "duplicate" | "error" | "ignored",
  payload: Record<string, unknown>,
  errorMessage?: string
) {
  await supabase.from("webhook_logs").insert({
    source,
    external_id:   externalId,
    status,
    error_message: errorMessage ?? null,
    payload,
  });
}

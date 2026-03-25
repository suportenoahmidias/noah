import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// Edge Function: webhook-google
//
// Recebe dados de investimento do Google Ads via n8n.
//
// Payload esperado (configurar no n8n para enviar neste formato):
// {
//   "client_id": "uuid-do-cliente",
//   "date": "2026-01-15",            ← data do investimento (YYYY-MM-DD)
//   "campaign_id": "1234567890",
//   "campaign_name": "Campanha Nome",
//   "adset_id": "0987654321",        ← opcional (Ad Group)
//   "adset_name": "Ad Group Nome",   ← opcional
//   "ad_id": "1122334455",           ← opcional
//   "ad_name": "Anúncio Nome",       ← opcional
//   "spend": 200.00,
//   "impressions": 8000,             ← opcional
//   "clicks": 350                    ← opcional
// }
//
// Funciona idêntico ao Meta — aceita array ou objeto único.
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_WEBHOOK_SECRET = Deno.env.get("GOOGLE_WEBHOOK_SECRET");

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (GOOGLE_WEBHOOK_SECRET) {
    const secret = req.headers.get("x-webhook-secret");
    if (secret !== GOOGLE_WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const items = Array.isArray(body) ? body : [body];
  const results = { processed: 0, errors: 0, details: [] as string[] };

  for (const item of items) {
    const row = item as Record<string, unknown>;

    const clientId    = row.client_id    as string | undefined;
    const date        = row.date         as string | undefined;
    const campaignId  = row.campaign_id  as string | undefined;
    const campaignName= row.campaign_name as string | undefined;
    const spend       = Number(row.spend ?? 0);

    if (!clientId || !date || !campaignId) {
      results.errors++;
      results.details.push("Linha inválida: campos obrigatórios ausentes (client_id, date, campaign_id)");

      await supabase.from("webhook_logs").insert({
        source: "google",
        external_id: campaignId ?? null,
        status: "error",
        error_message: "Campos obrigatórios ausentes: client_id, date, campaign_id",
        payload: row,
      });
      continue;
    }

    const externalId = `google|${campaignId}|${date}`;

    const { error } = await supabase
      .from("ad_spend")
      .upsert(
        {
          client_id:     clientId,
          platform:      "google",
          campaign_id:   campaignId,
          campaign_name: campaignName ?? null,
          adset_id:      row.adset_id   as string | undefined ?? null,
          adset_name:    row.adset_name as string | undefined ?? null,
          ad_id:         row.ad_id      as string | undefined ?? null,
          ad_name:       row.ad_name    as string | undefined ?? null,
          spend_date:    date,
          spend:         spend,
          impressions:   Number(row.impressions ?? 0),
          clicks:        Number(row.clicks ?? 0),
          raw_payload:   row,
        },
        {
          onConflict: "client_id,platform,campaign_id,spend_date",
          ignoreDuplicates: false,
        }
      );

    if (error) {
      results.errors++;
      results.details.push(`Erro ao salvar ${externalId}: ${error.message}`);

      await supabase.from("webhook_logs").insert({
        source: "google",
        external_id: externalId,
        status: "error",
        error_message: error.message,
        payload: row,
      });
    } else {
      results.processed++;

      await supabase.from("webhook_logs").insert({
        source: "google",
        external_id: externalId,
        status: "processed",
        payload: row,
      });
    }
  }

  return new Response(
    JSON.stringify({
      status: results.errors === 0 ? "ok" : "partial",
      processed: results.processed,
      errors: results.errors,
      ...(results.details.length > 0 && { details: results.details }),
    }),
    { status: results.errors === items.length ? 422 : 200,
      headers: { "Content-Type": "application/json" } }
  );
});

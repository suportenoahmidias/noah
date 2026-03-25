import { formatCurrency, formatRoas, formatNumber } from "@/lib/utils";
import type { CampaignPerformance } from "@/types";

interface AggregatedCampaign extends CampaignPerformance {
  days: number;
}

interface Props {
  campaigns: AggregatedCampaign[];
  loading?: boolean;
}

function RoasBadge({ roas }: { roas: number | null }) {
  if (roas === null) return <span className="text-gray-400">—</span>;
  const color =
    roas >= 3   ? "bg-emerald-100 text-emerald-700" :
    roas >= 1.5 ? "bg-yellow-100 text-yellow-700"   :
                  "bg-red-100 text-red-600";
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {formatRoas(roas)}
    </span>
  );
}

function PlatformBadge({ platform }: { platform: string | null }) {
  if (!platform) return <span className="text-gray-400 text-xs">—</span>;
  const isMeta = platform === "meta";
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium
      ${isMeta ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-600"}`}>
      {isMeta ? "Meta" : "Google"}
    </span>
  );
}

export default function CampaignTable({ campaigns, loading }: Props) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="h-4 w-48 bg-gray-200 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700">
          Performance por Campanha
        </h3>
      </div>

      {campaigns.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-400">
          Nenhuma campanha encontrada no período
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {["Campanha", "Plataforma", "Vendas", "Faturamento Bruto", "Investimento", "ROAS"].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c, i) => (
                <tr
                  key={i}
                  className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
                >
                  <td className="px-5 py-3.5 font-medium text-gray-900 max-w-xs truncate">
                    {c.campaign ?? <span className="text-gray-400 italic">Sem UTM</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <PlatformBadge platform={c.platform} />
                  </td>
                  <td className="px-5 py-3.5 text-gray-700">
                    {formatNumber(c.sales_count)}
                  </td>
                  <td className="px-5 py-3.5 font-medium text-gray-900">
                    {formatCurrency(c.gross_revenue)}
                  </td>
                  <td className="px-5 py-3.5 text-gray-700">
                    {formatCurrency(c.total_spend)}
                  </td>
                  <td className="px-5 py-3.5">
                    <RoasBadge roas={c.roas} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

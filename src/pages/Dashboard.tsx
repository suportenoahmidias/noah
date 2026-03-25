import {
  DollarSign, TrendingUp, Target, BarChart2,
  ShoppingCart, Percent, LogOut, ChevronDown,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useDateRange } from "@/hooks/useDateRange";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { useDailyData, useCampaignPerformance } from "@/hooks/useDailyData";
import KpiCard from "@/components/KpiCard";
import RevenueChart from "@/components/RevenueChart";
import InvestmentChart from "@/components/InvestmentChart";
import CampaignTable from "@/components/CampaignTable";
import DateRangePicker from "@/components/DateRangePicker";
import { formatCurrency, formatNumber, formatRoas } from "@/lib/utils";
import { useState } from "react";

export default function Dashboard() {
  const { user, clients, activeClient, setActiveClient, signOut } = useAuth();
  const [clientMenuOpen, setClientMenuOpen] = useState(false);

  const {
    range, selectPreset, selectCustom,
    fromStr, toStr, prevFromStr, prevToStr,
  } = useDateRange("last30");

  const { current, deltas, loading: metricsLoading } = useDashboardMetrics({
    clientId: activeClient?.id ?? null,
    fromStr, toStr, prevFromStr, prevToStr,
  });

  const { chartData, loading: chartLoading } = useDailyData(
    activeClient?.id ?? null, fromStr, toStr
  );

  const { campaignList, loading: campaignLoading } = useCampaignPerformance(
    activeClient?.id ?? null, fromStr, toStr
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Topbar ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Logo + seletor de cliente */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-gray-900 hidden sm:block">Dashboard</span>
            </div>

            {clients.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setClientMenuOpen(!clientMenuOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100
                             hover:bg-gray-200 transition-colors text-sm font-medium text-gray-700"
                >
                  {activeClient?.name}
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>
                {clientMenuOpen && (
                  <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-gray-200
                                  rounded-xl shadow-lg z-50 overflow-hidden">
                    {clients.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setActiveClient(c); setClientMenuOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors
                          ${c.id === activeClient?.id
                            ? "bg-brand-50 text-brand-700 font-medium"
                            : "text-gray-700 hover:bg-gray-50"}`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {clients.length === 1 && (
              <span className="text-sm font-medium text-gray-500 hidden sm:block">
                {activeClient?.name}
              </span>
            )}
          </div>

          {/* Direita: seletor de período + usuário */}
          <div className="flex items-center gap-3">
            <DateRangePicker
              range={range}
              onSelectPreset={selectPreset}
              onSelectCustom={selectCustom}
            />

            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-gray-200">
              <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center">
                <span className="text-xs font-bold text-brand-700">
                  {user?.email?.[0]?.toUpperCase()}
                </span>
              </div>
              <button
                onClick={signOut}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg
                           hover:bg-gray-100 transition-colors"
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Conteúdo ── */}
      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── KPIs principais ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          <KpiCard
            title="Faturamento Bruto"
            value={formatCurrency(current.gross_revenue)}
            delta={deltas.gross_revenue}
            icon={DollarSign}
            iconColor="text-brand-500"
            loading={metricsLoading}
          />
          <KpiCard
            title="Faturamento Líquido"
            value={formatCurrency(current.net_revenue)}
            delta={deltas.net_revenue}
            icon={DollarSign}
            iconColor="text-emerald-500"
            loading={metricsLoading}
          />
          <KpiCard
            title="Número de Vendas"
            value={formatNumber(current.sales_count)}
            delta={deltas.sales_count}
            icon={ShoppingCart}
            iconColor="text-purple-500"
            loading={metricsLoading}
          />
          <KpiCard
            title="Ticket Médio"
            value={formatCurrency(current.avg_ticket)}
            delta={deltas.avg_ticket}
            icon={BarChart2}
            iconColor="text-orange-500"
            loading={metricsLoading}
          />
        </div>

        {/* ── KPIs de investimento ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          <KpiCard
            title="Investimento Meta"
            value={formatCurrency(current.meta_spend)}
            delta={deltas.meta_spend}
            icon={Target}
            iconColor="text-[#1877F2]"
            loading={metricsLoading}
          />
          <KpiCard
            title="Investimento Google"
            value={formatCurrency(current.google_spend)}
            delta={deltas.google_spend}
            icon={Target}
            iconColor="text-[#EA4335]"
            loading={metricsLoading}
          />
          <KpiCard
            title="Investimento Total"
            value={formatCurrency(current.total_spend)}
            delta={deltas.total_spend}
            icon={TrendingUp}
            iconColor="text-gray-500"
            loading={metricsLoading}
          />
          <KpiCard
            title="ROAS Total"
            value={formatRoas(current.roas)}
            delta={deltas.roas}
            icon={Percent}
            iconColor="text-amber-500"
            loading={metricsLoading}
            subtitle={
              current.net_profit !== 0
                ? `Lucro líq.: ${formatCurrency(current.net_profit)}`
                : undefined
            }
          />
        </div>

        {/* ── Gráfico de faturamento ── */}
        <RevenueChart data={chartData} loading={chartLoading} />

        {/* ── Gráficos de investimento ── */}
        <InvestmentChart data={chartData} loading={chartLoading} />

        {/* ── Tabela de campanhas ── */}
        <CampaignTable campaigns={campaignList} loading={campaignLoading} />

        {/* ── Rodapé ── */}
        <div className="text-center text-xs text-gray-400 pb-4">
          Dados atualizados via webhook em tempo real
        </div>
      </main>
    </div>
  );
}

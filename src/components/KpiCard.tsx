import { TrendingUp, TrendingDown, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string;
  delta?: number | null;   // variação % vs período anterior
  icon: LucideIcon;
  iconColor?: string;
  loading?: boolean;
  subtitle?: string;
}

export default function KpiCard({
  title,
  value,
  delta,
  icon: Icon,
  iconColor = "text-brand-500",
  loading = false,
  subtitle,
}: KpiCardProps) {
  const hasDelta = delta !== null && delta !== undefined;
  const positive = hasDelta && delta! >= 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
      {/* Topo */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-500">{title}</span>
        <div className={cn("p-2 rounded-lg bg-gray-50", iconColor)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>

      {/* Valor principal */}
      {loading ? (
        <div className="space-y-2">
          <div className="h-7 w-32 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
        </div>
      ) : (
        <>
          <p className="text-2xl font-bold text-gray-900 tracking-tight">{value}</p>

          {/* Comparativo vs período anterior */}
          {hasDelta ? (
            <div className={cn(
              "mt-1.5 flex items-center gap-1 text-xs font-medium",
              positive ? "text-emerald-600" : "text-red-500"
            )}>
              {positive
                ? <TrendingUp className="w-3.5 h-3.5" />
                : <TrendingDown className="w-3.5 h-3.5" />}
              {positive ? "+" : ""}{delta!.toFixed(1)}% vs período anterior
            </div>
          ) : hasDelta === false && delta === null ? (
            <div className="mt-1.5 flex items-center gap-1 text-xs text-gray-400">
              <Minus className="w-3.5 h-3.5" />
              Sem dados anteriores
            </div>
          ) : null}

          {subtitle && (
            <p className="mt-1 text-xs text-gray-400">{subtitle}</p>
          )}
        </>
      )}
    </div>
  );
}

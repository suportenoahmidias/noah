import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronDown } from "lucide-react";
import type { PresetPeriod, DateRange } from "@/types";

const PRESETS: { value: PresetPeriod; label: string }[] = [
  { value: "today",      label: "Hoje" },
  { value: "yesterday",  label: "Ontem" },
  { value: "last7",      label: "Últimos 7 dias" },
  { value: "last14",     label: "Últimos 14 dias" },
  { value: "last30",     label: "Últimos 30 dias" },
  { value: "this_month", label: "Este mês" },
  { value: "last_month", label: "Mês passado" },
];

interface Props {
  range: DateRange;
  onSelectPreset: (preset: PresetPeriod) => void;
  onSelectCustom: (from: Date, to: Date) => void;
}

export default function DateRangePicker({ range, onSelectPreset, onSelectCustom }: Props) {
  const [open, setOpen]           = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]     = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function applyCustom() {
    if (customFrom && customTo) {
      onSelectCustom(new Date(customFrom + "T00:00:00"), new Date(customTo + "T23:59:59"));
      setOpen(false);
    }
  }

  const presetLabel =
    PRESETS.find((p) => p.value === range.preset)?.label ??
    `${format(range.from, "dd/MM/yy", { locale: ptBR })} – ${format(range.to, "dd/MM/yy", { locale: ptBR })}`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg
                   text-sm font-medium text-gray-700 hover:border-brand-500 transition-colors
                   shadow-sm"
      >
        <CalendarDays className="w-4 h-4 text-gray-500" />
        {presetLabel}
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200
                        rounded-xl shadow-lg z-50 overflow-hidden">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => { onSelectPreset(p.value); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors
                ${range.preset === p.value
                  ? "bg-brand-50 text-brand-700 font-medium"
                  : "text-gray-700 hover:bg-gray-50"}`}
            >
              {p.label}
            </button>
          ))}

          {/* Divisor para período customizado */}
          <div className="border-t border-gray-100 px-4 py-3 space-y-2">
            <p className="text-xs font-medium text-gray-500">Período personalizado</p>
            <div className="flex gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="flex-1 text-xs border border-gray-200 rounded-md px-2 py-1.5
                           focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="flex-1 text-xs border border-gray-200 rounded-md px-2 py-1.5
                           focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <button
              onClick={applyCustom}
              disabled={!customFrom || !customTo}
              className="w-full py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-40
                         text-white text-xs font-medium rounded-md transition-colors"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

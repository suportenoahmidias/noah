import { useState } from "react";
import {
  startOfDay, endOfDay, subDays,
  startOfMonth, endOfMonth, subMonths,
  format,
} from "date-fns";
import type { DateRange, PresetPeriod } from "@/types";

function buildRange(preset: PresetPeriod, customFrom?: Date, customTo?: Date): DateRange {
  const today = new Date();

  switch (preset) {
    case "today":
      return { from: startOfDay(today), to: endOfDay(today), preset };
    case "yesterday": {
      const y = subDays(today, 1);
      return { from: startOfDay(y), to: endOfDay(y), preset };
    }
    case "last7":
      return { from: startOfDay(subDays(today, 6)), to: endOfDay(today), preset };
    case "last14":
      return { from: startOfDay(subDays(today, 13)), to: endOfDay(today), preset };
    case "last30":
      return { from: startOfDay(subDays(today, 29)), to: endOfDay(today), preset };
    case "this_month":
      return { from: startOfMonth(today), to: endOfDay(today), preset };
    case "last_month": {
      const lm = subMonths(today, 1);
      return { from: startOfMonth(lm), to: endOfMonth(lm), preset };
    }
    case "custom":
      return {
        from: startOfDay(customFrom ?? subDays(today, 29)),
        to: endOfDay(customTo ?? today),
        preset,
      };
  }
}

export function useDateRange(initial: PresetPeriod = "last30") {
  const [range, setRange] = useState<DateRange>(() => buildRange(initial));

  function selectPreset(preset: PresetPeriod) {
    setRange(buildRange(preset));
  }

  function selectCustom(from: Date, to: Date) {
    setRange(buildRange("custom", from, to));
  }

  // Período anterior com a mesma duração (para comparativo)
  const durationMs = range.to.getTime() - range.from.getTime();
  const prevTo     = new Date(range.from.getTime() - 1);
  const prevFrom   = new Date(prevTo.getTime() - durationMs);

  return {
    range,
    prevRange: { from: prevFrom, to: prevTo },
    selectPreset,
    selectCustom,
    fromStr: format(range.from, "yyyy-MM-dd"),
    toStr:   format(range.to,   "yyyy-MM-dd"),
    prevFromStr: format(prevFrom, "yyyy-MM-dd"),
    prevToStr:   format(prevTo,   "yyyy-MM-dd"),
  };
}

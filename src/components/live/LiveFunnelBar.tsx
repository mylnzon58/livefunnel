"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { EVENT_CONFIG, type FunnelEvent } from "./worldData";
import { EventIcon } from "./EventIcon";
import { ChevronRight, TrendingDown, DollarSign, Users } from "lucide-react";
import { calculateFunnel } from "./liveUtils";

// Embudo estándar de conversión CRO
const FUNNEL_STAGES = [
  { key: "landing",        label: "Landing",          icon: "Eye" },
  { key: "simulation",     label: "Interacción Inicial", icon: "Activity" },
  { key: "checkout",       label: "Paso de Pago",      icon: "ShoppingCart" },
  { key: "payment_intent", label: "Click Pagar",      icon: "CreditCard" },
  { key: "purchase",       label: "Compra Confirmada",icon: "PartyPopper" },
  { key: "dashboard",      label: "Entró al Panel",   icon: "LayoutDashboard" },
] as const;

interface LiveFunnelBarProps {
  events: FunnelEvent[];
  realPurchaseCount?: number;
  totalRevenue?: number;
  timeframe?: string;
  serverFunnel?: { name: string, value: number }[];
}

export function LiveFunnelBar({
  events,
  realPurchaseCount = 0,
  totalRevenue = 0,
  timeframe = "5m",
  serverFunnel = []
}: LiveFunnelBarProps) {
  const funnelData = useMemo(() => {
    // If we have server data, use it (it's always more accurate as it considers more events than the limited feed)
    if (serverFunnel && serverFunnel.length > 0) return serverFunnel;
    // Fallback to client-side for initial load or if server data is empty
    return calculateFunnel(events);
  }, [events, serverFunnel, timeframe]);
  
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    funnelData.forEach(item => {
      const stageKey = FUNNEL_STAGES.find(s => s.label === item.name)?.key || item.name.toLowerCase();
      map[stageKey] = item.value;
    });
    // Purchase: max between tracked unique events and actual backend payments
    map.purchase = Math.max(map.purchase || 0, realPurchaseCount);
    return map;
  }, [funnelData, realPurchaseCount]);

  const abandoned = useMemo(() => {
    const ips = new Set(events.filter(e => e.event_type === "abandon").map(e => e.metadata?.ip_detected || "unknown"));
    return ips.size;
  }, [events]);

  const maxCount = Math.max(1, ...Object.values(counts));

  const timeframeLabel = useMemo(() => {
    switch(timeframe) {
      case "1m": return "Último Minuto";
      case "5m": return "Últimos 5 Minutos";
      case "15m": return "Últimos 15 Minutos";
      case "1h": return "Última Hora";
      case "7d": return "Última Semana";
      case "30d": return "Último Mes";
      case "365d": return "Último Año";
      case "custom": return "Rango Personalizado";
      default: return "Últimas 24h";
    }
  }, [timeframe]);

  return (
    <div className="rounded border border-border bg-card p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <span className="text-base">📊</span> Embudo (Usuarios Únicos)
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
            <DollarSign className="h-3 w-3 text-success" />
            <span className="text-[10px] font-black text-success">
              ${totalRevenue.toFixed(2)}
            </span>
          </div>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
            {timeframeLabel}
          </span>
        </div>
      </div>

      {/* Funnel — 6 stages */}
      <div className="flex items-stretch gap-1 sm:gap-2 overflow-x-auto pb-2 custom-scrollbar">
        {FUNNEL_STAGES.map((stage, idx) => {
          const count = counts[stage.key] || 0;
          const cfg = EVENT_CONFIG[stage.key];
          const color = cfg?.color || "#94A3B8";
          const prevCount = idx > 0 ? counts[FUNNEL_STAGES[idx - 1].key] || 0 : 0;
          const convRate = idx > 0 && prevCount > 0 ? Math.round((count / prevCount) * 100) : null;
          const barWidth = maxCount > 0 ? Math.max(8, (count / maxCount) * 100) : 8;

          return (
            <div key={stage.key} className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
              {/* Stage card */}
              <div className="flex-1 flex flex-col items-center text-center group">
                {/* Emoji + Counter */}
                <span className="text-sm sm:text-lg mb-1"><EventIcon name={stage.icon} className="w-5 h-5" /></span>
                <motion.span
                  className="text-xl sm:text-2xl font-black text-foreground"
                  key={count}
                  initial={{ scale: 1.4, color }}
                  animate={{ scale: 1, color: "hsl(var(--foreground))" }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  {count}
                </motion.span>

                {/* Progress bar */}
                <div className="w-full mt-2 rounded-full bg-muted overflow-hidden h-1.5">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${barWidth}%` }}
                    transition={{ duration: 0.8, ease: "easeOut", delay: idx * 0.1 }}
                  />
                </div>

                {/* Label */}
                <span className="text-[8px] sm:text-[10px] font-bold text-muted-foreground mt-2 truncate w-full">
                  {stage.label}
                </span>

                {/* Pulsing indicator */}
                <div className="relative flex h-1.5 w-1.5 mt-1">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-1.5 w-1.5"
                    style={{ backgroundColor: color }}
                  />
                </div>
              </div>

              {/* Arrow with conversion rate */}
              {idx < FUNNEL_STAGES.length - 1 && (
                <div className="flex flex-col items-center justify-center gap-0.5 flex-shrink-0 pt-6">
                  <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
                  {convRate !== null && (
                    <span
                      className="text-[8px] sm:text-[9px] font-black leading-none"
                      style={{
                        color:
                          convRate >= 50 ? "#34D399" : convRate >= 20 ? "#FBBF24" : "#F87171",
                      }}
                    >
                      {convRate > 999 ? '>999' : convRate}%
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Abandoned count */}
      {abandoned > 0 && (
        <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-center gap-2">
          <TrendingDown className="h-3.5 w-3.5 text-destructive" />
          <span className="text-xs font-bold text-destructive">
            {abandoned} abandonos detectados
          </span>
          <span className="text-[10px] text-muted-foreground/60 font-medium">
            (Impacto negativo en conversión)
          </span>
        </div>
      )}
    </div>
  );
}

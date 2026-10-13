"use client";

import { useMemo } from "react";
import { EVENT_CONFIG } from "./worldData";

interface TrendPoint {
  time: string;
  landing: number;
  simulation: number;
  register: number;
  checkout: number;
  payment_intent: number;
  click_paypal: number;
  click_card: number;
  purchase: number;
}

interface LiveTrendChartProps {
  data: TrendPoint[];
  timeframe?: string;
}

/**
 * Gráfico de tendencia ultra-liviano usando SVG nativo.
 * Muestra la actividad del funnel en el rango seleccionado
 * (horario para < 48h, diario para 7d / 30d / 365d / custom).
 * Sin dependencias externas, alto rendimiento.
 */
export function LiveTrendChart({ data, timeframe = "24h" }: LiveTrendChartProps) {
  const maxVal = useMemo(() => {
    let max = 1;
    data.forEach(d => {
      max = Math.max(max, d.landing, d.simulation, d.register, d.checkout, d.payment_intent, d.click_paypal, d.click_card, d.purchase);
    });
    return max * 1.1; 
  }, [data]);

  const rangeInfo = useMemo((): { title: string; start: string; end?: string } => {
    const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
    switch (timeframe) {
      case "1m": return { title: "Último Minuto", start: "Hace 1 min" };
      case "5m": return { title: "Últimos 5 Minutos", start: "Hace 5 min" };
      case "15m": return { title: "Últimos 15 Minutos", start: "Hace 15 min" };
      case "1h": return { title: "Última Hora", start: "Hace 1 hora" };
      case "12h": return { title: "Últimas 12 Horas", start: "Hace 12 horas" };
      case "7d": return { title: "Última Semana", start: "Hace 7 días" };
      case "30d": return { title: "Último Mes", start: "Hace 30 días" };
      case "365d": return { title: "Último Año", start: "Hace 1 año" };
      case "custom": return {
        title: "Rango Personalizado",
        start: data.length ? fmtDay(data[0].time) : "Inicio",
        end: data.length ? fmtDay(data[data.length - 1].time) : "Fin",
      };
      default: return { title: "Últimas 24 Horas", start: "Hace 24 horas" };
    }
  }, [timeframe, data]);

  const width = 800;
  const height = 120;
  const padding = 10;

  const points = useMemo(() => {
    const defaultRes = { 
      landing: "", simulation: "", register: "", checkout: "", 
      payment_intent: "", click_paypal: "", click_card: "", purchase: "", 
      landingArea: "", simulationArea: "", registerArea: "", checkoutArea: "", 
      payment_intentArea: "", click_paypalArea: "", click_cardArea: "", purchaseArea: "" 
    };
    if (data.length === 0) return defaultRes;
    
    const step = (width - padding * 2) / (data.length - 1);
    
    const getPath = (key: keyof Omit<TrendPoint, "time">) => {
      return data.map((d, i) => {
        const x = padding + i * step;
        const y = height - padding - (d[key] / maxVal) * (height - padding * 2);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      }).join(" ");
    };

    const getAreaPath = (key: keyof Omit<TrendPoint, "time">) => {
      const line = getPath(key);
      if (!line) return "";
      const lastX = padding + (data.length - 1) * step;
      return `${line} L ${lastX} ${height - padding} L ${padding} ${height - padding} Z`;
    };

    return {
      landing: getPath("landing"),
      landingArea: getAreaPath("landing"),
      simulation: getPath("simulation"),
      simulationArea: getAreaPath("simulation"),
      register: getPath("register"),
      registerArea: getAreaPath("register"),
      checkout: getPath("checkout"),
      checkoutArea: getAreaPath("checkout"),
      payment_intent: getPath("payment_intent"),
      payment_intentArea: getAreaPath("payment_intent"),
      click_paypal: getPath("click_paypal"),
      click_paypalArea: getAreaPath("click_paypal"),
      click_card: getPath("click_card"),
      click_cardArea: getAreaPath("click_card"),
      purchase: getPath("purchase"),
      purchaseArea: getAreaPath("purchase"),
    };
  }, [data, maxVal]);

  return (
    <div className="rounded border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 mb-4">
        <div className="min-w-[140px]">
          <h3 className="text-sm font-bold text-foreground">Tendencia de Actividad</h3>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider leading-none mt-0.5">{rangeInfo.title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {["landing", "simulation", "register", "checkout", "terms_accepted", "click_paypal", "click_card", "purchase"].map(key => (
            <div key={key} className="flex items-center gap-1.5 whitespace-nowrap">
              <div className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: EVENT_CONFIG[key]?.color || "#94A3B8" }} />
              <span className="text-[10px] font-black text-muted-foreground uppercase leading-none">
                {EVENT_CONFIG[key]?.label?.split(' (')[0] || key.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative w-full aspect-[8/1.5] min-h-[100px]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
          <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="currentColor" strokeOpacity="0.05" strokeWidth="1" strokeDasharray="4 4" />

          {/* Areas */}
          <path d={points.landingArea} fill={EVENT_CONFIG.landing?.color || "#3B82F6"} fillOpacity="0.03" />
          <path d={points.simulationArea} fill={EVENT_CONFIG.simulation?.color || "#8B5CF6"} fillOpacity="0.03" />
          <path d={points.registerArea} fill={EVENT_CONFIG.register?.color || "#EC4899"} fillOpacity="0.03" />
          <path d={points.checkoutArea} fill={EVENT_CONFIG.checkout?.color || "#F59E0B"} fillOpacity="0.03" />
          <path d={points.payment_intentArea} fill={EVENT_CONFIG.payment_intent?.color || "#F97316"} fillOpacity="0.03" />
          <path d={points.click_paypalArea} fill={EVENT_CONFIG.click_paypal?.color || "#FACC15"} fillOpacity="0.05" />
          <path d={points.click_cardArea} fill={EVENT_CONFIG.click_card?.color || "#1F2937"} fillOpacity="0.05" />
          <path d={points.purchaseArea} fill={EVENT_CONFIG.purchase?.color || "#10B981"} fillOpacity="0.03" />

          {/* Lines */}
          <path d={points.landing} fill="none" stroke={EVENT_CONFIG.landing?.color || "#3B82F6"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d={points.simulation} fill="none" stroke={EVENT_CONFIG.simulation?.color || "#8B5CF6"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
          <path d={points.register} fill="none" stroke={EVENT_CONFIG.register?.color || "#EC4899"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
          <path d={points.checkout} fill="none" stroke={EVENT_CONFIG.checkout?.color || "#F59E0B"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d={points.payment_intent} fill="none" stroke={EVENT_CONFIG.payment_intent?.color || "#F97316"} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.3" strokeDasharray="2 2" />
          <path d={points.click_paypal} fill="none" stroke={EVENT_CONFIG.click_paypal?.color || "#FACC15"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d={points.click_card} fill="none" stroke={EVENT_CONFIG.click_card?.color || "#1F2937"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d={points.purchase} fill="none" stroke={EVENT_CONFIG.purchase?.color || "#10B981"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* Hover overlay or tooltip could go here, but keeping it simple for now */}
      </div>

      <div className="mt-2 flex justify-between text-[8px] font-bold text-muted-foreground/50 uppercase tracking-tighter">
        {timeframe === "24h" ? (
          <>
            <span>Hace 24h</span>
            <span>Ayer</span>
            <span>Anoche</span>
            <span>Hoy</span>
            <span>Ahora</span>
          </>
        ) : (
          <>
            <span>{rangeInfo.start}</span>
            <span>{rangeInfo.end || "Ahora"}</span>
          </>
        )}
      </div>
    </div>
  );
}

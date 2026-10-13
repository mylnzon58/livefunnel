"use client";

import { memo, useState, useEffect, useCallback, useRef } from "react";
import { LiveWorldMap } from "./live/LiveWorldMap";
import { LiveEventFeed } from "./live/LiveEventFeed";
import { LiveFunnelBar } from "./live/LiveFunnelBar";
import { LiveTrendChart } from "./live/LiveTrendChart";
import { LiveTopStats } from "./live/LiveTopStats";
import { LiveStorageMeter } from "./live/LiveStorageMeter";
import { EVENT_CONFIG, type FunnelEvent } from "./live/worldData";
import { EventIcon } from "./live/EventIcon";
import { type HourlyPoint } from "./live/liveUtils";
import { Radio, RefreshCw, Trash2, Download, FileJson, FileSpreadsheet, Clock, CalendarDays, Loader2 } from "lucide-react";
import { formatArgTime } from "@/lib/dateUtils";

// Memoize sub-components for performance
const MemoizedWorldMap = memo(LiveWorldMap);
const MemoizedEventFeed = memo(LiveEventFeed);
const MemoizedFunnelBar = memo(LiveFunnelBar);
const MemoizedTrendChart = memo(LiveTrendChart);
const MemoizedTopStats = memo(LiveTopStats);

// SKILL.md Rule 43.13: Polling mínimo 60s para proteger Vercel Fluid CPU (Serverless) y Disk IO Budget
const POLL_INTERVAL = 60000;

// ── Client-side cache (SWR-style): timeframes ya vistos renderizan al instante ──
// Red TTL corto y conservador: 15s de staleness máximo al cambiar de rango.
const DATA_CACHE_TTL_MS = 15_000;

interface LivePayload {
  events: FunnelEvent[];
  realPurchaseCount: number;
  totalRevenue: number;
  trendData: HourlyPoint[];
  totalTableRows: number;
  funnelMetrics: { name: string; value: number }[];
  userIntensity: { ip: string; count: number }[];
  serverTopRegions: { name: string; count: number }[];
}

const dataCache = new Map<string, { data: LivePayload; ts: number }>();

interface LiveActivityClientProps {
  initialEvents: FunnelEvent[];
  initialRealPurchaseCount?: number;
  initialTotalRevenue24h?: number;
  initialTrendData?: HourlyPoint[];
  mapboxToken: string;
  mapboxStyle: string;
}

export function LiveActivityClient({
  initialEvents,
  initialRealPurchaseCount = 0,
  initialTotalRevenue24h = 0,
  initialTrendData = [],
  mapboxToken,
  mapboxStyle,
}: LiveActivityClientProps) {
  const [events, setEvents] = useState<FunnelEvent[]>(initialEvents);
  const [isPolling, setIsPolling] = useState(true);
  const [timeframe, setTimeframe] = useState("5m");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [pollError, setPollError] = useState(false);
  const [isLoadingRange, setIsLoadingRange] = useState(false);
  const [realPurchaseCount, setRealPurchaseCount] = useState(initialRealPurchaseCount);
  const [totalRevenue, setTotalRevenue] = useState(initialTotalRevenue24h);
  const [trendData, setTrendData] = useState<HourlyPoint[]>(initialTrendData);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);

  // Custom date-range picker state (calendar)
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  
  // New scalability states
  const [totalTableRows, setTotalTableRows] = useState(0);
  const [funnelMetrics, setFunnelMetrics] = useState<{name: string, value: number}[]>([]);
  const [userIntensity, setUserIntensity] = useState<{ip: string, count: number}[]>([]);
  const [serverTopRegions, setServerTopRegions] = useState<{name: string, count: number}[]>([]);

  // Focus state for Live Sync (Feed -> Map)
  const [focusPoint, setFocusPoint] = useState<{lat: number, lng: number, id: string} | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleSelectUser = (session: any) => {
    // Si ya está seleccionada la misma IP, deseleccionar
    if (focusPoint?.id === session.ip) {
      setFocusPoint(null);
      return;
    }

    // 1. Buscar el evento más reciente que contenga latitud y longitud válidas
    const eventWithCoords = [...session.events].reverse().find(
      (ev: any) => typeof ev.latitude === "number" && typeof ev.longitude === "number"
    );

    if (eventWithCoords) {
      setFocusPoint({
        lat: eventWithCoords.latitude,
        lng: eventWithCoords.longitude,
        id: session.ip
      });
      return;
    }

    // 2. Fallback de coordenadas si no tienen geolocalización precisa directa
    const COUNTRY_FALLBACKS: Record<string, { lat: number; lng: number }> = {
      AR: { lat: -34.6037, lng: -58.3816 },
      MX: { lat: 19.4326, lng: -99.1332 },
      CO: { lat: 4.7110, lng: -74.0721 },
      CL: { lat: -33.4489, lng: -70.6693 },
      PE: { lat: -12.0464, lng: -77.0428 },
      ES: { lat: 40.4168, lng: -3.7038 },
      UY: { lat: -34.9011, lng: -56.1645 },
      US: { lat: 25.7617, lng: -80.1918 },
      EC: { lat: -0.1807, lng: -78.4678 },
      PY: { lat: -25.2637, lng: -57.5759 },
      BO: { lat: -16.4897, lng: -68.1193 },
      VE: { lat: 10.4806, lng: -66.9036 }
    };

    const code = (session.country_code || "AR").toUpperCase();
    const fallback = COUNTRY_FALLBACKS[code] || COUNTRY_FALLBACKS.AR;

    setFocusPoint({
      lat: fallback.lat,
      lng: fallback.lng,
      id: session.ip
    });
  };

  const handleExport = async (format: "csv" | "json") => {
    setIsExporting(format);
    try {
      // Fetch all data (up to export limit) for the selected range
      let url = `/api/live-events?timeframe=${timeframe}&mode=export`;
      if (timeframe === "custom" && customFrom && customTo) {
        url += `&from=${encodeURIComponent(customFrom)}&to=${encodeURIComponent(customTo)}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      const eventsToExport = data.events || [];

      if (format === "json") {
        const blob = new Blob([JSON.stringify(eventsToExport, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `live_activity_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
      } else {
        // CSV
        const headers = ["ID", "Evento", "País", "Ciudad", "Fecha", "Metadata"];
        const csvContent = [
          headers.join(","),
          ...eventsToExport.map((e: any) => [
            e.id,
            e.event_type,
            e.country_code,
            `"${e.city || ''}"`,
            e.created_at,
            `"${JSON.stringify(e.metadata || {}).replace(/"/g, '""')}"`
          ].join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `live_activity_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
      }
    } catch (error) {
      console.error("Export failed", error);
    } finally {
      setIsExporting(null);
    }
  };

  const handleCleanup = async () => {
    if (!confirm("¿Estás seguro de que deseas VACIAR toda la actividad live? Esta acción borrará todos los registros históricos de eventos de la base de datos definitivamente.")) return;
    
    setIsCleaning(true);
    try {
      const res = await fetch("/api/live-events", { 
        method: "DELETE",
        headers: { "x-livefunnel-key": "livefunnel-admin-cleanup" } // Basic protection
      });
      if (res.ok) {
        setEvents([]);
        dataCache.clear();
        alert("Base de datos de actividad vaciada con éxito.");
        fetchEvents(true);
      }
    } catch (error) {
      console.error("Cleanup failed", error);
    } finally {
      setIsCleaning(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    setLastUpdate(new Date());
  }, []);

  const applyCustomRange = () => {
    if (!draftFrom || !draftTo || draftFrom > draftTo) return;
    setCustomFrom(draftFrom);
    setCustomTo(draftTo);
  };

  const applyData = useCallback((data: LivePayload) => {
    setEvents(data.events);
    setLastUpdate(new Date());
    setPollError(false);
    setRealPurchaseCount(data.realPurchaseCount);
    setTotalRevenue(data.totalRevenue);
    setTrendData(data.trendData);
    setTotalTableRows(data.totalTableRows);
    setFunnelMetrics(data.funnelMetrics);
    setUserIntensity(data.userIntensity);
    setServerTopRegions(data.serverTopRegions);
  }, []);

  const fetchEvents = useCallback(async (bypassCache = false, showLoading = true) => {
    const cacheKey = timeframe === "custom" ? `custom:${customFrom}:${customTo}` : timeframe;

    // SWR: si hay un snapshot fresco para este rango, renderizar al instante.
    if (!bypassCache) {
      const cached = dataCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < DATA_CACHE_TTL_MS) {
        applyData(cached.data);
        return;
      }
    }

    if (showLoading) setIsLoadingRange(true);
    try {
      let url = `/api/live-events?timeframe=${timeframe}`;
      if (timeframe === "custom") {
        // Wait until the user applies a valid range
        if (!customFrom || !customTo) return;
        url += `&from=${encodeURIComponent(customFrom)}&to=${encodeURIComponent(customTo)}`;
      }
      const res = await fetch(url, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        setPollError(true);
        return;
      }
      const data = await res.json();
      if (data.events) {
        const payload: LivePayload = {
          events: data.events,
          realPurchaseCount: data.realPurchaseCount ?? 0,
          totalRevenue: data.totalRevenue ?? 0,
          trendData: data.trendData ?? [],
          totalTableRows: data.totalTableRows ?? 0,
          funnelMetrics: data.funnelMetrics ?? [],
          userIntensity: data.userIntensity ?? [],
          serverTopRegions: data.serverTopRegions ?? [],
        };
        dataCache.set(cacheKey, { data: payload, ts: Date.now() });
        applyData(payload);
      }
    } catch {
      setPollError(true);
    } finally {
      setIsLoadingRange(false);
    }
  }, [timeframe, customFrom, customTo]);

  // Immediate refetch on timeframe change (cache-first: instantáneo si ya fue visto)
  useEffect(() => {
    fetchEvents();
  }, [timeframe, fetchEvents]);

  // Prefetch the most common live ranges once so the first switch is instant too
  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    const t = setTimeout(() => {
      ["1m", "5m", "15m", "1h"].forEach((tf) => {
        if (dataCache.has(tf)) return;
        fetch(`/api/live-events?timeframe=${tf}`, { credentials: "include" })
          .then((res) => (res.ok ? res.json() : null))
          .then((d) => {
            if (d?.events) {
              dataCache.set(tf, {
                data: {
                  events: d.events,
                  realPurchaseCount: d.realPurchaseCount ?? 0,
                  totalRevenue: d.totalRevenue ?? 0,
                  trendData: d.trendData ?? [],
                  totalTableRows: d.totalTableRows ?? 0,
                  funnelMetrics: d.funnelMetrics ?? [],
                  userIntensity: d.userIntensity ?? [],
                  serverTopRegions: d.serverTopRegions ?? [],
                },
                ts: Date.now(),
              });
            }
          })
          .catch(() => {});
      });
    }, 1000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!isPolling) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => fetchEvents(true), POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPolling, fetchEvents]);

  useEffect(() => {
    const handler = () => {
      // SKILL.md Rule 43.13: Visibility API obligatorio para pausar polling
      if (document.hidden) setIsPolling(false);
      else {
        setIsPolling(true);
        fetchEvents(true);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [fetchEvents]);

  const timeframes = [
    { label: "1 min", value: "1m" },
    { label: "5 min", value: "5m" },
    { label: "15 min", value: "15m" },
    { label: "1 hora", value: "1h" },
    { label: "12 horas", value: "12h" },
    { label: "24 horas", value: "24h" },
    { label: "1 semana", value: "7d" },
    { label: "1 mes", value: "30d" },
    { label: "1 año", value: "365d" },
    { label: "Rango", value: "custom" },
  ];

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-5 overflow-x-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-destructive/10">
            <Radio className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground uppercase">
                Live Activity
              </h1>
              <div className="bg-primary border border-primary/20 px-2 py-0.5 rounded-full flex items-center gap-1.5 shadow-sm">
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[9px] font-black text-primary uppercase tracking-tighter">
                  {events.length} Eventos
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-0.5">
              <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest flex items-center gap-2 opacity-60">
                <span className="relative flex h-1.5 w-1.5">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${pollError ? "bg-warning" : "bg-success"}`} />
                  <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${pollError ? "bg-warning" : "bg-success"}`} />
                </span>
                {pollError ? "Reintentando..." : `Sync: ${POLL_INTERVAL / 1000}s`}
              </p>

              {isLoadingRange && (
                <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest flex items-center gap-1 opacity-60">
                  <Loader2 className="h-3 w-3 animate-spin" /> Actualizando
                </span>
              )}
              
              {/* Storage Meter integration */}
              <LiveStorageMeter totalRows={totalTableRows} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Export & Cleanup Controls */}
          <div className="flex items-center gap-1 bg-muted p-1 rounded border border-border/50 mr-2">
            <button
              onClick={() => handleExport("csv")}
              disabled={!!isExporting}
              title="Exportar CSV"
              className="p-1.5 hover:bg-background rounded text-muted-foreground hover:text-success transition-all disabled:opacity-50"
            >
              {isExporting === "csv" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            </button>
            <button
              onClick={() => handleExport("json")}
              disabled={!!isExporting}
              title="Exportar JSON"
              className="p-1.5 hover:bg-background rounded text-muted-foreground hover:text-primary transition-all disabled:opacity-50"
            >
              {isExporting === "json" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}
            </button>
            <div className="w-px h-4 bg-border/50 mx-1" />
            <button
              onClick={handleCleanup}
              disabled={isCleaning}
              title="Vaciar Base de Datos"
              className="p-1.5 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-all disabled:opacity-50"
            >
              {isCleaning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          </div>

          <div className="flex items-center flex-wrap sm:flex-nowrap bg-muted rounded p-1 border border-border">
            {timeframes.map((tf) => (
              <button
                key={tf.value}
                onClick={() => {
                  if (tf.value === "custom" && !draftFrom && !draftTo) {
                    // Initialize drafts: applied range or sensible default (last 7 days)
                    if (customFrom && customTo) {
                      setDraftFrom(customFrom);
                      setDraftTo(customTo);
                    } else {
                      const to = new Date();
                      const from = new Date();
                      from.setDate(from.getDate() - 6);
                      setDraftFrom(from.toISOString().split("T")[0]);
                      setDraftTo(to.toISOString().split("T")[0]);
                    }
                  }
                  setTimeframe(tf.value);
                }}
                className={`px-3 py-1.5 text-[10px] font-bold rounded transition-all ${
                  timeframe === tf.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchEvents(true)}
            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted rounded px-3 py-2 transition-colors border border-transparent hover:border-border"
          >
            <RefreshCw className={`h-3 w-3 ${isLoadingRange ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Sync</span>
          </button>
          <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded border border-border/50 text-[10px] font-black text-muted-foreground/80 uppercase tracking-widest">
            <Clock className="h-3 w-3 text-primary" />
            {lastUpdate ? formatArgTime(lastUpdate) : "--:--:--"}
          </div>
        </div>
      </div>

      {/* ── Custom date-range picker (native calendar inputs) ── */}
      {timeframe === "custom" && (
        <div className="flex items-center gap-2 flex-wrap bg-muted rounded p-2 border border-border">
          <CalendarDays className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Desde</span>
          <input
            type="date"
            value={draftFrom}
            max={draftTo || todayStr}
            onChange={(e) => setDraftFrom(e.target.value)}
            className="px-2 py-1 text-[10px] font-bold rounded bg-background border border-border text-foreground"
          />
          <span className="text-[10px] text-muted-foreground">→</span>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Hasta</span>
          <input
            type="date"
            value={draftTo}
            min={draftFrom}
            max={todayStr}
            onChange={(e) => setDraftTo(e.target.value)}
            className="px-2 py-1 text-[10px] font-bold rounded bg-background border border-border text-foreground"
          />
          <button
            onClick={applyCustomRange}
            disabled={!draftFrom || !draftTo || draftFrom > draftTo}
            className="px-3 py-1 text-[10px] font-bold rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all"
          >
            Aplicar
          </button>
          {customFrom && customTo && (
            <span className="text-[9px] text-muted-foreground/70 font-semibold">
              Activo: {customFrom} → {customTo}
            </span>
          )}
        </div>
      )}

      {/* ── Map & Activity (Top) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          {/* SKILL.md Rule 41: Uso de globo 3D Canvas / SVG, $0 costo (Zero Mapbox billable loads) */}
          <MemoizedWorldMap 
            events={events} 
            mapboxToken={mapboxToken} 
            mapboxStyle={mapboxStyle}
            focusPoint={focusPoint}
          />
        </div>
        {/* SKILL.md Rule 46: Altura Definida para Preservación de Scroll */}
        <div className="lg:col-span-1 h-[350px] lg:h-[440px]">
          <div className="rounded border border-border bg-card overflow-hidden h-full">
            <MemoizedEventFeed 
              events={events} 
              onSelectUser={handleSelectUser}
              selectedIp={focusPoint?.id}
            />
          </div>
        </div>
      </div>

      {/* ── Funnel & Trend (Bottom) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <MemoizedFunnelBar 
            events={events} 
            realPurchaseCount={realPurchaseCount}
            totalRevenue={totalRevenue}
            timeframe={timeframe}
            serverFunnel={funnelMetrics}
          />
        </div>
        <div className="lg:col-span-1">
          <MemoizedTrendChart data={trendData || []} timeframe={timeframe} />
        </div>
      </div>

      <MemoizedTopStats 
        events={events} 
        timeframe={timeframe} 
        userIntensity={userIntensity}
        serverTopRegions={serverTopRegions}
      />

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-5 px-4 py-4 bg-muted rounded border border-border/50">
        <div className="w-full mb-1">
          <span className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">Leyenda de Eventos</span>
        </div>
        {Object.entries(EVENT_CONFIG).map(([key, cfg]) => {
          if (!cfg) return null;
          return (
            <div key={key} className="flex items-center gap-1.5 grayscale-[0.5] hover:grayscale-0 transition-all">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: cfg.color }} />
              <span className="text-[10px] font-bold text-muted-foreground">
                <EventIcon name={cfg.icon} className="w-3 h-3 inline mr-0.5" /> {cfg.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

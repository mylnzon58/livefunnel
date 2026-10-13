import { useMemo } from "react";
import { type FunnelEvent } from "./worldData";
import { getTopStats } from "./liveUtils";
import { Smartphone, Monitor, MapPin, TrendingUp, Compass, Search, Share2, Globe, ExternalLink } from "lucide-react";

interface LiveTopStatsProps {
  events: FunnelEvent[];
  timeframe?: string;
  userIntensity?: { ip: string, count: number }[];
  serverTopRegions?: { name: string, count: number }[];
}

function getSourceIcon(source: string) {
  const s = source.toLowerCase();
  if (s.includes("google ads")) return <span className="text-blue-500 font-black text-[10px]">AD</span>;
  if (s.includes("google") || s.includes("bing")) return <Search className="h-3 w-3 text-blue-400" />;
  if (s.includes("facebook") || s.includes("instagram") || s.includes("twitter") || s.includes("x.com") || s.includes("whatsapp") || s.includes("tiktok")) return <Share2 className="h-3 w-3 text-pink-400" />;
  if (s === "directo") return <Globe className="h-3 w-3 text-emerald-400" />;
  return <ExternalLink className="h-3 w-3 text-muted-foreground" />;
}

export function LiveTopStats({ 
  events, 
  timeframe = "5m", 
  userIntensity = [],
  serverTopRegions = []
}: LiveTopStatsProps) {
  const { topRegions: clientTopRegions, devices, topSources } = useMemo(() => getTopStats(events), [events]);
  
  const topRegions = useMemo(() => {
    if (serverTopRegions && serverTopRegions.length > 0) return serverTopRegions;
    return clientTopRegions;
  }, [clientTopRegions, serverTopRegions]);

  const hasData = (devices.mobile + devices.desktop) > 0;
  const total = (devices.mobile + devices.desktop) || 1;
  const mobilePct = hasData ? Math.round((devices.mobile / total) * 100) : 0;
  const desktopPct = hasData ? (100 - mobilePct) : 0;

  const timeframeLabel = useMemo(() => {
    switch(timeframe) {
      case "1m": return "1m";
      case "5m": return "5m";
      case "15m": return "15m";
      case "1h": return "1h";
      case "12h": return "12h";
      case "7d": return "7d";
      case "30d": return "30d";
      case "365d": return "1a";
      case "custom": return "Rango";
      default: return "24h";
    }
  }, [timeframe]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Top Regions */}
      <div className="rounded border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <MapPin className="h-4 w-4 text-accent" />
            Top Regiones
          </h3>
          <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full uppercase tracking-widest whitespace-nowrap">
            {timeframeLabel}
          </span>
        </div>
        <div className="space-y-3">
          {topRegions.slice(0, 5).map((region, idx) => (
            <div key={region.name} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-bold text-muted-foreground w-4 flex-shrink-0">{idx + 1}.</span>
                <span className="text-xs font-semibold text-foreground truncate">{region.name}</span>
              </div>
              <span className="text-xs font-black text-accent flex-shrink-0">{region.count}</span>
            </div>
          ))}
          {topRegions.length === 0 && (
            <p className="text-xs text-muted-foreground italic text-center py-4">Sin datos suficientes</p>
          )}
        </div>
      </div>

      {/* Visitor Sources */}
      <div className="rounded border border-border bg-card p-5">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
          <Compass className="h-4 w-4 text-indigo-500" />
          Top Fuentes
        </h3>
        <div className="space-y-3">
          {topSources.map((src, idx) => (
            <div key={src.name} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-6 w-6 rounded bg-muted flex items-center justify-center flex-shrink-0 border border-border/30">
                  {getSourceIcon(src.name)}
                </div>
                <span className="text-xs font-semibold text-foreground truncate">{src.name}</span>
              </div>
              <span className="text-xs font-black text-indigo-500 flex-shrink-0">{src.count}</span>
            </div>
          ))}
          {topSources.length === 0 && (
            <p className="text-xs text-muted-foreground italic text-center py-4">Detectando origen...</p>
          )}
        </div>
      </div>

      {/* Device Distribution */}
      <div className="rounded border border-border bg-card p-5">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
          <Smartphone className="h-4 w-4 text-primary" />
          Distribución
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded bg-primary">
                <Smartphone className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">Mobile</p>
                <p className="text-[10px] text-muted-foreground">{devices.mobile} ses.</p>
              </div>
            </div>
            <span className="text-base font-black text-foreground">{mobilePct}%</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded bg-primary">
                <Monitor className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">Desktop</p>
                <p className="text-[10px] text-muted-foreground">{devices.desktop} ses.</p>
              </div>
            </div>
            <span className="text-base font-black text-foreground">{desktopPct}%</span>
          </div>

          <div className="w-full h-1.5 rounded-full overflow-hidden flex bg-muted mt-2">
            <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${mobilePct}%` }} />
            <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${desktopPct}%` }} />
          </div>
        </div>
      </div>

      {/* User Intensity (Load/Focus) */}
      <div className="rounded border border-border bg-card p-5">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-success" />
          Intensidad
        </h3>
        <div className="space-y-3">
          {userIntensity.slice(0, 4).map((user, idx) => (
            <div key={user.ip} className="flex items-center justify-between group gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${idx === 0 ? 'bg-success animate-pulse' : 'bg-muted-foreground/30'}`} />
                <span className="text-[10px] font-mono text-muted-foreground truncate">{user.ip}</span>
              </div>
              <span className="text-xs font-black text-success">{user.count} <span className="text-[8px] font-bold">ev.</span></span>
            </div>
          ))}
          {userIntensity.length === 0 && (
            <p className="text-xs text-muted-foreground italic text-center py-4">Procesando carga...</p>
          )}
        </div>
        <p className="mt-4 text-[9px] text-muted-foreground/60 leading-tight">
          Usuarios con mayor volumen de interacción actual.
        </p>
      </div>
    </div>
  );
}

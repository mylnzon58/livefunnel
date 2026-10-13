import { useRef, useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Smartphone, Monitor, ShoppingBag, Globe, Search, Share2 } from "lucide-react";
import { EVENT_CONFIG, type FunnelEvent } from "./worldData";
import { EventIcon } from "./EventIcon";
import { safeDecode, groupEventsBySession, getFullCountry } from "./liveUtils";

function getDeviceType(ua?: string) {
  if (!ua) return "unknown";
  const lower = ua.toLowerCase();
  if (lower.includes("mobi") || lower.includes("android") || lower.includes("iphone") || lower.includes("ipad")) {
    return "mobile";
  }
  return "desktop";
}

function timeAgo(dateStr: string): string {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
  if (diff < 5) return "ahora";
  if (diff < 60) return `hace ${diff}s`;
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`;
  return `hace ${Math.floor(diff / 3600)}h`;
}

interface LiveEventFeedProps {
  events: FunnelEvent[];
  onSelectUser?: (session: any) => void;
  selectedIp?: string;
}

/** Extract human-readable error details from event metadata */
function getErrorDetail(ev: FunnelEvent): { reason: string; stage: string; device: string } | null {
  const m = ev.metadata || {};
  // The error reason comes from multiple possible fields depending on the event source
  const rawError = m.error || m.reason || m.metadata?.error || m.metadata?.reason || "";
  const rawStage = m.stage || m.metadata?.stage || "";
  const rawBrowser = m.browser || m.ua || m.metadata?.browser || m.metadata?.ua || m.client_ua || "";

  // Translate stage codes to Spanish labels
  const stageLabels: Record<string, string> = {
    "verify": "Verificación del pago",
    "verify_card": "Verificación tarjeta",
    "card_button": "Botón de tarjeta",
    "paypal_button": "Botón de PayPal",
    "script_load_failed": "SDK no cargó",
  };

  // Translate common PayPal error messages
  const errorLabels: Record<string, string> = {
    "INSTRUMENT_DECLINED": "Tarjeta rechazada por el banco",
    "PAYER_ACTION_REQUIRED": "Se requiere acción del pagador",
    "ORDER_NOT_APPROVED": "Orden no aprobada",
    "INTERNAL_SERVICE_ERROR": "Error interno de PayPal",
    "TRANSACTION_REFUSED": "Transacción rechazada",
    "INSUFFICIENT_FUNDS": "Fondos insuficientes",
    "CARD_EXPIRED": "Tarjeta vencida",
    "INVALID_CARD_NUMBER": "Número de tarjeta inválido",
    "popup_blocked": "Popup bloqueado por navegador",
    "script_load_failed": "SDK PayPal no pudo cargar",
  };

  // Detect device from user agent
  let device = "";
  if (rawBrowser) {
    const ua = rawBrowser.toLowerCase();
    if (ua.includes("iphone")) device = "iPhone";
    else if (ua.includes("ipad")) device = "iPad";
    else if (ua.includes("android")) device = "Android";
    else if (ua.includes("mac")) device = "Mac";
    else if (ua.includes("windows")) device = "Windows";
    else if (ua.includes("linux")) device = "Linux";
    else device = "Otro";
    
    // Add browser
    if (ua.includes("chrome") && !ua.includes("edg")) device += " / Chrome";
    else if (ua.includes("safari") && !ua.includes("chrome")) device += " / Safari";
    else if (ua.includes("firefox")) device += " / Firefox";
    else if (ua.includes("edg")) device += " / Edge";
  }

  const reason = errorLabels[rawError] || rawError || "Sin detalles";
  const stage = stageLabels[rawStage] || rawStage || "";

  return { reason, stage, device };
}

function parseDeviceInfo(ua?: string) {
  if (!ua) return { device: "Desconocido", browser: "Desconocido", os: "Desconocido", isMobile: false };
  const lower = ua.toLowerCase();
  
  let os = "OS Desconocido";
  if (lower.includes("iphone")) os = "iOS (iPhone)";
  else if (lower.includes("ipad")) os = "iPadOS (iPad)";
  else if (lower.includes("android")) os = "Android";
  else if (lower.includes("mac os") || lower.includes("macintosh")) os = "macOS";
  else if (lower.includes("windows")) os = "Windows";
  else if (lower.includes("linux")) os = "Linux";
  
  let browser = "Navegador";
  if (lower.includes("chrome") && !lower.includes("edg") && !lower.includes("opr")) browser = "Chrome";
  else if (lower.includes("safari") && !lower.includes("chrome")) browser = "Safari";
  else if (lower.includes("firefox")) browser = "Firefox";
  else if (lower.includes("edg")) browser = "Edge";
  else if (lower.includes("opera") || lower.includes("opr")) browser = "Opera";
  else if (lower.includes("samsungbrowser")) browser = "Samsung Internet";

  const isMobile = lower.includes("mobi") || lower.includes("android") || lower.includes("iphone") || lower.includes("ipad");
  const device = isMobile ? "Móvil" : "Escritorio";

  return { device, browser, os, isMobile };
}

function formatCleanUrl(rawUrl?: string): string {
  if (!rawUrl) return "";
  if (rawUrl.includes("status=null")) {
    return "🛑 MP: Regresó sin Pagar (Abandono)";
  }
  try {
    const parsed = new URL(rawUrl);
    return (parsed.pathname + parsed.hash) || "/";
  } catch {
    if (rawUrl.includes("status=null")) return "🛑 MP: Regresó sin Pagar (Abandono)";
    return rawUrl;
  }
}

/**
 * Deduce el contexto de checkout: in-place (modal o formulario embebido) o página externa (/checkout).
 */
function getEventOrigin(ev: FunnelEvent): "inplace" | "reload" | null {
  const m = ev.metadata || {};
  const url = String(m.url || m.path || "");
  const source = String(m.source || "");
  if (
    ev.event_type === "checkout_inplace" ||
    m.checkout_type === "simulation_inplace" ||
    source.startsWith("simulation_radar") ||
    url.includes("#simulation")
  ) return "inplace";
  if (
    m.checkout_type === "billing_reload" ||
    m.stage === "billing" ||
    /\/checkout(\/|\?|#|$)/.test(url)
  ) return "reload";
  return null;
}

export function LiveEventFeed({ events, onSelectUser, selectedIp }: LiveEventFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [visibleLimit, setVisibleLimit] = useState(15);
  const [showBots, setShowBots] = useState(false);

  // Use the new session grouping utility
  const allSessionsRaw = useMemo(() => groupEventsBySession(events), [events]);
  
  const allSessions = useMemo(() => {
    return allSessionsRaw.filter(session => {
      const hasBot = session.events.some(e => e.event_type === "bot_blocked");
      return showBots ? hasBot : !hasBot;
    });
  }, [allSessionsRaw, showBots]);
  
  const sessions = useMemo(() => allSessions.slice(0, visibleLimit), [allSessions, visibleLimit]);

  // Auto-scroll to top on new sessions
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [sessions[0]?.ip]);

  return (
    <div className="flex flex-col h-full">
      {/* SKILL.md Rule 45: Wrapping Obligatorio en Encabezados */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3 border-b border-border/50 bg-muted">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 whitespace-nowrap">
          <span className="text-base">{showBots ? "🤖" : "🚀"}</span> 
          {showBots ? "Bots Bloqueados" : "Trazabilidad (Sesiones)"}
        </h3>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowBots(!showBots)}
            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded transition-colors ${
              showBots 
                ? "bg-red-500/20 text-red-400 border border-red-500/30" 
                : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-slate-500/10"
            }`}
            title="Alternar vista de bots bloqueados"
          >
            {showBots ? "Ocultar Bots" : "Ver Bots"}
          </button>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
            Actividad Reciente
          </span>
        </div>
      </div>

      {/* Session list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 custom-scrollbar">
        {sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 px-4">
            <span className="text-3xl mb-3">🔍</span>
            <p className="text-sm font-semibold text-muted-foreground">Sin actividad trazable</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Los recorridos de usuario aparecerán aquí
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {sessions.map((session, idx) => {
            const location = [safeDecode(session.city), session.country_code].filter(Boolean).join(", ") || "Desconocido";
            const lastEvent = session.events[session.events.length - 1];
            const lastCfg = EVENT_CONFIG[lastEvent.event_type] || { color: "#94A3B8" };

            const isSelected = selectedIp === session.ip;

            return (
              <motion.div
                key={session.ip}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 400, damping: 30, delay: idx * 0.05 }}
                className="group relative cursor-pointer"
                onClick={() => onSelectUser?.(session)}
              >
                <div className={`flex flex-col gap-2 rounded border p-3 transition-all shadow-sm ${
                  isSelected 
                    ? "bg-[#009EE3]/10 border-[#009EE3] ring-2 ring-[#009EE3]/30 scale-[1.01]" 
                    : "bg-card border-border/50 hover:border-slate-400/50"
                }`}>
                  {/* Header: Location, Country & Time */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`h-2.5 w-2.5 rounded-full animate-pulse flex-shrink-0 ${isSelected ? 'ring-4 ring-[#009EE3]/30' : ''}`} style={{ backgroundColor: lastCfg.color }} />
                      <span className="text-[11px] font-bold text-foreground truncate">
                        📍 {(() => {
                          const geo = [safeDecode(session.city), getFullCountry(session.country_code || '')].filter(Boolean).join(', ');
                          if (geo) return geo;
                          // Fallback: show email from any event in session, then IP
                          const email = session.events.find(e => e.metadata?.user_email)?.metadata?.user_email;
                          if (email) return `✉️ ${email}`;
                          if (session.ip && session.ip !== 'unknown') return `🌐 ${session.ip}`;
                          return 'Desconocido';
                        })()}
                      </span>
                      {/* Purchase badge — visible only if session includes a purchase */}
                      {session.events.some(e => e.event_type === 'purchase') && (
                        <span className="flex-shrink-0 inline-flex items-center gap-0.5 bg-success/15 border border-success/30 text-success rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase">
                          <ShoppingBag className="h-2.5 w-2.5" />
                          Compró
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-muted-foreground/70 font-mono flex-shrink-0 ml-1">
                      {isMounted ? timeAgo(session.lastActive) : "..."}
                    </span>
                  </div>

                  {/* Journey Path */}
                  <div className="flex items-center gap-x-1.5 gap-y-2 flex-wrap mt-2">
                    {session.events.length > 12 && (
                      <span className="text-[9px] font-black text-muted-foreground/50 px-1 py-0.5 bg-muted rounded">
                        +{session.events.length - 12}
                      </span>
                    )}
                    {session.events.slice(-12).map((ev, evIdx, arr) => {
                      const cfg = EVENT_CONFIG[ev.event_type] || { icon: "AlertCircle", color: "#94A3B8", label: "Evento" };
                      const isErrorEvent = ["payment_error", "popup_blocked", "sdk_error", "redirect_fallback"].includes(ev.event_type);
                      const errorDetail = isErrorEvent ? getErrorDetail(ev) : null;

                      return (
                        <div key={ev.id} className="flex items-center gap-1.5">
                          <div className="relative group/icon">
                            <div
                              className={`h-7 w-7 rounded flex items-center justify-center border shadow-inner ${
                                isErrorEvent
                                  ? 'border-destructive/40 bg-destructive/10 ring-1 ring-destructive/20'
                                  : `border-border/40 ${isSelected ? 'bg-sky-50 dark:bg-sky-950/40 border-[#009EE3]/40' : 'bg-muted'}`
                              }`}
                              style={{ color: cfg.color }}
                              title={cfg.label}
                            >
                              <EventIcon name={cfg.icon} className="w-3.5 h-3.5" />
                            </div>
                          </div>
                          {evIdx < arr.length - 1 && (
                            <div className="h-px w-2 bg-border/40" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Inline Error Details (Mobile Friendly) */}
                  {session.events.filter(ev => ["payment_error", "popup_blocked", "sdk_error", "redirect_fallback"].includes(ev.event_type)).length > 0 && (
                    <div className="flex flex-col gap-1.5 mt-2">
                      {session.events
                        .filter(ev => ["payment_error", "popup_blocked", "sdk_error", "redirect_fallback"].includes(ev.event_type))
                        .map(errEv => {
                          const detail = getErrorDetail(errEv);
                          const cfg = EVENT_CONFIG[errEv.event_type];
                          if (!detail) return null;
                          return (
                            <div key={errEv.id} className="bg-destructive/10 border border-destructive/20 rounded p-2 text-[10px]">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-destructive font-black uppercase tracking-wider text-[9px]">{cfg?.label || "Error"}</span>
                                {detail.stage && <span className="text-warning font-semibold">{detail.stage}</span>}
                              </div>
                              <p className="text-destructive/80 font-semibold break-words leading-tight">{detail.reason}</p>
                              {detail.device && <p className="text-muted-foreground/60 mt-1 text-[8px] font-mono">{detail.device}</p>}
                            </div>
                          );
                      })}
                    </div>
                  )}

                   {/* Context & Location Execution Badge */}
                   <div className="flex items-center gap-1.5 flex-wrap mt-1">
                     {(() => {
                       // Origen = el del último evento con contexto conocido (refleja dónde ocurrió la acción final)
                       const origin = [...session.events].reverse().map(getEventOrigin).find(Boolean) || null;
                       const hasInplace = origin === "inplace";
                       const hasReload = origin === "reload";
                       const lastUrl = session.events.map(e => e.metadata?.url || e.metadata?.path).filter(Boolean).pop();

                       return (
                         <>
                           {hasInplace ? (
                             <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1">
                               <span>🎯</span> Checkout In-Place
                             </span>
                           ) : hasReload ? (
                             <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center gap-1">
                               <span>💳</span> Checkout Externo (/checkout)
                             </span>
                           ) : null}

                           {lastUrl && (
                             <span className="text-[9px] font-mono text-muted-foreground/80 bg-muted px-1.5 py-0.5 rounded border border-border/40 truncate max-w-[170px]" title={lastUrl}>
                               {formatCleanUrl(lastUrl)}
                             </span>
                           )}
                         </>
                       );
                     })()}
                   </div>

                   {/* IP, Device & Source */}
                   <div className="flex items-center justify-between mt-1 gap-2">
                     <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        {(() => {
                          const dev = parseDeviceInfo(lastEvent.metadata?.ua || lastEvent.metadata?.client_ua);
                          return (
                            <div className="flex items-center gap-1 text-[9px] text-muted-foreground/80 font-mono">
                              {dev.isMobile ? <Smartphone className="h-3 w-3 flex-shrink-0 text-muted-foreground/60" /> : <Monitor className="h-3 w-3 flex-shrink-0 text-muted-foreground/60" />}
                              <span>{dev.os} • {dev.browser}</span>
                            </div>
                          );
                        })()}
                        <span className="text-[9px] text-muted-foreground/40 font-mono truncate">
                          IP: {session.ip}
                        </span>
                        {/* Source Indicator */}
                        <div className="flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded border border-border/20 ml-1">
                          {(() => {
                            const source = session.events.find(e => e.metadata?.source)?.metadata?.source || "Directo";
                            const s = source.toLowerCase();
                            let icon = <Globe className="h-2.5 w-2.5 text-muted-foreground/50" />;
                            let color = "text-muted-foreground/60";
                            
                            if (s.includes("google ads")) {
                              icon = <span className="text-[7px] font-black leading-none text-blue-500">AD</span>;
                              color = "text-blue-500 font-bold";
                            } else if (s.includes("google") || s.includes("bing")) {
                              icon = <Search className="h-2.5 w-2.5 text-blue-400" />;
                              color = "text-blue-400 font-bold";
                            } else if (s.includes("facebook") || s.includes("instagram") || s.includes("twitter") || s.includes("whatsapp") || s.includes("tiktok") || s.includes("x.com")) {
                              icon = <Share2 className="h-2.5 w-2.5 text-pink-400" />;
                              color = "text-pink-400 font-bold";
                            }
                            
                            return (
                              <>
                                {icon}
                                <span className={`text-[8px] uppercase tracking-tighter truncate max-w-[60px] ${color}`}>
                                  {source}
                                </span>
                              </>
                            );
                          })()}
                        </div>
                     </div>
                     <span className={`text-[10px] font-black uppercase flex-shrink-0 ${isSelected ? 'text-primary' : 'text-primary/80'}`}>
                       {session.events.length} pasos
                     </span>
                   </div>

                   {/* Expanded Forensic Timeline Inspector when Selected */}
                   {isSelected && (
                     <div className="mt-3 pt-3 border-t border-primary/20 space-y-2 bg-muted/30 -mx-3 -mb-3 p-3 rounded-b">
                       <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-primary">
                         <span>🔎 Detalle Forense del Recorrido</span>
                         {(() => {
                           const phone = session.events.find(e => e.metadata?.phone)?.metadata?.phone;
                           const planId = session.events.find(e => e.metadata?.plan_id)?.metadata?.plan_id;
                           return (
                             <div className="flex items-center gap-2">
                               {phone && <span className="bg-background px-1.5 py-0.5 rounded border border-border text-[9px] font-mono text-foreground font-bold">📱 {phone}</span>}
                               {planId && <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[9px] font-black">Plan {planId}</span>}
                             </div>
                           );
                         })()}
                       </div>
                       
                       <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                         {session.events.map((ev: any, evIdx: number) => {
                            const cfg = EVENT_CONFIG[ev.event_type] || { icon: "AlertCircle", label: ev.event_type, color: "#94A3B8" };
                            const evUrl = ev.metadata?.url || ev.metadata?.path || "";
                            const evTime = new Date(ev.created_at).toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: '2-digit', minute: '2-digit', second: '2-digit' });
                            
                            return (
                              <div key={ev.id || evIdx} className="flex items-start justify-between gap-2 p-1.5 bg-background/80 rounded border border-border/40 text-[9.5px]">
                                <div className="flex items-start gap-1.5 min-w-0">
                                  <span className="text-xs"><EventIcon name={cfg.icon} className="w-3.5 h-3.5" /></span>
                                 <div className="min-w-0">
                                   <div className="font-bold text-foreground truncate">{cfg.label}</div>
                                   {evUrl && (
                                     <div className="text-[8.5px] font-mono text-muted-foreground/70 truncate" title={evUrl}>
                                       {formatCleanUrl(evUrl)}
                                     </div>
                                   )}
                                 </div>
                               </div>
                               <span className="text-[8.5px] font-mono text-muted-foreground flex-shrink-0">{evTime}</span>
                             </div>
                           );
                         })}
                       </div>
                     </div>
                   )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Load More Button */}
        {visibleLimit < allSessions.length && (
          <div className="pt-3 pb-2 flex justify-center">
            <button
              onClick={() => setVisibleLimit(prev => prev + 15)}
              className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all px-4 py-2 rounded-full border border-border/50 hover:border-primary/50 bg-muted hover:bg-muted flex items-center gap-2"
            >
              Cargar más ({allSessions.length - visibleLimit} restantes)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

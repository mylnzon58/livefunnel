import { FunnelEvent } from "./worldData";
import { getArgDate } from "@/lib/dateUtils";

const countryNames = new Intl.DisplayNames(['es'], { type: 'region' });
export function getFullCountry(code: string) {
  if (!code || code === "??") return "";
  try {
    return countryNames.of(code) || code;
  } catch {
    return code;
  }
}


export interface HourlyPoint {
  time: string;
  landing: number;
  simulation: number;
  register: number;
  dashboard: number;
  checkout: number;
  billing: number;
  payment_intent: number;
  click_paypal: number;
  click_card: number;
  purchase: number;
}

export const safeDecode = (str: string | null) => {
  if (!str) return "Desconocido";
  try {
    // Replace %20 with space and other common URL encodings
    const decoded = decodeURIComponent(str.replace(/\+/g, " "));
    return decoded;
  } catch (e) {
    // Fallback for non-standard encodings
    return str.replace(/%[0-9A-F]{2}/gi, (match) => {
      try {
        return decodeURIComponent(match);
      } catch {
        return match;
      }
    });
  }
};

export function aggregateHourlyTrend(events: FunnelEvent[], payments: any[] = []): HourlyPoint[] {
  const hourlyActivity: Record<string, Omit<HourlyPoint, 'time'>> = {};
  
  // Initialize last 24 hours with zeros (AR Time)
  const now = getArgDate();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getTime() - i * 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    const isoKey = d.toISOString();
    hourlyActivity[isoKey] = { 
      landing: 0, 
      simulation: 0,
      register: 0,
      dashboard: 0,
      checkout: 0, 
      billing: 0,
      payment_intent: 0,
      click_paypal: 0,
      click_card: 0,
      purchase: 0 
    };
  }

  // Fill with real funnel events
  events.forEach(e => {
    const d = getArgDate(e.created_at);
    d.setMinutes(0, 0, 0);
    const key = d.toISOString();
    if (hourlyActivity[key]) {
      const type = e.event_type as string;
      if (type === "click_paypal") {
        hourlyActivity[key].click_paypal++;
        hourlyActivity[key].payment_intent++; // Keep legacy for broad chart
      } else if (type === "click_card") {
        hourlyActivity[key].click_card++;
        hourlyActivity[key].payment_intent++; // Keep legacy for broad chart
      } else if (type === "click_mercadopago" || type === "click_one" || type === "click_one_card" || type === "click_manual") {
        hourlyActivity[key].payment_intent++; // Count all gateway clicks as payment_intent
      } else if (type === "terms" || type === "terms_accepted") {
        // Consent/audit event (top-of-funnel checkbox + checkout T&C). It is NOT a
        // funnel progression, so it is ignored here to match the server RPC exactly.
      } else if (type === "manual_payment_submitted") {
        hourlyActivity[key].purchase++;
      } else if (type === "checkout_inplace") {
        hourlyActivity[key].checkout++;
      } else if (type in hourlyActivity[key]) {
        (hourlyActivity[key] as any)[type]++;
      }
    }
  });

  // Also include real payments in the hourly purchase count
  payments.forEach(p => {
    const d = getArgDate(p.created_at);
    d.setMinutes(0, 0, 0);
    const key = d.toISOString();
    if (hourlyActivity[key]) {
      hourlyActivity[key].purchase++;
    }
  });

  return Object.entries(hourlyActivity)
    .map(([time, counts]) => ({ time, ...counts as any }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function getTopStats(events: FunnelEvent[]) {
  const regions: Record<string, number> = {};
  const devices: Record<string, number> = { mobile: 0, desktop: 0 };
  const sources: Record<string, number> = {};
  
  events.forEach(e => {
    // Region/City/Country formatting
    const cityName = safeDecode(e.city);
    const regionName = e.metadata?.region ? safeDecode(e.metadata.region) : "";
    const countryCode = e.country_code || "??";
    const countryName = getFullCountry(countryCode);

    let loc = "";
    if (cityName && cityName !== "Desconocido") {
      loc = cityName;
      if (regionName && regionName !== cityName && regionName !== "Desconocido") {
        loc += `, ${regionName}`;
      }
    } else if (regionName && regionName !== "Desconocido") {
      loc = regionName;
    } else {
      loc = "Ubicación desconocida";
    }
    
    // Add country
    if (countryName) {
      loc += ` (${countryName})`;
    } else if (countryCode !== "??") {
      loc += ` (${countryCode})`;
    }
    
    regions[loc] = (regions[loc] || 0) + 1;

    // Device Classification (CRO: Vital for mobile/desktop funnel analysis)
    const metadata = e.metadata || {};
    const ua = metadata.ua || metadata.client_ua || "";
    
    if (ua) {
      const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobi|tablet/i.test(ua);
      if (isMobile) {
        devices.mobile++;
      } else {
        devices.desktop++;
      }
    }

    // Source Tracking (SEO vs Ads vs Direct)
    const source = metadata.source || "Directo";
    sources[source] = (sources[source] || 0) + 1;
  });

  const topRegions = Object.entries(regions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10) // Show more top regions
    .map(([name, count]) => ({ name, count }));

  const topSources = Object.entries(sources)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return { topRegions, devices, topSources };
}

export function calculateFunnel(events: FunnelEvent[]) {
  const funnelUnique: Record<string, Set<string>> = {
    landing: new Set(),
    simulation: new Set(),
    register: new Set(),
    dashboard: new Set(),
    checkout: new Set(),
    billing: new Set(),
    payment_intent: new Set(),
    purchase: new Set(),
    abandon: new Set()
  };
  
  // Also support legacy 'terms' and new granular clicks
  events.forEach(e => {
    // If IP is unknown, fallback to user_id or row id so it doesn't group all unknowns as 1 user
    let identity = e.metadata?.ip_detected;
    if (!identity || identity === "unknown") {
      identity = (e as any).user_id || e.id || Math.random().toString();
    }
    
    const type = e.event_type;
    // Only real gateway clicks count as "Click Pagar"
    if (type === "click_paypal" || type === "click_card" || type === "click_one" || type === "click_one_card" || type === "click_manual" || type === "click_mercadopago") {
      funnelUnique.payment_intent.add(identity);
    } else if (type === "payment_intent") {
      // payment_intent = intento de pago (no un click directo del usuario)
      funnelUnique.billing.add(identity);
    } else if (type === "terms" || type === "terms_accepted") {
      // Consent/audit event — not a funnel stage. Ignored to match the server RPC
      // (reaching the checkout is measured by `checkout` / `checkout_inplace`).
    } else if (type === "manual_payment_submitted") {
      funnelUnique.purchase.add(identity);
    } else if (type === "checkout_inplace") {
      // checkout in-place = usuario ve el nuevo checkout embebido en la landing
      funnelUnique.checkout.add(identity);
    } else if (funnelUnique.hasOwnProperty(type)) {
      funnelUnique[type].add(identity);
    }
  });

  return [
    { name: "Landing",          value: funnelUnique.landing.size,       color: "#3B82F6" },
    { name: "Ingreso Inicial",   value: funnelUnique.simulation.size,    color: "#8B5CF6" },
    { name: "Radar Bloqueado",   value: funnelUnique.checkout.size,      color: "#F59E0B" },
    { name: "Click Pagar",       value: funnelUnique.payment_intent.size,color: "#F97316" },
    { name: "Compra Confirmada", value: funnelUnique.purchase.size,      color: "#10B981" },
    { name: "Entró al Panel",   value: funnelUnique.dashboard.size,     color: "#6366F1" },
  ];
}

/**
 * Agrupa eventos por IP para mostrar "recorridos de usuario" (Traceability).
 * Ideal para ver qué hizo exactamente la persona de "un visitante".
 * 
 * Ahora mapea inteligentemente user_id -> IP para que los eventos del servidor
 * (como comprobantes subidos o aprobaciones de Admin) se unan a la sesión original.
 */
export function groupEventsBySession(events: FunnelEvent[]) {
  const sessions: Record<string, {
    ip: string;
    city: string | null;
    country_code: string | null;
    events: FunnelEvent[];
    lastActive: string;
  }> = {};

  // First pass: Build a mapping of user_id -> IP from client-side events
  const userIdToIp: Record<string, string> = {};
  for (const e of events) {
    if (e.metadata?.user_id && e.metadata?.ip_detected && e.metadata.ip_detected !== "unknown") {
      userIdToIp[e.metadata.user_id] = e.metadata.ip_detected;
    }
  }

  // Optimize: Iterate backwards (oldest to newest) to use push() instead of unshift() - O(N) performance
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    let ip = e.metadata?.ip_detected || "unknown";
    
    // Intelligent Session Merging:
    // If the event lacks a real IP (e.g. Server-Side event or Admin approval) 
    // but has a user_id, map it back to the user's original IP session!
    if (ip === "unknown" && e.metadata?.user_id && userIdToIp[e.metadata.user_id]) {
      ip = userIdToIp[e.metadata.user_id];
    } else if (ip === "unknown" && e.metadata?.user_email) {
      // Fallback: group by email if no IP is ever known
      ip = e.metadata.user_email;
    }
    
    if (!sessions[ip]) {
      sessions[ip] = {
        ip,
        city: e.city,
        country_code: e.country_code,
        events: [],
        lastActive: e.created_at
      };
    }
    
    // push() is O(1)
    sessions[ip].events.push(e);
    
    // Since we process oldest to newest, the last one seen is newer or equal
    // We update city/country if they arrive late (e.g. from GeoIP delayed response)
    if (e.city) sessions[ip].city = e.city;
    if (e.country_code) sessions[ip].country_code = e.country_code;
    
    // Update last active time without expensive Date instantiation
    if (e.created_at > sessions[ip].lastActive) {
      sessions[ip].lastActive = e.created_at;
    }
  }

  // Optimize: Use string comparison for ISO8601 dates instead of new Date().getTime()
  return Object.values(sessions).sort((a, b) => 
    b.lastActive.localeCompare(a.lastActive)
  );
}

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase";


// ── In-memory rate-limit (IP → timestamp) per warm worker ──
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 1000; 

let lastCleanup = Date.now();
function cleanupRateLimit() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  const cutoff = now - RATE_LIMIT_MS * 2;
  for (const [key, ts] of rateLimitMap) {
    if (ts < cutoff) rateLimitMap.delete(key);
  }
}

// Formato seguro para nombres de eventos (alfanumérico, guiones y barras bajas)
const EVENT_NAME_REGEX = /^[a-z0-9_-]{2,64}$/i;

export async function POST(request: Request) {
  try {
    cleanupRateLimit();
    const h = headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

    const body = await request.json().catch(() => ({}));
    const eventType = body.event_type;

    if (!eventType || typeof eventType !== "string" || !EVENT_NAME_REGEX.test(eventType)) {
      return NextResponse.json(
        { ok: false, error: "Invalid event_type. Must be 2-64 alphanumeric characters, dashes or underscores." },
        { status: 400 }
      );
    }

    // Per-event rate limit (IP + EventType) to allow fast navigation but stop refresh spam
    const rateLimitKey = `${ip}:${eventType}`;
    const lastEventTs = rateLimitMap.get(rateLimitKey);
    if (lastEventTs && Date.now() - lastEventTs < RATE_LIMIT_MS) {
      return NextResponse.json({ ok: true, throttled: true });
    }
    rateLimitMap.set(rateLimitKey, Date.now());

    const countryCode = h.get("x-vercel-ip-country") || null;
    const region = h.get("x-vercel-ip-country-region") || null;
    const city = h.get("x-vercel-ip-city") || null;
    const latStr = h.get("x-vercel-ip-latitude");
    const lngStr = h.get("x-vercel-ip-longitude");
    const userAgent = h.get("user-agent") || "unknown";
    
    const admin = createAdminClient();
    const bodyMetadata = (body && typeof body.metadata === "object") ? body.metadata : {};
    const userId = bodyMetadata.user_id || body.user_id || null;

    await admin.from("funnel_events").insert({
      event_type: eventType,
      country_code: countryCode,
      city: city,
      latitude: latStr ? parseFloat(latStr) : null,
      longitude: lngStr ? parseFloat(lngStr) : null,
      ip_detected: ip,
      metadata: { 
        ...bodyMetadata, 
        ...body, 
        user_id: userId, 
        ip_detected: ip, 
        region, 
        ua: userAgent,
        url: bodyMetadata.url || body.url || h.get("referer") || "",
        referer: bodyMetadata.referrer || bodyMetadata.referer || h.get("referer") || "",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("[Live Events POST]", error);
    return NextResponse.json({ ok: false, error: "Error al registrar evento." }, { status: 500 });
  }
}

let cachedData: Record<string, any> = {};
let lastFetch: Record<string, number> = {};
// Lightweight row counter (avoids expensive count(*) on every request)
let cachedTotalRows = 0;
let lastRowCountFetch = 0;
const ROW_COUNT_TTL = 120_000; // Refresh total row count every 2 minutes only

export async function GET(request: Request) {
  try {
    // --- Autenticación del Administrador ---
    // En producción podés conectar tu auth provider (Supabase Auth / NextAuth / Clerk)
    // o proteger el endpoint con middleware/header.
    // ----------------------------------------

    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get("timeframe") || "24h";
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const admin = createAdminClient();
    const now = Date.now();

    // ── Resolve range (ms) and aggregation bucket size ──
    // Hourly buckets for live ranges (< 48h), daily buckets for 7d / 30d / 365d / wide custom ranges
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;
    let ms = DAY;
    let bucketMs = HOUR;
    let startMs: number | null = null;
    let endMs: number | null = null;

    switch (timeframe) {
      case "1m": ms = 60 * 1000; break;
      case "5m": ms = 5 * 60 * 1000; break;
      case "15m": ms = 15 * 60 * 1000; break;
      case "1h": ms = HOUR; break;
      case "12h": ms = 12 * HOUR; break;
      case "7d": ms = 7 * DAY; bucketMs = DAY; break;
      case "30d": ms = 30 * DAY; bucketMs = DAY; break;
      case "365d": ms = 365 * DAY; bucketMs = DAY; break;
      case "custom": {
        const from = fromParam ? new Date(fromParam).getTime() : NaN;
        const to = toParam ? new Date(toParam).getTime() : NaN;
        if (!isNaN(from) && !isNaN(to) && from < to && from > 0) {
          startMs = from;
          endMs = to;
          ms = to - from;
          bucketMs = ms > 48 * HOUR ? DAY : HOUR;
        }
        break;
      }
    }
    // startMs se calcula DESPUÉS del switch para que `ms` refleje el rango elegido.
    if (startMs === null) startMs = now - ms;
    // Hard cap: never query more than 1 year of history
    startMs = Math.max(startMs, now - 365 * DAY);

    // SKILL.md Rule 29 & 43.13: Adaptive caching to protect CPU while maintaining "Live" accuracy
    // Short TTL (3s) for live ranges so the "Live" feeling is preserved;
    // longer TTL (60s) for historical ranges (7d+) to protect Vercel Fluid CPU / DB IO.
    const effectiveTTL = bucketMs >= DAY ? 60_000 : 3_000;
    const cacheKey = timeframe === "custom" ? `custom_${fromParam}_${toParam}` : timeframe;

    if (cachedData[cacheKey] && now - (lastFetch[cacheKey] || 0) < effectiveTTL) {
      return NextResponse.json(cachedData[cacheKey]);
    }

    const isExport = searchParams.get("mode") === "export";
    const exportLimit = isExport ? (ms > 7 * DAY ? 50000 : 10000) : 500;

    // Clock Skew Protection: Add 2 minutes buffer to the timeframe to account for
    // drift between Edge nodes and Database servers. This ensures "recent" events
    // are not cut off by clock difference while keeping the filter accurate.
    const startTime = new Date(startMs - 120000).toISOString();
    
    // For custom ranges, include the entire "to" day (date input is day-granularity)
    const endTime = endMs ? new Date(endMs + DAY - 1).toISOString() : null;

    // ── Optimized: 3 queries (Aggregates are pushed to DB) ──
    const eventsQuery = admin
      .from("funnel_events")
      .select("id, event_type, country_code, city, latitude, longitude, created_at, metadata")
      .gte("created_at", startTime)
      .order("created_at", { ascending: false })
      .limit(exportLimit);
    if (endTime) eventsQuery.lte("created_at", endTime);

    const paymentsQuery = admin
      .from("payments")
      .select("amount, created_at", { count: "exact" })
      .eq("status", "completed")
      .gte("created_at", startTime);
    if (endTime) paymentsQuery.lte("created_at", endTime);

    const [
      { data: feedEvents },
      { data: recentPayments, count: realPurchaseCount },
      { data: rpcStats }
    ] = await Promise.all([
      eventsQuery,
      paymentsQuery,
      admin.rpc("get_live_dashboard_stats", { start_time: startTime })
    ]);

    // ── Lazy row count refresh (every 2 min instead of every request) ──
    if (now - lastRowCountFetch > ROW_COUNT_TTL) {
      Promise.resolve(
        admin
          .from("funnel_events")
          .select("*", { count: "exact", head: true })
      )
        .then(({ count }) => {
          cachedTotalRows = count ?? cachedTotalRows;
          lastRowCountFetch = Date.now();
        })
        .catch(() => { /* keep stale count */ });
    }

    const totalRevenue = recentPayments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) ?? 0;
    
    // Parse RPC Stats
    const stats: any = rpcStats || { funnel: {}, intensity: [], regions: [], hourly: [] };

    // ── Generate trend timeline (hourly for live ranges, daily for 7d+) ──
    const isDaily = bucketMs >= DAY;
    const bucketCount = Math.min(Math.ceil(ms / bucketMs), 366);
    // Rangos en vivo (grilla horaria): mínimo 24 barras para conservar el contexto
    // temporal de la vista previa (comportamiento original de "24h"); los rangos
    // diarios (7d+) usan su conteo exacto de días.
    const bars = isDaily ? bucketCount : Math.max(bucketCount, 24);
    // Grilla alineada a hora ARG (UTC-3) que TERMINA en la hora actual (o el día de
    // fin del rango custom), para que las claves horarias del RPC siempre coincidan
    // y la barra más reciente nunca quede fuera del gráfico.
    const gridAnchor = endMs ? endMs + DAY - 1 : now;
    const gridEnd = Math.floor((gridAnchor - 3 * HOUR) / bucketMs) * bucketMs;
    const gridStart = gridEnd - (bars - 1) * bucketMs;
    const hourlyActivity: Record<string, any> = {};

    for (let i = 0; i < bars; i++) {
      const d = new Date(gridStart + i * bucketMs);
      if (isDaily) d.setUTCHours(0, 0, 0, 0);
      else d.setUTCMinutes(0, 0, 0);
      const isoKey = d.toISOString();
      hourlyActivity[isoKey] = {
        time: isoKey,
        landing: 0, simulation: 0, register: 0, dashboard: 0, billing: 0, checkout: 0, payment_intent: 0,
        click_paypal: 0, click_card: 0, purchase: 0
      };
    }

    // Merge RPC hourly data (summed into daily buckets when the range is daily-granular).
    // NOTE: the RPC aggregates from start_time → now, so for custom ranges ending before
    // today the trend/funnel include post-range events. Presets (7d/30d/365d) are exact.
    const METRIC_KEYS = ["landing", "simulation", "register", "dashboard", "billing", "checkout", "payment_intent", "click_paypal", "click_card", "purchase"];
    (stats.hourly || []).forEach((h: any) => {
      let key = h.time;
      if (isDaily) {
        const d = new Date(h.time);
        d.setUTCHours(0, 0, 0, 0);
        key = d.toISOString();
      }
      const slot = hourlyActivity[key];
      if (slot) {
        METRIC_KEYS.forEach(k => {
          if (typeof h[k] === "number") slot[k] = (slot[k] || 0) + h[k];
        });
      }
    });

    // Merge actual payments into purchase count
    (recentPayments || []).forEach(p => {
      if (!p.created_at) return;
      const pd = new Date(p.created_at);
      const pArgTime = pd.getTime() - (3 * 3600000);
      const argD = new Date(pArgTime);
      if (isDaily) argD.setUTCHours(0, 0, 0, 0);
      else argD.setUTCMinutes(0, 0, 0);
      const key = argD.toISOString();
      if (hourlyActivity[key]) {
        hourlyActivity[key].purchase = (hourlyActivity[key].purchase || 0) + 1;
      }
    });

    const trendData = Object.values(hourlyActivity).sort((a: any, b: any) => a.time.localeCompare(b.time));

    const labelsMap: Record<string, string> = {
      landing:        "Landing",
      simulation:     "Interacción Inicial",
      register:       "Registro",
      dashboard:      "Entró al Panel",
      checkout:       "Paso de Pago",
      billing:        "Intento Compra",
      payment_intent: "Click Pagar",
      purchase:       "Compra Confirmada"
    };

    const funnelMetrics = [
      { name: labelsMap.landing,        value: stats.funnel.landing || 0 },
      { name: labelsMap.simulation,     value: stats.funnel.simulation || 0 },
      { name: labelsMap.checkout,       value: stats.funnel.checkout || 0 },
      { name: labelsMap.payment_intent, value: stats.funnel.payment_intent || 0 },
      { name: labelsMap.purchase,       value: stats.funnel.purchase || 0 },
      { name: labelsMap.dashboard,      value: stats.funnel.dashboard || 0 },
    ];

    const responseData = {
      events: feedEvents ?? [],
      realPurchaseCount: realPurchaseCount ?? 0,
      totalRevenue,
      trendData,
      totalTableRows: cachedTotalRows,
      funnelMetrics,
      userIntensity: stats.intensity || [],
      serverTopRegions: stats.regions || []
    };
    
    // Don't cache exports
    if (!isExport) {
      cachedData[cacheKey] = responseData;
      lastFetch[cacheKey] = now;
    }

    return NextResponse.json(responseData);
  } catch (error: unknown) {
    console.error("[Live Events GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ events: [], realPurchaseCount: 0, totalRevenue: 0, trendData: [], totalTableRows: 0 });
  }
}

export async function DELETE() {
  try {
    const h = headers();
    const isAdminHeader = h.get("x-livefunnel-key");
    const isAuthorized = isAdminHeader === "livefunnel-admin-cleanup" || process.env.NODE_ENV === "development";

    if (!isAuthorized) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    // Delete all events from the table
    const { error } = await admin.from("funnel_events").delete().neq("id", "00000000-0000-0000-0000-000000000000"); // Standard way to clear table in Supabase if not using truncate

    if (error) throw error;
    
    // Clear caches
    cachedData = {};
    lastFetch = {};

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("[Live Events]", error);
    return NextResponse.json({ ok: false, error: "Error interno." }, { status: 500 });
  }
}

"use client";

import { useEffect, useRef } from "react";

/**
 * Componente invisible que emite un evento al funnel de Live Activity.
 * Usa navigator.sendBeacon() cuando está disponible (más eficiente, no bloquea).
 * No renderiza nada visible.
 */
export function LiveEventBeacon({ type, metadata }: { type: string; metadata?: Record<string, any> }) {
  const sent = useRef(false);

  useEffect(() => {
    // SECURITY LIMIT: Originalmente apagamos el tracking de landings masivas para no ahogar el plan gratuito.
    // El usuario ha solicitado activarlo para medir las visitas.
    // if (type === "landing") return;
    if (sent.current) return;
    sent.current = true;

    // SECURITY & PERFORMANCE: Evitar inundar la base de datos con eventos repetidos.
    // Aplicamos deduplicación estricta por sessionStorage para todos los eventos,
    // ya que en Vercel el map en memoria no funciona entre distintas instancias serverless.
    const cacheKey = `livefunnel_beacon_dedup_${type}`;
    const lastSent = sessionStorage.getItem(cacheKey);
    const now = Date.now();
    
    // 30 min para landing/dashboard, 15 segundos para el resto (evita doble click o Strict Mode)
    const timeout = (type.startsWith("dashboard") || type === "landing") ? (30 * 60 * 1000) : (15 * 1000);
    
    if (lastSent && now - parseInt(lastSent, 10) < timeout) {
      return; // Ya se envió este tipo de evento recientemente, abortar
    }
    
    sessionStorage.setItem(cacheKey, now.toString());

    const getVisitorSource = () => {
      if (typeof window === "undefined") return "Directo";
      
      const urlParams = new URLSearchParams(window.location.search);
      const utmSource = urlParams.get("utm_source");
      const gclid = urlParams.get("gclid");
      
      // 1. Google Ads (GCLID o utm_source=google_ads)
      if (gclid || utmSource?.toLowerCase().includes("ads")) return "Google Ads";
      
      // 2. UTM Source
      if (utmSource) return utmSource.charAt(0).toUpperCase() + utmSource.slice(1);
      
      // 3. Referrer
      const referrer = document.referrer;
      if (!referrer) return "Directo";
      
      const refLower = referrer.toLowerCase();
      if (refLower.includes("google.")) return "Google Search (SEO)";
      if (refLower.includes("bing.")) return "Bing Search";
      if (refLower.includes("facebook.com") || refLower.includes("fb.me")) return "Facebook";
      if (refLower.includes("instagram.com")) return "Instagram";
      if (refLower.includes("t.co") || refLower.includes("twitter.com") || refLower.includes("x.com")) return "Twitter / X";
      if (refLower.includes("whatsapp.com")) return "WhatsApp";
      if (refLower.includes("youtube.com")) return "YouTube";
      if (refLower.includes("tiktok.com")) return "TikTok";
      
      try {
        const url = new URL(referrer);
        return url.hostname.replace("www.", "");
      } catch {
        return "Referido";
      }
    };

    const clientUA = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const source = getVisitorSource();
    const referrer = typeof document !== "undefined" ? document.referrer : "";

    const payload = JSON.stringify({ 
      event_type: type, 
      metadata: { 
        ...metadata, 
        client_ua: clientUA,
        source: source,
        referrer: referrer,
        url: typeof window !== "undefined" ? window.location.href : ""
      } 
    });

    // sendBeacon es fire-and-forget, no bloquea navegación
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/live-events", blob);
    } else {
      // Fallback para navegadores sin sendBeacon
      fetch("/api/live-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {}); // Silencioso — no interrumpir UX
    }
  }, [type, metadata]);

  return null;
}

"use client";

/**
 * Registra un evento en vivo desde el cliente (navegador).
 * Diseñado para botones CTA, carritos, pasos de checkout y formularios.
 * Utiliza navigator.sendBeacon cuando está disponible para no interrumpir redirecciones de pago.
 */
export function track(eventType: string, metadata: Record<string, any> = {}) {
  if (typeof window === "undefined") return;

  const getVisitorSource = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const utmSource = urlParams.get("utm_source");
    const gclid = urlParams.get("gclid");

    if (gclid || utmSource?.toLowerCase().includes("ads")) return "Google Ads";
    if (utmSource) return utmSource.charAt(0).toUpperCase() + utmSource.slice(1);

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
      return new URL(referrer).hostname.replace("www.", "");
    } catch {
      return "Referido";
    }
  };

  const payload = JSON.stringify({
    event_type: eventType,
    metadata: {
      ...metadata,
      client_ua: navigator.userAgent || "",
      source: getVisitorSource(),
      referrer: document.referrer || "",
      url: window.location.href,
    },
  });

  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon("/api/live-events", blob);
  } else {
    fetch("/api/live-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }
}

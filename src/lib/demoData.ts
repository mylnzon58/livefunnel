import type { FunnelEvent } from "@/components/live/worldData";
import type { HourlyPoint } from "@/components/live/liveUtils";

export function generateDemoEvents(): FunnelEvent[] {
  const now = Date.now();
  const cities = [
    { city: "Buenos Aires", country: "AR", lat: -34.6037, lng: -58.3816, ip: "181.44.12.8" },
    { city: "Córdoba", country: "AR", lat: -31.4201, lng: -64.1888, ip: "190.19.45.22" },
    { city: "Rosario", country: "AR", lat: -32.9442, lng: -60.6505, ip: "186.130.88.9" },
    { city: "Ciudad de México", country: "MX", lat: 19.4326, lng: -99.1332, ip: "189.204.11.5" },
    { city: "Bogotá", country: "CO", lat: 4.7110, lng: -74.0721, ip: "191.102.55.19" },
    { city: "Santiago", country: "CL", lat: -33.4489, lng: -70.6693, ip: "190.160.77.3" },
    { city: "Madrid", country: "ES", lat: 40.4168, lng: -3.7038, ip: "83.50.12.99" },
    { city: "Miami", country: "US", lat: 25.7617, lng: -80.1918, ip: "104.28.19.4" }
  ];

  const events: FunnelEvent[] = [];

  cities.forEach((c, idx) => {
    const timeOffset = idx * 90 * 1000;
    const createdAt = new Date(now - timeOffset).toISOString();

    // 1. Landing
    events.push({
      id: `demo-land-${idx}`,
      event_type: "landing",
      country_code: c.country,
      city: c.city,
      latitude: c.lat,
      longitude: c.lng,
      metadata: {
        ip_detected: c.ip,
        source: idx % 2 === 0 ? "Google Ads" : "Google Search (SEO)",
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) AppleWebKit/605.1.15 Mobile/15E148"
      },
      created_at: new Date(now - timeOffset - 120000).toISOString()
    });

    // 2. Simulation / In-place checkout
    events.push({
      id: `demo-sim-${idx}`,
      event_type: "simulation",
      country_code: c.country,
      city: c.city,
      latitude: c.lat,
      longitude: c.lng,
      metadata: {
        ip_detected: c.ip,
        source: idx % 2 === 0 ? "Google Ads" : "Google Search (SEO)",
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) AppleWebKit/605.1.15 Mobile/15E148"
      },
      created_at: new Date(now - timeOffset - 60000).toISOString()
    });

    events.push({
      id: `demo-chk-${idx}`,
      event_type: "checkout_inplace",
      country_code: c.country,
      city: c.city,
      latitude: c.lat,
      longitude: c.lng,
      metadata: {
        ip_detected: c.ip,
        checkout_type: "simulation_inplace",
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) AppleWebKit/605.1.15 Mobile/15E148"
      },
      created_at: new Date(now - timeOffset - 30000).toISOString()
    });

    // 3. Purchase o Intent
    if (idx % 2 === 0) {
      events.push({
        id: `demo-pay-${idx}`,
        event_type: "click_mercadopago",
        country_code: c.country,
        city: c.city,
        latitude: c.lat,
        longitude: c.lng,
        metadata: {
          ip_detected: c.ip,
          source: "Google Ads"
        },
        created_at: new Date(now - timeOffset - 10000).toISOString()
      });

      events.push({
        id: `demo-pur-${idx}`,
        event_type: "purchase",
        country_code: c.country,
        city: c.city,
        latitude: c.lat,
        longitude: c.lng,
        metadata: {
          ip_detected: c.ip,
          amount: 19.99
        },
        created_at: createdAt
      });
    }
  });

  return events.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function generateDemoTrend(): HourlyPoint[] {
  const points: HourlyPoint[] = [];
  const now = new Date();

  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600 * 1000);
    d.setMinutes(0, 0, 0);
    const time = d.toISOString();

    points.push({
      time,
      landing: Math.floor(10 + Math.random() * 25),
      simulation: Math.floor(6 + Math.random() * 15),
      register: Math.floor(2 + Math.random() * 6),
      dashboard: Math.floor(1 + Math.random() * 4),
      checkout: Math.floor(4 + Math.random() * 10),
      billing: Math.floor(2 + Math.random() * 5),
      payment_intent: Math.floor(2 + Math.random() * 6),
      click_paypal: Math.floor(Math.random() * 3),
      click_card: Math.floor(Math.random() * 3),
      purchase: Math.floor(Math.random() * 2)
    });
  }

  return points;
}

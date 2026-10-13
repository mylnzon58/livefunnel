import { LiveActivityClient } from "@/components/LiveActivityClient";
import type { FunnelEvent } from "@/components/live/worldData";
import type { HourlyPoint } from "@/components/live/liveUtils";
import { generateDemoEvents, generateDemoTrend } from "@/lib/demoData";

export const dynamic = "force-dynamic";

export default function Home() {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
  const mapboxStyle = process.env.NEXT_PUBLIC_MAPBOX_STYLE || "mapbox://styles/mapbox/dark-v11";

  // Eventos iniciales de demostración para visualización inmediata
  const initialEvents: FunnelEvent[] = generateDemoEvents();
  const initialTrendData: HourlyPoint[] = generateDemoTrend();

  return (
    <main className="min-h-screen bg-background text-foreground py-6">
      <LiveActivityClient
        initialEvents={initialEvents}
        initialRealPurchaseCount={3}
        initialTotalRevenue24h={49.99}
        initialTrendData={initialTrendData}
        mapboxToken={mapboxToken}
        mapboxStyle={mapboxStyle}
      />
    </main>
  );
}

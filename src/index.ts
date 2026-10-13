// Componentes principales
export { LiveActivityClient } from "./components/LiveActivityClient";
export { LiveEventBeacon } from "./components/LiveEventBeacon";

// Componentes modulares de interfaz
export { LiveWorldMap } from "./components/live/LiveWorldMap";
export { LiveEventFeed } from "./components/live/LiveEventFeed";
export { LiveFunnelBar } from "./components/live/LiveFunnelBar";
export { LiveTopStats } from "./components/live/LiveTopStats";
export { LiveTrendChart } from "./components/live/LiveTrendChart";
export { LiveStorageMeter } from "./components/live/LiveStorageMeter";
export { EventIcon } from "./components/live/EventIcon";

// Utilidades de Tracking y SDK
export { track } from "./lib/track";
export { trackServer } from "./lib/server";
export type { ServerEventPayload } from "./lib/server";

// Funciones analíticas y tipados
export { groupEventsBySession, calculateFunnel, aggregateHourlyTrend, getTopStats } from "./components/live/liveUtils";
export type { HourlyPoint } from "./components/live/liveUtils";
export type { FunnelEvent } from "./components/live/worldData";

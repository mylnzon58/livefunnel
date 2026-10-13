/**
 * worldData.ts — Tipos y configuración visual para Live Activity Dashboard
 * El mapa usa Mapbox GL (mismo token/estilo que Dashboard Map).
 */

// ── Tipos ──
export interface FunnelEvent {
  id: string;
  event_type: string;
  country_code: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  metadata: Record<string, any>;
  created_at: string;
}

// ── Configuración visual de eventos ──
// Iconos usando nombres de Lucide React (se renderizan como SVG profesional)
export const EVENT_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  landing:          { color: "#3B82F6", label: "Visitó la landing",       icon: "Eye" },
  simulation:       { color: "#8B5CF6", label: "Interacción Inicial", icon: "Dices" },
  register:         { color: "#EC4899", label: "Inició registro",         icon: "UserPlus" },
  checkout:         { color: "#F59E0B", label: "Entró al checkout",       icon: "ShoppingCart" },
  terms:            { color: "#F97316", label: "Leyendo página legales",  icon: "FileText" },
  terms_accepted:   { color: "#10B981", label: "Aceptó Términos (Tácito)",icon: "CheckCircle" },
  purchase:         { color: "#10B981", label: "Compra confirmada",       icon: "PartyPopper" },
  abandon:          { color: "#EF4444", label: "Abandonó pago",           icon: "LogOut" },
  popup_blocked:    { color: "#DC2626", label: "Popup bloqueado",         icon: "Ban" },
  payment_error:    { color: "#B91C1C", label: "Error en pago",           icon: "AlertTriangle" },
  payment_rejected: { color: "#991B1B", label: "Tarjeta Rechazada",      icon: "XCircle" },
  sdk_error:        { color: "#7C3AED", label: "Error SDK PayPal",        icon: "Zap" },
  redirect_fallback:{ color: "#0EA5E9", label: "Redirigido a PayPal",     icon: "ExternalLink" },
  click_paypal:     { color: "#FACC15", label: "Click PayPal",            icon: "Wallet" },
  click_card:       { color: "#1F2937", label: "Click Tarjeta (SDK)",     icon: "CreditCard" },
  click_one:        { color: "#2563EB", label: "Click ONE.lat",           icon: "Globe" },
  click_one_card:   { color: "#1E293B", label: "Click Tarjeta (ONE)",     icon: "IdCard" },
  click_manual:     { color: "#38BDF8", label: "Click Pagar (Manual)",   icon: "Building" },
  payment_intent:   { color: "#F97316", label: "Intento de Pago",         icon: "Lock" },
  app_switch_resume:{ color: "#06B6D4", label: "Retorno App PayPal",      icon: "Smartphone" },
  one_error:        { color: "#7C3AED", label: "Error API ONE.lat",       icon: "AlertCircle" },
  dashboard:        { color: "#6366F1", label: "Entró al Panel",          icon: "LayoutDashboard" },
  billing:          { color: "#F43F5E", label: "Intento de Compra",        icon: "Gem" },
  click_incentive:  { color: "#A855F7", label: "Click en Oferta / CTA",   icon: "Zap" },
  manual_payment_submitted: { color: "#38BDF8", label: "Envió Comprobante", icon: "FileCheck" },
  checkout_inplace: { color: "#F59E0B", label: "Vio Checkout In-Place",    icon: "BarChart" },
  click_mercadopago:{ color: "#009EE3", label: "Click MercadoPago",       icon: "Handshake" },
  payment_success_redirect: { color: "#10B981", label: "Redirigido tras Pago", icon: "Rocket" },
  bot_blocked:      { color: "#52525B", label: "Bot Bloqueado (Honeypot)", icon: "Bot" },
};

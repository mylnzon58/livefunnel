import { createAdminClient } from "./supabase";

export interface ServerEventPayload {
  event_type: string;
  metadata?: {
    amount?: number;
    currency?: string;
    model?: "onetime" | "subscription";
    plan?: string;
    product_name?: string;
    gateway?: string;
    user_id?: string;
    ip?: string;
    client_ua?: string;
    [key: string]: any;
  };
}

/**
 * Registra un evento verificado desde el backend / webhooks de pago.
 * Inserta directamente en la tabla `funnel_events` de Supabase con service_role.
 */
export async function trackServer(
  eventType: string,
  metadata: ServerEventPayload["metadata"] = {}
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("funnel_events").insert({
      event_type: eventType,
      ip: metadata.ip || "127.0.0.1",
      city: "Online",
      region: "",
      country: "Global",
      metadata: {
        ...metadata,
        recorded_at: new Date().toISOString(),
      },
    });

    if (error) {
      console.error("[LiveFunnel Server Error]:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error("[LiveFunnel Server Exception]:", err);
    return { success: false, error: err.message };
  }
}

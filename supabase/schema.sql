-- ===============================================================
--  LIVEFUNNEL - ESQUEMA DE BASE DE DATOS
--  Para Supabase / PostgreSQL 14+
--  Pegar en Supabase -> SQL Editor -> Run
-- ===============================================================

-- 1. Tabla principal de eventos de funnel
CREATE TABLE IF NOT EXISTS public.funnel_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  country_code TEXT,
  city TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  ip_detected TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Índices de alta velocidad para lecturas y series temporales
CREATE INDEX IF NOT EXISTS idx_funnel_events_created 
  ON public.funnel_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_funnel_events_type_created 
  ON public.funnel_events (event_type, created_at DESC);

-- 3. Row Level Security (RLS)
ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read funnel_events" ON public.funnel_events
  FOR SELECT USING (true); -- Ajustar según tu política de perfiles

-- 4. RPC de Agregación de alto rendimiento: get_live_dashboard_stats
CREATE OR REPLACE FUNCTION public.get_live_dashboard_stats(start_time timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  result json;
BEGIN
  WITH events AS (
    SELECT 
      event_type, 
      created_at, 
      city, 
      country_code, 
      COALESCE(metadata->>'ip_detected', (metadata->>'user_id'), ip_detected) AS ip_detected,
      metadata->>'region' AS region
    FROM funnel_events
    WHERE created_at >= start_time
  ),
  funnel AS (
    SELECT 
      json_build_object(
        'landing', count(distinct case when event_type = 'landing' then ip_detected end),
        'simulation', count(distinct case when event_type = 'simulation' then ip_detected end),
        'register', count(distinct case when event_type = 'register' then ip_detected end),
        'checkout', count(distinct case when event_type IN ('checkout', 'checkout_inplace') then ip_detected end),
        'payment_intent', count(distinct case when event_type IN ('click_paypal', 'click_card', 'click_one', 'click_one_card', 'payment_intent', 'click_mercadopago', 'click_manual') then ip_detected end),
        'purchase', count(distinct case when event_type IN ('purchase', 'manual_payment_submitted') then ip_detected end),
        'dashboard', count(distinct case when event_type = 'dashboard' then ip_detected end)
      ) as metrics
    FROM events
  ),
  intensity AS (
    SELECT json_agg(row_to_json(t)) as users
    FROM (
      SELECT ip_detected as ip, count(*) as count
      FROM events
      WHERE ip_detected IS NOT NULL AND ip_detected != 'unknown'
      GROUP BY ip_detected
      ORDER BY count DESC
      LIMIT 5
    ) t
  ),
  regions AS (
    SELECT json_agg(row_to_json(r)) as top_regions
    FROM (
      SELECT 
        COALESCE(city, 'Desconocido') || ', ' || COALESCE(country_code, '??') || 
        CASE WHEN region IS NOT NULL AND region != '' THEN ' (' || region || ')' ELSE '' END as name,
        count(*) as count
      FROM events
      WHERE event_type IN ('landing', 'checkout', 'checkout_inplace')
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 10
    ) r
  ),
  hourly AS (
    SELECT json_agg(row_to_json(h)) as trend
    FROM (
      SELECT 
        to_char(date_trunc('hour', created_at - interval '3 hours'), 'YYYY-MM-DD"T"HH24:MI:SS.000"Z"') as time,
        count(case when event_type = 'landing' then 1 end)::int as landing,
        count(case when event_type = 'simulation' then 1 end)::int as simulation,
        count(case when event_type = 'register' then 1 end)::int as register,
        count(case when event_type IN ('checkout', 'checkout_inplace') then 1 end)::int as checkout,
        count(case when event_type IN ('click_paypal', 'click_card', 'click_one', 'click_one_card', 'payment_intent', 'click_mercadopago', 'click_manual') then 1 end)::int as payment_intent,
        count(case when event_type = 'click_paypal' then 1 end)::int as click_paypal,
        count(case when event_type = 'click_card' then 1 end)::int as click_card,
        count(case when event_type IN ('purchase', 'manual_payment_submitted') then 1 end)::int as purchase,
        count(case when event_type = 'dashboard' then 1 end)::int as dashboard
      FROM events
      GROUP BY 1
      ORDER BY 1 ASC
    ) h
  )
  SELECT json_build_object(
    'funnel', (SELECT metrics FROM funnel),
    'intensity', COALESCE((SELECT users FROM intensity), '[]'::json),
    'regions', COALESCE((SELECT top_regions FROM regions), '[]'::json),
    'hourly', COALESCE((SELECT trend FROM hourly), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$function$;

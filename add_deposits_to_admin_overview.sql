-- ====================================================================
--   RUN THIS SQL IN YOUR SUPABASE PROJECT'S SQL EDITOR
--   Adds today_deposits, yesterday_deposits, and lifetime_deposits to admin_overview view
-- ====================================================================

CREATE OR REPLACE VIEW public.admin_overview AS
SELECT 
  -- Total user balance liability
  (SELECT COALESCE(SUM(balance), 0) FROM public.profiles) as total_liability,
  
  -- Orders today (Karachi Timezone reset)
  (SELECT COUNT(*) FROM public.orders 
   WHERE (created_at AT TIME ZONE 'Asia/Karachi')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::date) as orders_today,
  
  -- Revenue today (sum of price for completed orders today, Karachi Timezone reset)
  (SELECT COALESCE(SUM(price), 0) FROM public.orders 
   WHERE status = 'COMPLETED' 
     AND (created_at AT TIME ZONE 'Asia/Karachi')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::date) as revenue_today,
  
  -- Cost today (dynamically using exchange_rate_PKR with 278.50 fallback, Karachi Timezone reset)
  (SELECT COALESCE(SUM(s.cost_price * COALESCE((SELECT CAST(val.value AS NUMERIC) FROM public.settings val WHERE val.key = 'exchange_rate_PKR'), 278.50)), 0) 
   FROM public.orders o
   JOIN public.services s ON o.product_id = s.service_id
   WHERE o.status = 'COMPLETED' 
     AND (o.created_at AT TIME ZONE 'Asia/Karachi')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::date) as cost_today,

  -- Profit today (revenue - cost today)
  (SELECT COALESCE(SUM(price), 0) FROM public.orders 
   WHERE status = 'COMPLETED' 
     AND (created_at AT TIME ZONE 'Asia/Karachi')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::date) -
  (SELECT COALESCE(SUM(s.cost_price * COALESCE((SELECT CAST(val.value AS NUMERIC) FROM public.settings val WHERE val.key = 'exchange_rate_PKR'), 278.50)), 0) 
   FROM public.orders o
   JOIN public.services s ON o.product_id = s.service_id
   WHERE o.status = 'COMPLETED' 
     AND (o.created_at AT TIME ZONE 'Asia/Karachi')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::date) as profit_today,
  
  -- Lifetime orders
  (SELECT COUNT(*) FROM public.orders) as orders_lifetime,
  
  -- Lifetime revenue
  (SELECT COALESCE(SUM(price), 0) FROM public.orders WHERE status = 'COMPLETED') as revenue_lifetime,
  
  -- Lifetime cost
  (SELECT COALESCE(SUM(s.cost_price * COALESCE((SELECT CAST(val.value AS NUMERIC) FROM public.settings val WHERE val.key = 'exchange_rate_PKR'), 278.50)), 0) 
   FROM public.orders o
   JOIN public.services s ON o.product_id = s.service_id
   WHERE o.status = 'COMPLETED') as cost_lifetime,

  -- Lifetime profit
  (SELECT COALESCE(SUM(price), 0) FROM public.orders WHERE status = 'COMPLETED') -
  (SELECT COALESCE(SUM(s.cost_price * COALESCE((SELECT CAST(val.value AS NUMERIC) FROM public.settings val WHERE val.key = 'exchange_rate_PKR'), 278.50)), 0) 
   FROM public.orders o
   JOIN public.services s ON o.product_id = s.service_id
   WHERE o.status = 'COMPLETED') as profit_lifetime,

  -- Today Deposits (Karachi Timezone reset)
  (SELECT COALESCE(SUM(
     CASE 
       WHEN UPPER(COALESCE(currency, 'PKR')) = 'USD' THEN amount * COALESCE((SELECT CAST(val.value AS NUMERIC) FROM public.settings val WHERE val.key = 'exchange_rate_PKR'), 278.50)
       ELSE amount 
     END
   ), 0) FROM public.deposits 
   WHERE status = 'APPROVED' 
     AND (created_at AT TIME ZONE 'Asia/Karachi')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::date) as today_deposits,

  -- Yesterday Deposits (Karachi Timezone reset)
  (SELECT COALESCE(SUM(
     CASE 
       WHEN UPPER(COALESCE(currency, 'PKR')) = 'USD' THEN amount * COALESCE((SELECT CAST(val.value AS NUMERIC) FROM public.settings val WHERE val.key = 'exchange_rate_PKR'), 278.50)
       ELSE amount 
     END
   ), 0) FROM public.deposits 
   WHERE status = 'APPROVED' 
     AND (created_at AT TIME ZONE 'Asia/Karachi')::date = ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi') - INTERVAL '1 day')::date) as yesterday_deposits,

  -- Lifetime Deposits (All time approved)
  (SELECT COALESCE(SUM(
     CASE 
       WHEN UPPER(COALESCE(currency, 'PKR')) = 'USD' THEN amount * COALESCE((SELECT CAST(val.value AS NUMERIC) FROM public.settings val WHERE val.key = 'exchange_rate_PKR'), 278.50)
       ELSE amount 
     END
   ), 0) FROM public.deposits 
   WHERE status = 'APPROVED') as lifetime_deposits;

-- Permissions configuration
REVOKE ALL ON public.admin_overview FROM PUBLIC;
REVOKE ALL ON public.admin_overview FROM anon;
REVOKE ALL ON public.admin_overview FROM authenticated;
GRANT SELECT ON public.admin_overview TO service_role;

-- ====================================================================
--   RUN THIS SQL IN YOUR SUPABASE PROJECT'S SQL EDITOR
--   Fixes admin_overview to use orders.cost_price (already in USD)
--   instead of joining with services table for cost_price.
--   Revenue = SUM(price) from COMPLETED orders (selling price, already in PKR)
--   Cost = SUM(cost_price * exchange_rate) from COMPLETED orders (cost in USD -> PKR)
--   Profit = Revenue - Cost
-- ====================================================================

CREATE OR REPLACE VIEW public.admin_overview AS
SELECT 
  -- Total user balance liability
  (SELECT COALESCE(SUM(balance), 0) FROM public.profiles) as total_liability,
  
  -- Orders today (Karachi Timezone reset)
  (SELECT COUNT(*) FROM public.orders 
   WHERE (created_at AT TIME ZONE 'Asia/Karachi')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::date) as orders_today,
  
  -- Revenue today = SUM of selling price (price) for completed orders today
  (SELECT COALESCE(SUM(price), 0) FROM public.orders 
   WHERE status = 'COMPLETED' 
     AND (created_at AT TIME ZONE 'Asia/Karachi')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::date) as revenue_today,
  
  -- Cost today = SUM of (cost_price * exchange_rate) for completed orders today
  -- cost_price is stored in USD on each order, multiply by PKR rate
  (SELECT COALESCE(SUM(cost_price * COALESCE((SELECT CAST(val.value AS NUMERIC) FROM public.settings val WHERE val.key = 'exchange_rate_PKR'), 278.50)), 0) 
   FROM public.orders
   WHERE status = 'COMPLETED' 
     AND (created_at AT TIME ZONE 'Asia/Karachi')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::date) as cost_today,

  -- Profit today = revenue_today - cost_today
  (SELECT COALESCE(SUM(price), 0) FROM public.orders 
    WHERE status = 'COMPLETED' 
      AND (created_at AT TIME ZONE 'Asia/Karachi')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::date) -
  (SELECT COALESCE(SUM(cost_price * COALESCE((SELECT CAST(val.value AS NUMERIC) FROM public.settings val WHERE val.key = 'exchange_rate_PKR'), 278.50)), 0) 
   FROM public.orders
   WHERE status = 'COMPLETED' 
     AND (created_at AT TIME ZONE 'Asia/Karachi')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::date) as profit_today,
  
  -- Lifetime orders
  (SELECT COUNT(*) FROM public.orders) as orders_lifetime,
  
  -- Lifetime revenue = SUM of all selling prices for completed orders
  (SELECT COALESCE(SUM(price), 0) FROM public.orders WHERE status = 'COMPLETED') as revenue_lifetime,
  
  -- Lifetime cost = SUM of (cost_price * exchange_rate) for all completed orders
  (SELECT COALESCE(SUM(cost_price * COALESCE((SELECT CAST(val.value AS NUMERIC) FROM public.settings val WHERE val.key = 'exchange_rate_PKR'), 278.50)), 0) 
   FROM public.orders
   WHERE status = 'COMPLETED') as cost_lifetime,

  -- Lifetime profit = revenue_lifetime - cost_lifetime
  (SELECT COALESCE(SUM(price), 0) FROM public.orders WHERE status = 'COMPLETED') -
  (SELECT COALESCE(SUM(cost_price * COALESCE((SELECT CAST(val.value AS NUMERIC) FROM public.settings val WHERE val.key = 'exchange_rate_PKR'), 278.50)), 0) 
   FROM public.orders
   WHERE status = 'COMPLETED') as profit_lifetime,

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

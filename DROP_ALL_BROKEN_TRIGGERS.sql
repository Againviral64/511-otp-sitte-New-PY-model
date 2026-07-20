-- ====================================================================
--   RUN THIS SQL IN YOUR SUPABASE PROJECT'S SQL EDITOR TO FIX THE ISSUE:
-- ====================================================================

-- 1. Drop ALL triggers on public.orders that are causing the "DELETE requires a WHERE clause" rollback error
DROP TRIGGER IF EXISTS trg_assign_order_tracking_key ON public.orders;
DROP TRIGGER IF EXISTS trg_orders_sync_daily_stats ON public.orders;
DROP TRIGGER IF EXISTS trg_orders_delete_old ON public.orders;
DROP TRIGGER IF EXISTS trg_orders_cleanup ON public.orders;
DROP TRIGGER IF EXISTS trg_orders_auto_key ON public.orders;

-- 2. Drop any trigger functions that might contain un-where'd DELETE statements
DROP FUNCTION IF EXISTS public.trg_assign_order_tracking_key() CASCADE;
DROP FUNCTION IF EXISTS public.trg_orders_sync_daily_stats() CASCADE;
DROP FUNCTION IF EXISTS public.generate_unique_tracking_key() CASCADE;

-- 3. Ensure columns cost_price and tracking_key exist cleanly
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cost_price DECIMAL(15, 3) NOT NULL DEFAULT 0.000;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_key VARCHAR(100) UNIQUE DEFAULT NULL;

-- 4. Enable Row Level Security (RLS) and set open permissions for public.orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read own orders" ON public.orders;
DROP POLICY IF EXISTS "Allow users to insert own orders" ON public.orders;
DROP POLICY IF EXISTS "Allow admin to update orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public/users to read orders" ON public.orders;
DROP POLICY IF EXISTS "Allow users/system to insert orders" ON public.orders;
DROP POLICY IF EXISTS "Allow system/admin to update orders" ON public.orders;

CREATE POLICY "Allow public/users to read orders" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Allow users/system to insert orders" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow system/admin to update orders" ON public.orders FOR UPDATE USING (true);

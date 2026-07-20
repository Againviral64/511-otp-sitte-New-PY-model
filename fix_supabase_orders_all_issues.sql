-- ====================================================================
--   MASTER FIX FOR SUPABASE ORDERS TABLE (RUN THIS IN SUPABASE SQL EDITOR)
-- ====================================================================

-- 1. Ensure columns cost_price & tracking_key exist
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cost_price DECIMAL(15, 3) NOT NULL DEFAULT 0.000;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_key VARCHAR(100) UNIQUE DEFAULT NULL;

-- 2. Enable Row Level Security (RLS) on public.orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing restrictive policies on public.orders if any
DROP POLICY IF EXISTS "Allow users to read own orders" ON public.orders;
DROP POLICY IF EXISTS "Allow users to insert own orders" ON public.orders;
DROP POLICY IF EXISTS "Allow admin to update orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public/users to read orders" ON public.orders;
DROP POLICY IF EXISTS "Allow users/system to insert orders" ON public.orders;
DROP POLICY IF EXISTS "Allow system/admin to update orders" ON public.orders;

-- 4. Create permissive RLS policies for orders
CREATE POLICY "Allow public/users to read orders" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Allow users/system to insert orders" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow system/admin to update orders" ON public.orders FOR UPDATE USING (true);

-- 5. Drop any problematic triggers on public.orders causing transaction rollbacks
DROP TRIGGER IF EXISTS trg_orders_sync_daily_stats ON public.orders;

-- 6. Tracking Key Auto-Generator Function & Trigger
CREATE OR REPLACE FUNCTION public.generate_unique_tracking_key()
RETURNS TEXT AS $$
DECLARE
  v_key TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    v_key := encode(gen_random_bytes(12), 'hex');
    SELECT EXISTS(SELECT 1 FROM public.orders WHERE tracking_key = v_key) INTO v_exists;
    IF NOT v_exists THEN
      RETURN v_key;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.trg_assign_order_tracking_key()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tracking_key IS NULL OR TRIM(NEW.tracking_key) = '' THEN
    NEW.tracking_key := public.generate_unique_tracking_key();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_assign_order_tracking_key ON public.orders;

CREATE TRIGGER trg_assign_order_tracking_key
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_assign_order_tracking_key();

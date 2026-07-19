-- ====================================================================
--   RUN THIS SQL IN YOUR SUPABASE PROJECT'S SQL EDITOR:
-- ====================================================================

-- 1. Create the physical table daily_admin_overview
CREATE TABLE IF NOT EXISTS public.daily_admin_overview (
  date DATE PRIMARY KEY,
  orders_count INTEGER NOT NULL DEFAULT 0,
  completed_orders INTEGER NOT NULL DEFAULT 0,
  revenue DECIMAL(15, 3) NOT NULL DEFAULT 0.000, -- in PKR
  cost DECIMAL(15, 3) NOT NULL DEFAULT 0.000,    -- in PKR
  profit DECIMAL(15, 3) NOT NULL DEFAULT 0.000,  -- in PKR
  new_signups INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Enable RLS for daily_admin_overview if needed, or make it open for authenticated admin
ALTER TABLE public.daily_admin_overview ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read daily_admin_overview" 
ON public.daily_admin_overview FOR SELECT 
TO authenticated 
USING (true);

-- 2. Create the sync function to aggregate data for a specific Karachi date
CREATE OR REPLACE FUNCTION public.sync_daily_admin_overview(target_date DATE)
RETURNS VOID AS $$
DECLARE
    v_start_time TIMESTAMPTZ;
    v_end_time TIMESTAMPTZ;
    v_pkr_rate DECIMAL(15, 3);
    v_total_orders INTEGER;
    v_completed_orders INTEGER;
    v_revenue DECIMAL(15, 3);
    v_cost_usd DECIMAL(15, 3);
    v_cost_pkr DECIMAL(15, 3);
    v_new_signups INTEGER;
BEGIN
    -- A. Calculate the UTC boundaries for the target date in Karachi Timezone
    v_start_time := (target_date || ' 00:00:00+05')::TIMESTAMPTZ;
    v_end_time := (target_date || ' 23:59:59+05')::TIMESTAMPTZ;

    -- B. Fetch the PKR exchange rate from the settings table
    SELECT COALESCE(CAST(value AS DECIMAL(15,3)), 278.50) INTO v_pkr_rate
    FROM public.settings
    WHERE key = 'exchange_rate_PKR';

    -- C. Calculate order aggregates (orders count, completed count, revenue, cost)
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'COMPLETED'),
        COALESCE(SUM(price) FILTER (WHERE status = 'COMPLETED'), 0),
        COALESCE(SUM(cost_price) FILTER (WHERE status = 'COMPLETED'), 0)
    INTO v_total_orders, v_completed_orders, v_revenue, v_cost_usd
    FROM public.orders
    WHERE created_at >= v_start_time AND created_at <= v_end_time;

    v_cost_pkr := v_cost_usd * v_pkr_rate;

    -- D. Calculate signup count for profiles
    SELECT COUNT(*) INTO v_new_signups
    FROM public.profiles
    WHERE created_at >= v_start_time AND created_at <= v_end_time;

    -- E. Upsert (Insert or Update) into the daily_admin_overview table
    INSERT INTO public.daily_admin_overview (
        date,
        orders_count,
        completed_orders,
        revenue,
        cost,
        profit,
        new_signups,
        updated_at
    ) VALUES (
        target_date,
        v_total_orders,
        v_completed_orders,
        v_revenue,
        v_cost_pkr,
        v_revenue - v_cost_pkr,
        v_new_signups,
        NOW()
    )
    ON CONFLICT (date) DO UPDATE SET
        orders_count = EXCLUDED.orders_count,
        completed_orders = EXCLUDED.completed_orders,
        revenue = EXCLUDED.revenue,
        cost = EXCLUDED.cost,
        profit = EXCLUDED.profit,
        new_signups = EXCLUDED.new_signups,
        updated_at = EXCLUDED.updated_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create Trigger Function for public.orders inserts and updates
CREATE OR REPLACE FUNCTION public.trg_orders_sync_daily_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.created_at IS NOT NULL THEN
        PERFORM public.sync_daily_admin_overview((NEW.created_at AT TIME ZONE 'Asia/Karachi')::DATE);
    END IF;
    
    IF TG_OP = 'UPDATE' AND OLD.created_at IS NOT NULL THEN
        IF (OLD.created_at AT TIME ZONE 'Asia/Karachi')::DATE <> (NEW.created_at AT TIME ZONE 'Asia/Karachi')::DATE THEN
            PERFORM public.sync_daily_admin_overview((OLD.created_at AT TIME ZONE 'Asia/Karachi')::DATE);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger to public.orders
DROP TRIGGER IF EXISTS trg_orders_sync_daily_stats ON public.orders;
CREATE TRIGGER trg_orders_sync_daily_stats
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_orders_sync_daily_stats();

-- 4. Create Trigger Function for public.profiles inserts
CREATE OR REPLACE FUNCTION public.trg_profiles_sync_daily_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.created_at IS NOT NULL THEN
        PERFORM public.sync_daily_admin_overview((NEW.created_at AT TIME ZONE 'Asia/Karachi')::DATE);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger to public.profiles
DROP TRIGGER IF EXISTS trg_profiles_sync_daily_stats ON public.profiles;
CREATE TRIGGER trg_profiles_sync_daily_stats
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trg_profiles_sync_daily_stats();

-- 5. Backfill all existing dates in the orders table to initialize daily_admin_overview
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT DISTINCT (created_at AT TIME ZONE 'Asia/Karachi')::DATE as order_date 
        FROM public.orders 
        WHERE created_at IS NOT NULL
        ORDER BY order_date ASC
    LOOP
        PERFORM public.sync_daily_admin_overview(r.order_date);
    END LOOP;
END;
$$;

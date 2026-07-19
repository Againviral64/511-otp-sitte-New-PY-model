-- Create stock_adding table in Supabase
CREATE TABLE IF NOT EXISTS public.stock_adding (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_id VARCHAR(100) NOT NULL,
  service_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(100) NOT NULL,
  sms_url TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'available',
  order_id VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  used_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- Index for quick lookup of available stock by service
CREATE INDEX IF NOT EXISTS idx_stock_adding_service_status ON public.stock_adding(service_id, status);

-- Enable Row Level Security (RLS)
ALTER TABLE public.stock_adding ENABLE ROW LEVEL SECURITY;

-- Policy to allow full access for authenticated/anon operations (service_role bypasses RLS automatically)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'stock_adding' AND policyname = 'Allow all access to stock_adding'
    ) THEN
        CREATE POLICY "Allow all access to stock_adding" ON public.stock_adding
            FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

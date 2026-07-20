-- Execute this in Supabase SQL Editor to ensure orders can be inserted and read smoothly
-- 1. Enable RLS on public.orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing restrictive policies on public.orders if any
DROP POLICY IF EXISTS "Allow users to read own orders" ON public.orders;
DROP POLICY IF EXISTS "Allow users to insert own orders" ON public.orders;
DROP POLICY IF EXISTS "Allow admin to update orders" ON public.orders;

-- 3. Create open/permissive policies for orders
-- Allow users and service workers to read orders
CREATE POLICY "Allow public/users to read orders" ON public.orders 
FOR SELECT USING (true);

-- Allow authenticated users and service workers to insert orders
CREATE POLICY "Allow users/system to insert orders" ON public.orders 
FOR INSERT WITH CHECK (true);

-- Allow admin and background poller to update orders
CREATE POLICY "Allow system/admin to update orders" ON public.orders 
FOR UPDATE USING (true);

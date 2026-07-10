-- Supabase SQL Migration: Rename deposits table tx_id column to account_name
-- You can run this inside your Supabase SQL Editor.
-- Note: The website API includes dual-mode fallback logic that automatically supports both column names transparently!

ALTER TABLE deposits RENAME COLUMN tx_id TO account_name;

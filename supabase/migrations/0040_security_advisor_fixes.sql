-- Migration 0040: Security advisor fixes
-- 1. Enable RLS on tenants table (had policies but RLS was disabled)
-- 2. Fix search_path on functions (security advisor warning)

-- Enable RLS on tenants table.
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Fix search_path on functions (security advisor: function_search_path_mutable).
ALTER FUNCTION public.cleanup_rate_limits() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.update_updated_at() SET search_path = public;

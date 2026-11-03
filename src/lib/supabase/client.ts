'use client';
import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_KEY, SUPABASE_URL } from './env';

export function browserClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
}

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient as createRawClient } from '@supabase/supabase-js';

// Used in server components / route handlers, respects the logged-in user's session + RLS
export function createServerSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

// Admin client for trusted server-only operations (e.g. the sync job writing events).
// Requires SUPABASE_SERVICE_ROLE_KEY - never expose this key to the browser.
export function createAdminSupabase() {
  return createRawClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

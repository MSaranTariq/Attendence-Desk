import { redirect } from 'next/navigation';
import { createServerSupabase } from '../lib/supabaseServer';

export default async function Home() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  redirect(user ? '/dashboard' : '/login');
}

'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';

export default function SignOutButton() {
  const supabase = createClient();
  const router = useRouter();

  return (
    <button
      className="btn btn-secondary"
      onClick={async () => {
        await supabase.auth.signOut();
        router.push('/login');
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}

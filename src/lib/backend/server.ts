import { PostgrestClient } from '@supabase/postgrest-js';
import { currentUser, internalJwt } from './auth';

export function getAdminClient() {
  if (!process.env.POSTGREST_URL) throw new Error('POSTGREST_URL belum dikonfigurasi');
  return new PostgrestClient(process.env.POSTGREST_URL, {
    headers: { Authorization: `Bearer ${internalJwt({ role: 'service_role' })}` },
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(30000) }),
  });
}
export function createServerSupabaseClient() {
  return { auth: { getUser: async () => ({ data: { user: await currentUser() }, error: null }) } };
}

'use client';
import { PostgrestClient } from '@supabase/postgrest-js';

async function authRequest(action: string, body?: object) {
  try {
    const response = await fetch(`/api/auth/${action}`, {
      method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok) return { data: { user: null }, error: { message: result.message || result.error || 'Permintaan gagal' } };
    return result;
  } catch { return { data: { user: null }, error: { message: 'Tidak dapat menghubungi backend' } }; }
}
let client: ReturnType<typeof makeClient> | undefined;
function makeClient() {
  // Only PostgREST query syntax is reused. No Supabase host, Auth, or realtime service.
  const base = typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin;
  const rest = new PostgrestClient(`${base}/api/data`, {
    fetch: async (input, init) => {
      const response = await fetch(input, { ...init, credentials: 'same-origin', cache: 'no-store' });
      if (response.status === 401 && typeof window !== 'undefined' && !['/login','/daftar','/aktivasi'].includes(window.location.pathname)) window.location.replace('/login');
      return response;
    },
  });
  return Object.assign(rest, { auth: {
    getUser: () => authRequest('user'),
    signInWithPassword: (body: { email: string; password: string }) => authRequest('login', body),
    signOut: () => authRequest('logout', {}),
    updateUser: (body: { password: string }) => authRequest('password', body),
  } });
}
export function createClient() { return client ||= makeClient(); }

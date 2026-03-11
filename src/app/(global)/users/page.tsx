'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Redirect ke halaman admin/users yang sudah implementasi penuh
export default function UsersPageRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/users');
  }, [router]);
  return null;
}

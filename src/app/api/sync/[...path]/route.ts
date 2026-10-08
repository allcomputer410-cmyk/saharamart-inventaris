import { NextRequest } from 'next/server';
import { proxy } from '@/lib/backend/proxy';
export const dynamic = 'force-dynamic';
function handler(request: NextRequest, { params }: { params: { path: string[] } }) { return proxy(request, params.path, true); }
export { handler as GET, handler as HEAD, handler as POST, handler as PATCH, handler as DELETE };

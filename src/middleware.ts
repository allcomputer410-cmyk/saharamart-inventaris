import { NextRequest, NextResponse } from 'next/server';
// Cookie presence only controls navigation; every API validates the server-side session.
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith('/api/') || ['/login','/daftar','/aktivasi'].some(p=>path===p)) return NextResponse.next();
  if (!request.cookies.get('inventory_session')?.value) return NextResponse.redirect(new URL('/login',request.url));
  return NextResponse.next();
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json)$).*)'] };

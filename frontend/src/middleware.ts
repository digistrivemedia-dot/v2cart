import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect admin/vendor routes at the edge (basic cookie-presence check —
  // RoleGuard does the real role check client-side, and every API route is
  // independently enforced server-side regardless of what the client sends).
  if (pathname.startsWith('/admin') || pathname.startsWith('/vendor') || pathname.startsWith('/investor')) {
    // Check if user has auth token (basic check)
    // Note: For proper security, you should verify the token and role on the server
    const token = request.cookies.get('token')?.value;

    if (!token) {
      // Redirect to login if not authenticated
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/vendor/:path*',
    '/investor/:path*',
  ],
};

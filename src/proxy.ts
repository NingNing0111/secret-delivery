import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const retrieval = request.nextUrl.pathname.startsWith('/k/') || request.nextUrl.pathname.startsWith('/api/secret/');
  const prefetch = request.headers.has('next-router-prefetch') ||
    /prefetch/i.test(request.headers.get('purpose') ?? '') ||
    /prefetch/i.test(request.headers.get('sec-purpose') ?? '');
  const response = retrieval && (request.method === 'HEAD' || prefetch)
    ? new NextResponse(null, { status: 204 }) : NextResponse.next();
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}
export const config = { matcher: ['/k/:path*', '/api/:path*', '/admin/:path*'] };

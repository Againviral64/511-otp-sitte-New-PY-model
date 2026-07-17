import { NextResponse } from 'next/server';

export function middleware(request) {
    const origin = request.headers.get('origin');
    const pathname = request.nextUrl.pathname;

    // We only apply CORS security rules to API endpoints
    if (pathname.startsWith('/api/')) {
        
        // 1. Check if it's a Public Developer API (under /api/v1/)
        if (pathname.startsWith('/api/v1/')) {
            // Preflight OPTIONS request for developer APIs
            if (request.method === 'OPTIONS') {
                return new NextResponse(null, {
                    status: 204,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                        'Access-Control-Max-Age': '86400',
                    }
                });
            }

            // Normal response headers for developer APIs
            const response = NextResponse.next();
            response.headers.set('Access-Control-Allow-Origin', '*');
            response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            return response;
        }

        // 2. Internal Web App APIs (CORS restrictions apply)
        const allowedOrigins = process.env.ALLOWED_ORIGINS 
            ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) 
            : [];

        const requestUrl = new URL(request.url);
        const isSameOrigin = origin === requestUrl.origin;
            
        // Check if origin is allowed (allow requests without origin header, e.g. curl, server-to-server fetches)
        const isAllowed = !origin || 
                          isSameOrigin ||
                          allowedOrigins.includes(origin) || 
                          (process.env.NODE_ENV === 'development' && origin.startsWith('http://localhost'));

        // Handle preflight OPTIONS requests for internal APIs
        if (request.method === 'OPTIONS') {
            if (origin && isAllowed) {
                return new NextResponse(null, {
                    status: 204,
                    headers: {
                        'Access-Control-Allow-Origin': origin,
                        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
                        'Access-Control-Allow-Credentials': 'true',
                        'Access-Control-Max-Age': '86400',
                    }
                });
            } else {
                return new NextResponse(
                    JSON.stringify({ success: false, message: 'CORS Blocked: Origin not allowed.' }),
                    {
                        status: 403,
                        headers: { 'Content-Type': 'application/json' }
                    }
                );
            }
        }

        // Block request if origin is not allowed
        if (origin && !isAllowed) {
            return new NextResponse(
                JSON.stringify({ success: false, message: 'CORS Blocked: Origin not allowed.' }),
                {
                    status: 403,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }

        // Set headers for allowed internal API requests
        const response = NextResponse.next();
        if (origin && isAllowed) {
            response.headers.set('Access-Control-Allow-Origin', origin);
            response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
            response.headers.set('Access-Control-Allow-Credentials', 'true');
        }
        return response;
    }

    return NextResponse.next();
}

// Config to match only API routes
export const config = {
    matcher: '/api/:path*',
};

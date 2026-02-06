import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware - Route Protection
 * Protege rutas privadas (/cuenta, /admin) verificando autenticación
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Verificar autenticación mediante refreshToken cookie (HttpOnly desde backend)
  const refreshToken = request.cookies.get('refreshToken');
  const isAuthenticated = !!refreshToken;

  // TODO: Para verificar roles, necesitaríamos:
  // 1. Decodificar el JWT del refreshToken (requiere librería jose o similar)
  // 2. O hacer una llamada al backend /auth/me (costo en latencia)
  // Por ahora, para MVP, permitimos acceso a /cuenta si está autenticado
  // y no protegemos /admin (se protege en el layout)
  let userRole: string | null = null;

  // Intentar decodificar el JWT básicamente (sin verificar firma)
  // Solo para obtener el rol del payload
  if (refreshToken?.value) {
    try {
      // JWT format: header.payload.signature
      const parts = refreshToken.value.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        userRole = payload.role || null;
      }
    } catch {
      // Si falla la decodificación, considerar sin rol
      userRole = null;
    }
  }

  const isAdmin = userRole === 'admin' || userRole === 'owner';

  // ============================================================================
  // Protección de /cuenta/* - Solo usuarios autenticados
  // ============================================================================
  if (pathname.startsWith('/cuenta')) {
    if (!isAuthenticated) {
      // Redirigir a login con URL de retorno
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Autenticado, permitir acceso
    return NextResponse.next();
  }

  // ============================================================================
  // Protección de /admin/* - Solo admin/owner
  // ============================================================================
  if (pathname.startsWith('/admin')) {
    if (!isAuthenticated) {
      // No autenticado, redirigir a login
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (!isAdmin) {
      // Autenticado pero no admin/owner, redirigir a login
      // En MVP no creamos página 403, solo redirigimos a login
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    // Admin/owner autenticado, permitir acceso
    return NextResponse.next();
  }

  // ============================================================================
  // Redirigir usuarios autenticados desde /login o /registro a /cuenta
  // ============================================================================
  if ((pathname === '/login' || pathname === '/registro') && isAuthenticated) {
    return NextResponse.redirect(new URL('/cuenta', request.url));
  }

  // Permitir acceso a rutas públicas
  return NextResponse.next();
}

/**
 * Matcher Config
 * Define qué rutas ejecutan el middleware
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ]
};

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware - Route Protection
 * Protege rutas privadas (/cuenta, /admin) verificando autenticación
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Obtener sesión desde localStorage (simulado via cookie en SSR)
  // En producción real, verificaríamos JWT en cookie HttpOnly
  // Para MVP con mock, verificamos si existe el storage key 'session'
  const sessionCookie = request.cookies.get('mock_session');

  // Helper para verificar si hay sesión activa
  const isAuthenticated = !!sessionCookie;

  // Helper para verificar rol de admin/owner
  // En producción real, decodificaríamos JWT
  // Para MVP, parseamos el valor de la cookie
  let userRole: string | null = null;
  if (sessionCookie?.value) {
    try {
      const sessionData = JSON.parse(decodeURIComponent(sessionCookie.value));
      userRole = sessionData?.user?.role || null;
    } catch {
      // Cookie inválida, considerar no autenticado
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

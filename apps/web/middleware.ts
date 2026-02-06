import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware - Route Protection
 *
 * IMPORTANTE: En arquitectura con dominios separados (Vercel + Railway),
 * las cookies HttpOnly del backend NO están disponibles en el middleware de Next.js.
 *
 * Para MVP, la autenticación se maneja del lado del cliente:
 * - El cliente guarda accessToken en localStorage
 * - Las páginas protegidas verifican auth en useEffect y redirigen si no está autenticado
 * - El middleware solo maneja redirects de usuarios YA autenticados desde /login
 */
export function middleware(_request: NextRequest) {
  // Por ahora, no verificamos autenticación en el middleware
  // porque no podemos acceder a localStorage desde aquí
  // La verificación se hace en el cliente con useEffect

  // Permitir acceso a todas las rutas
  // Las páginas protegidas se encargarán de verificar auth del lado del cliente
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

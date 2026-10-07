'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

// Códigos que manda el backend en /login?error=<code> (oauth.service.ts)
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: 'No pudimos iniciar sesión con Google. Probá de nuevo.',
  oauth_state: 'La sesión de Google expiró. Probá de nuevo.',
  email_unverified: 'Tu email de Google no está verificado.',
  account_inactive: 'Tu cuenta está desactivada. Contactanos.',
  oauth_unavailable: 'El ingreso con Google no está disponible en este momento.'
};

/** Muestra una sola vez el error del login con Google. Debe renderizarse dentro de <Suspense>. */
export function OAuthErrorToast() {
  const error = useSearchParams().get('error');
  const shown = useRef(false);

  useEffect(() => {
    if (!error || shown.current) return;
    shown.current = true;
    toast.error(OAUTH_ERROR_MESSAGES[error] ?? OAUTH_ERROR_MESSAGES.oauth_failed);
  }, [error]);

  return null;
}

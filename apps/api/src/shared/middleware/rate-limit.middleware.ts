import { rateLimit } from 'express-rate-limit';
import type { Request } from 'express';

/**
 * El webhook de MP queda exento del rate limiter: una ráfaga de notificaciones
 * legítimas no debe recibir 429. El endpoint ya está protegido por firma HMAC
 * (rechazo rápido con 400 si no valida).
 * Nota: el limiter se monta en app.use('/api', ...), por eso req.path llega
 * sin el prefijo /api.
 */
export function isMpWebhookRequest(req: Request): boolean {
  return req.method === 'POST' && req.path === '/payments/webhook';
}

/**
 * General API rate limiter: 100 requests per minute per IP
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: isMpWebhookRequest,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Demasiadas solicitudes. Intente nuevamente en un minuto.'
    }
  }
});

/**
 * Stricter limiter for auth endpoints: 10 requests per 15 minutes per IP
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Demasiados intentos. Intente nuevamente en 15 minutos.'
    }
  }
});

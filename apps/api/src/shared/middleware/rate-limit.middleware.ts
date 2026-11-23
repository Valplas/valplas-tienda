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

/** Push de Andreani: server-to-server, protegido por Basic auth; no debe recibir 429. */
export function isAndreaniWebhookRequest(req: Request): boolean {
  return req.method === 'POST' && req.path === '/webhooks/andreani';
}

/**
 * La API del bot tiene su propio limiter (botRateLimiter): todo el tráfico de WhatsApp sale
 * de la IP del servidor del bot y con 100/min por IP se cortaría con pocos clientes a la vez.
 */
export function isBotApiRequest(req: Request): boolean {
  return req.path.startsWith('/bot/');
}

/**
 * General API rate limiter: 100 requests per minute per IP
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => isMpWebhookRequest(req) || isAndreaniWebhookRequest(req) || isBotApiRequest(req),
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Demasiadas solicitudes. Intente nuevamente en un minuto.'
    }
  }
});

/**
 * Limiter de la API del bot: 600 requests por minuto por IP. Va antes de la validación de la
 * API key, así también frena intentos con keys inválidas.
 */
export const botRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Demasiadas solicitudes del bot. Intente nuevamente en un minuto.'
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

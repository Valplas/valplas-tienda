// apps/api/src/infrastructure/external/andreani/http-client.ts
//
// Cliente HTTP de Andreani (fetch nativo). Login Basic -> token en `x-authorization-token`
// (cacheado 23 h, un único login en vuelo). Ante un 401 se descarta el token, se reloguea y se
// reintenta una vez. Timeouts con AbortController + setTimeout (8 s cotizaciones, 15 s el resto).

import { logger } from '../../logger/index.js';
import type { AndreaniConfig } from './config.js';
import { AndreaniError, type AndreaniFieldError } from './errors.js';
import type {
  AndreaniBranch,
  AndreaniCancellationStatus,
  AndreaniClient,
  AndreaniCreateOrderRequest,
  AndreaniCreateOrderResult,
  AndreaniLocality,
  AndreaniOrderResponse,
  AndreaniQuote,
  AndreaniQuoteInput,
  AndreaniTraceEvent
} from './types.js';

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

const TOKEN_HEADER = 'x-authorization-token';
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;
const QUOTE_TIMEOUT_MS = 8000;
const DEFAULT_TIMEOUT_MS = 15000;

interface RawResponse {
  status: number;
  headers: Headers;
  body: Buffer;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /** false = endpoint público (sin token ni reintento por 401). */
  authenticated?: boolean;
}

function parseJson(raw: Buffer): unknown {
  if (raw.length === 0) return undefined;
  try {
    return JSON.parse(raw.toString('utf-8'));
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function toError(res: RawResponse): AndreaniError {
  const parsed = asRecord(parseJson(res.body));
  const fieldErrors: AndreaniFieldError[] = Array.isArray(parsed.errors)
    ? parsed.errors.map((e) => {
        const item = asRecord(e);
        return { field: String(item.field ?? ''), message: String(item.message ?? '') };
      })
    : [];
  const base =
    (typeof parsed.detail === 'string' && parsed.detail) ||
    (typeof parsed.title === 'string' && parsed.title) ||
    `Andreani respondió HTTP ${res.status}`;
  const message = fieldErrors.length
    ? `${base} (${fieldErrors.map((f) => `${f.field}: ${f.message}`).join('; ')})`
    : base;
  const opts = { status: res.status, fieldErrors };

  if (res.status === 401 || res.status === 403) return new AndreaniError('AUTH', message, opts);
  if (res.status === 404) return new AndreaniError('NOT_FOUND', message, opts);
  if (res.status === 408) return new AndreaniError('TIMEOUT', message, opts);
  if (res.status === 429 || res.status >= 500) return new AndreaniError('UPSTREAM', message, opts);
  return new AndreaniError('VALIDATION', message, opts);
}

function requireObject(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AndreaniError('UPSTREAM', `Andreani devolvió una respuesta inválida (${what})`);
  }
  return value as Record<string, unknown>;
}

function toOrderResponse(value: unknown): AndreaniOrderResponse {
  const obj = requireObject(value, 'orden de envío');
  if (!Array.isArray(obj.bultos)) {
    throw new AndreaniError('UPSTREAM', 'Andreani devolvió una orden de envío sin bultos');
  }
  return obj as unknown as AndreaniOrderResponse;
}

function toNumber(value: unknown, what: string): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (value === '' || value === null || !Number.isFinite(n)) {
    throw new AndreaniError('UPSTREAM', `Andreani devolvió ${what} inválido: ${String(value)}`);
  }
  return n;
}

export function createHttpAndreaniClient(
  cfg: AndreaniConfig,
  fetchImpl: typeof fetch = fetch
): AndreaniClient {
  let token: { value: string; expiresAt: number } | null = null;
  let loginInFlight: Promise<string> | null = null;

  async function rawFetch(url: string, init: FetchInit, timeoutMs: number): Promise<RawResponse> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const res = await fetchImpl(url, { ...init, signal: controller.signal });
      const body = Buffer.from(await res.arrayBuffer());
      return { status: res.status, headers: res.headers, body };
    } catch (e) {
      if (timedOut || (e instanceof Error && e.name === 'AbortError')) {
        throw new AndreaniError('TIMEOUT', `Andreani no respondió en ${timeoutMs} ms`);
      }
      throw new AndreaniError(
        'NETWORK',
        `Error de red al contactar a Andreani: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function doLogin(): Promise<string> {
    const basic = Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
    const res = await rawFetch(
      `${cfg.baseUrl}/login`,
      { method: 'GET', headers: { Authorization: `Basic ${basic}` } },
      DEFAULT_TIMEOUT_MS
    );
    if (res.status < 200 || res.status >= 300) {
      const err = toError(res);
      // Credenciales rechazadas en el login siempre son AUTH, no VALIDATION.
      throw err.code === 'VALIDATION'
        ? new AndreaniError('AUTH', err.message, { status: res.status })
        : err;
    }
    const value =
      res.headers.get(TOKEN_HEADER) || String(asRecord(parseJson(res.body)).token ?? '');
    if (!value) {
      throw new AndreaniError('AUTH', 'Andreani no devolvió token en el login', {
        status: res.status
      });
    }
    token = { value, expiresAt: Date.now() + TOKEN_TTL_MS };
    return value;
  }

  function getToken(): Promise<string> {
    if (token && token.expiresAt > Date.now()) return Promise.resolve(token.value);
    if (!loginInFlight) {
      loginInFlight = doLogin().finally(() => {
        loginInFlight = null;
      });
    }
    return loginInFlight;
  }

  async function request(path: string, opts: RequestOptions = {}): Promise<RawResponse> {
    const authenticated = opts.authenticated ?? true;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const hasBody = opts.body !== undefined;

    let sentToken: string | null = null;
    const send = async (): Promise<RawResponse> => {
      const headers: Record<string, string> = { ...opts.headers };
      if (hasBody) headers['Content-Type'] = 'application/json';
      if (authenticated) {
        sentToken = await getToken();
        headers[TOKEN_HEADER] = sentToken;
      }
      return rawFetch(
        `${cfg.baseUrl}${path}`,
        {
          method: opts.method ?? 'GET',
          headers,
          body: hasBody ? JSON.stringify(opts.body) : undefined
        },
        timeoutMs
      );
    };

    let res = await send();
    if (res.status === 401 && authenticated) {
      logger.warn('Andreani respondió 401; reloguéo y reintento una vez');
      // Solo se invalida si el token cacheado es el que rechazó Andreani: si otra request
      // concurrente ya renovó el token, no se fuerza un segundo login.
      if (token && token.value === sentToken) token = null;
      res = await send();
    }
    if (res.status >= 200 && res.status < 300) return res;
    throw toError(res);
  }

  async function requestJson(path: string, opts: RequestOptions = {}): Promise<unknown> {
    return parseJson((await request(path, opts)).body);
  }

  return {
    async quote(i: AndreaniQuoteInput): Promise<AndreaniQuote> {
      const params = new URLSearchParams({
        cpDestino: i.postcode,
        contrato: i.contract,
        cliente: cfg.clientCode,
        sucursalOrigen: cfg.originBranchId,
        'bultos[0][volumen]': String(i.volumeCm3),
        'bultos[0][kilos]': String(i.kilos),
        'bultos[0][valorDeclarado]': String(i.declaredValue)
      });
      const data = asRecord(
        await requestJson(`/v1/tarifas?${params.toString()}`, { timeoutMs: QUOTE_TIMEOUT_MS })
      );
      return {
        price: toNumber(asRecord(data.tarifaConIva).total, 'tarifaConIva.total'),
        priceWithoutTax: toNumber(asRecord(data.tarifaSinIva).total, 'tarifaSinIva.total'),
        chargeableWeight: toNumber(data.pesoAforado, 'pesoAforado')
      };
    },

    async createOrder(body: AndreaniCreateOrderRequest): Promise<AndreaniCreateOrderResult> {
      const res = await request('/v2/ordenes-de-envio', { method: 'POST', body });
      return {
        httpStatus: res.status === 208 ? 208 : 202,
        body: toOrderResponse(parseJson(res.body))
      };
    },

    async getOrder(numero: string): Promise<AndreaniOrderResponse> {
      return toOrderResponse(
        await requestJson(`/v2/ordenes-de-envio/${encodeURIComponent(numero)}`)
      );
    },

    async getLabel(id: string, format: 'pdf' | 'zpl' = 'pdf') {
      const res = await request(`/v2/ordenes-de-envio/${encodeURIComponent(id)}/etiquetas`, {
        headers: { Accept: format === 'zpl' ? 'application/zpl' : 'application/pdf' }
      });
      return {
        contentType:
          res.headers.get('content-type') ??
          (format === 'zpl' ? 'application/zpl' : 'application/pdf'),
        data: res.body
      };
    },

    async getTraces(numero: string): Promise<AndreaniTraceEvent[]> {
      const data = requireObject(
        await requestJson(`/v3/envios/${encodeURIComponent(numero)}/trazas`),
        'trazas'
      );
      return Array.isArray(data.eventos) ? (data.eventos as AndreaniTraceEvent[]) : [];
    },

    async cancelShipment(i): Promise<void> {
      await request('/v2/nueva-accion', {
        method: 'POST',
        body: {
          accion: 'cancelacion',
          datos: { contrato: i.contract, numeroAndreani: [i.trackingNumber] }
        }
      });
    },

    async getCancellation(trackingNumber: string): Promise<AndreaniCancellationStatus> {
      const data = asRecord(
        await requestJson(`/v2/nueva-accion/${encodeURIComponent(trackingNumber)}`)
      );
      return {
        state: String(data.state ?? ''),
        ...(typeof data.razon === 'string' ? { razon: data.razon } : {})
      };
    },

    async listBranches(): Promise<AndreaniBranch[]> {
      const data = await requestJson('/v2/sucursales?canal=B2C', { authenticated: false });
      return Array.isArray(data) ? (data as AndreaniBranch[]) : [];
    },

    async listLocalities(postcode: string): Promise<AndreaniLocality[]> {
      const data = await requestJson(
        `/v1/localidades?codigosPostales=${encodeURIComponent(postcode)}`,
        { authenticated: false }
      );
      return Array.isArray(data) ? (data as AndreaniLocality[]) : [];
    }
  };
}

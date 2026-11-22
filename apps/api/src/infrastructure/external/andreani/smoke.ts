// apps/api/src/infrastructure/external/andreani/smoke.ts
//
// Smoke test contra la API REAL de Andreani (QA por defecto). No es parte del test suite.
//
//   ANDREANI_MODE=qa bun run andreani:smoke -- --public-only   # sin credenciales (sucursales + localidades)
//   ANDREANI_MODE=qa bun run andreani:smoke                    # completo: crea y cancela una orden de prueba
//   ANDREANI_MODE=prod bun run andreani:smoke -- --prod        # prod: solo con el flag explícito
//
// Nunca imprime credenciales ni tokens. Sale con código 1 ante el primer paso fallido.

import { writeFileSync } from 'node:fs';
import { buildCreateOrderRequest } from '../../../modules/shipments/request-mapper.js';
import { getAndreaniConfig, validateAndreaniConfig, type AndreaniConfig } from './config.js';
import { AndreaniError } from './errors.js';
import { createHttpAndreaniClient } from './http-client.js';
import type { AndreaniClient, AndreaniCreateOrderRequest } from './types.js';

const LABEL_PATH = './andreani-smoke-label.pdf';
const args = new Set(process.argv.slice(2));
const publicOnly = args.has('--public-only');

function describeError(e: unknown): string {
  if (e instanceof AndreaniError) {
    const fields = e.fieldErrors?.length
      ? ` [${e.fieldErrors.map((f) => `${f.field}: ${f.message}`).join('; ')}]`
      : '';
    return `${e.code} (HTTP ${e.status ?? '-'}): ${e.message}${fields}`;
  }
  return e instanceof Error ? e.message : String(e);
}

/** Fallo de un paso: se captura una sola vez en main (permite limpiar antes de salir). */
class SmokeFailure extends Error {}

function fail(msg: string): never {
  throw new SmokeFailure(msg);
}

/** Ejecuta un paso, imprime ✅/❌ y corta el script en el primer error. */
async function step<T>(name: string, fn: () => Promise<{ value: T; info?: string }>): Promise<T> {
  try {
    const { value, info } = await fn();
    console.log(`✅ ${name}${info ? ` — ${info}` : ''}`);
    return value;
  } catch (e) {
    return fail(`${name} — ${describeError(e)}`);
  }
}

/** Login aparte solo para informar de dónde viene el token (el cliente hace el suyo). */
async function probeLoginTokenSource(cfg: AndreaniConfig): Promise<string> {
  const basic = Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
  const res = await fetch(`${cfg.baseUrl}/login`, { headers: { Authorization: `Basic ${basic}` } });
  if (!res.ok) throw new AndreaniError('AUTH', `Login HTTP ${res.status}`, { status: res.status });
  if (res.headers.get('x-authorization-token')) return 'header x-authorization-token';
  try {
    const body = (await res.json()) as { token?: string };
    if (body.token) return 'body.token';
  } catch {
    // body no JSON
  }
  return 'NINGUNO';
}

async function runPublic(client: AndreaniClient, postcode: string): Promise<string> {
  await step('Sucursales (GET /v2/sucursales)', async () => {
    const branches = await client.listBranches();
    if (branches.length === 0) throw new Error('lista vacía');
    const withCps = branches.filter((b) => (b.codigosPostalesAtendidos?.length ?? 0) > 0).length;
    const sample = branches[0];
    return {
      value: branches,
      info: `${branches.length} sucursales; con codigosPostalesAtendidos: ${withCps}; muestra id=${String(sample.id)} numero=${String(sample.numero)}`
    };
  });

  return step(`Localidades (GET /v1/localidades?codigosPostales=${postcode})`, async () => {
    const locs = await client.listLocalities(postcode);
    if (locs.length === 0) throw new Error(`sin localidades para ${postcode}`);
    return { value: locs[0].localidad, info: locs.map((l) => l.localidad).join(', ') };
  });
}

async function runAuthenticated(
  cfg: AndreaniConfig,
  client: AndreaniClient,
  postcode: string,
  localidad: string
): Promise<void> {
  await step('Login (GET /login)', async () => {
    const source = await probeLoginTokenSource(cfg);
    if (source === 'NINGUNO') throw new Error('Andreani no devolvió token ni en header ni en body');
    return { value: source, info: `token recibido en ${source}` };
  });

  await step('Cotización (GET /v1/tarifas)', async () => {
    const q = await client.quote({
      postcode,
      contract: cfg.contracts.home,
      kilos: 1,
      volumeCm3: 1000,
      declaredValue: 1000
    });
    return { value: q, info: `total con IVA $${q.price}` };
  });

  const idPedido = `smoke-${Date.now()}`;
  const request: AndreaniCreateOrderRequest = buildCreateOrderRequest({
    shipmentId: idPedido,
    orderNumber: 'SMOKE-00000000-0001',
    contract: cfg.contracts.home,
    channel: 'B2C',
    serviceType: 'home_delivery',
    originBranchId: cfg.originBranchId,
    sender: cfg.sender,
    recipient: {
      fullName: 'Prueba Smoke Valplas',
      email: cfg.sender.email,
      phone: '+5491122334455',
      document: null
    },
    address: {
      street: 'Calle de Prueba',
      number: '123',
      floor: null,
      apartment: null,
      postcode,
      localidad
    },
    destinationBranch: null,
    packages: [{ kilos: 1, volumeCm3: 1000, declaredValue: 1000 }]
  });

  const created = await step('Crear orden (POST /v2/ordenes-de-envio)', async () => {
    const r = await client.createOrder(request);
    const bulto = r.body.bultos[0];
    return {
      value: r,
      info: `HTTP ${r.httpStatus}, estado=${r.body.estado}, numeroDeEnvio=${bulto?.numeroDeEnvio ?? '?'}, agrupador=${r.body.agrupadorDeBultos ?? '-'}`
    };
  });
  const tracking = created.body.bultos[0]?.numeroDeEnvio;
  if (!tracking) {
    return fail(
      `La respuesta no trae bultos[0].numeroDeEnvio (idPedido=${idPedido}, estado=${created.body.estado}, agrupador=${created.body.agrupadorDeBultos ?? '-'}). Revisá la orden a mano en Andreani`
    );
  }
  const group = created.body.agrupadorDeBultos ?? tracking;
  let cancelRequested = false;

  try {
    await step('Re-POST mismo idPedido (idempotencia)', async () => {
      const r = await client.createOrder(request);
      return { value: r, info: `HTTP ${r.httpStatus} (esperado 208)` };
    });

    await step(`Estado de la orden (GET /v2/ordenes-de-envio/${tracking})`, async () => {
      const r = await client.getOrder(tracking);
      return { value: r, info: `estado=${r.estado}` };
    });

    await step('Etiqueta (GET .../etiquetas)', async () => {
      const label = await client.getLabel(group, 'pdf');
      writeFileSync(LABEL_PATH, label.data);
      return {
        value: label,
        info: `${label.contentType}, ${label.data.length} bytes -> ${LABEL_PATH}`
      };
    });

    await step(`Trazas (GET /v3/envios/${tracking}/trazas)`, async () => {
      const events = await client.getTraces(tracking);
      const labels = events.map((e) => `${e.Evento}/${e.Estado ?? '-'}`).join(', ');
      return { value: events, info: `${events.length} eventos${labels ? `: ${labels}` : ''}` };
    });

    await step('Cancelar (POST /v2/nueva-accion)', async () => {
      await client.cancelShipment({ contract: cfg.contracts.home, trackingNumber: tracking });
      cancelRequested = true;
      return { value: true };
    });

    await step('Estado de cancelación (GET /v2/nueva-accion/{n})', async () => {
      const r = await client.getCancellation(tracking);
      return { value: r, info: `state=${r.state}${r.razon ? `, razon=${r.razon}` : ''}` };
    });
  } catch (e) {
    // Ya existe una orden en Andreani: limpiar (best-effort) y dejar los datos para cancelarla a mano.
    console.error(
      `⚠️ Falló un paso con la orden ya creada. numeroDeEnvio=${tracking} contrato=${cfg.contracts.home}`
    );
    if (cancelRequested) {
      console.error('   La cancelación ya se había solicitado; verificá su estado a mano.');
    } else {
      try {
        await client.cancelShipment({ contract: cfg.contracts.home, trackingNumber: tracking });
        console.error('   Cleanup: cancelación solicitada.');
      } catch (ce) {
        console.error(
          `   Cleanup FALLÓ (${describeError(ce)}). Cancelá la orden ${tracking} a mano.`
        );
      }
    }
    throw e;
  }
}

async function main(): Promise<void> {
  const cfg = getAndreaniConfig();
  if (cfg.mode !== 'qa' && cfg.mode !== 'prod') {
    fail(`ANDREANI_MODE debe ser qa (o prod con --prod); actual: ${cfg.mode}`);
  }
  if (cfg.mode === 'prod' && !args.has('--prod')) {
    fail('ANDREANI_MODE=prod requiere el flag --prod explícito');
  }
  if (!cfg.baseUrl) fail('No hay URL base de Andreani');

  console.log(
    `Andreani smoke: modo ${cfg.mode}, ${cfg.baseUrl}${publicOnly ? ' (solo público)' : ''}`
  );

  if (!publicOnly) {
    if (cfg.mode === 'prod') {
      console.warn('⚠️ Modo PROD: se va a crear y cancelar una orden REAL en Andreani');
      if (!args.has('--yes-create-real-order')) {
        fail('En prod la corrida completa requiere además el flag --yes-create-real-order');
      }
    }
    const problems = validateAndreaniConfig(cfg, cfg.mode === 'prod');
    if (problems.length > 0) {
      fail(problems.map((p) => `Config: ${p}`).join('\n❌ '));
    }
  }

  const client = createHttpAndreaniClient(cfg);
  const postcode = process.env.ANDREANI_SMOKE_POSTCODE || '1406';
  const localidad = await runPublic(client, postcode);
  if (!publicOnly) await runAuthenticated(cfg, client, postcode, localidad);

  console.log('Smoke OK');
}

main().catch((e) => {
  console.error(`❌ ${e instanceof SmokeFailure ? e.message : describeError(e)}`);
  process.exit(1);
});

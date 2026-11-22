// apps/api/src/infrastructure/external/andreani/mock-client.ts
//
// Cliente de Andreani en memoria para demos y tests sin credenciales (ANDREANI_MODE=mock).
// El tracking avanza con el tiempo: un evento cada `stepSeconds`.

import { AndreaniError } from './errors.js';
import type {
  AndreaniBranch,
  AndreaniCancellationStatus,
  AndreaniClient,
  AndreaniCreateOrderRequest,
  AndreaniLocality,
  AndreaniOrderResponse,
  AndreaniTraceEvent
} from './types.js';

export interface MockAndreaniOptions {
  stepSeconds: number;
  now?: () => number;
}

interface MockShipment {
  createdAt: number;
  serviceType: 'home' | 'branch';
  response: AndreaniOrderResponse;
}

const HOME_STEPS = [
  'OrdenDeEnvioCreada',
  'Admision',
  'EnvioDespachado',
  'RecepcionEnSucursalDestino',
  'Distribucion',
  'EnvioEntregado'
];
const BRANCH_STEPS = [
  'OrdenDeEnvioCreada',
  'Admision',
  'EnvioDespachado',
  'RecepcionEnSucursalDestino',
  'ComienzoCustodiaEnSucursal',
  'EnvioEntregado'
];

const ART_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Hora local argentina (UTC-3, sin DST) sin offset, como devuelve la API real. */
function formatArgentinaLocal(ms: number): string {
  return new Date(ms - ART_OFFSET_MS).toISOString().slice(0, 19);
}

function buildPdf(numero: string): Buffer {
  const text = `Etiqueta MOCK ${numero}`;
  const stream = `BT /F1 18 Tf 50 750 Td (${text}) Tj ET`;
  return Buffer.from(
    '%PDF-1.4\n' +
      '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R' +
      '/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
      `4 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream endobj\n` +
      '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n' +
      'trailer<</Root 1 0 R/Size 6>>\n%%EOF\n',
    'latin1'
  );
}

function mockBranches(): AndreaniBranch[] {
  const mk = (
    id: number,
    codigo: string,
    numero: string,
    descripcion: string,
    calle: string,
    num: string,
    localidad: string,
    cp: string,
    cps: string[]
  ): AndreaniBranch => ({
    id,
    codigo,
    numero,
    descripcion,
    canal: 'B2C',
    direccion: {
      calle,
      numero: num,
      provincia: 'Buenos Aires',
      localidad,
      region: 'Caba',
      pais: 'Argentina',
      codigoPostal: cp
    },
    horarioDeAtencion: 'Lunes a viernes de 08:00 a 18:00 - Sábados de 08:00 a 13:00Hs',
    datosAdicionales: {
      seHaceAtencionAlCliente: true,
      tipo: 'SUCURSAL',
      admiteEnvios: true,
      entregaEnvios: true
    },
    codigosPostalesAtendidos: cps
  });
  return [
    mk(
      10015,
      'FLO',
      '15',
      'FLORES (AV JUAN B ALBERDI)',
      'Av. Juan B. Alberdi ',
      '3138',
      'C.a.b.a.',
      '1406',
      ['1406', '1407', '1408']
    ),
    mk(
      10020,
      'MIC',
      '20',
      'MICROCENTRO (AV CORRIENTES)',
      'Av. Corrientes ',
      '1200',
      'C.a.b.a.',
      '1043',
      ['1043', '1042', '1049']
    ),
    mk(10031, 'TIG', '31', 'TIGRE (AV CAZON)', 'Av. Cazon ', '800', 'Tigre', '1648', [
      '1648',
      '1649',
      '1650'
    ])
  ];
}

function mockLocalities(postcode: string): AndreaniLocality[] {
  return [
    {
      idDeProvLocalidad: 1,
      localidad: 'LOCALIDAD MOCK',
      provincia: 'Buenos Aires',
      codigosPostales: [postcode]
    }
  ];
}

export function createMockAndreaniClient(opts: MockAndreaniOptions): AndreaniClient {
  const now = opts.now ?? Date.now;
  const stepMs = Math.max(1, opts.stepSeconds) * 1000;
  const shipments = new Map<string, MockShipment>();
  const byIdPedido = new Map<string, string>();
  const cancelled = new Set<string>();
  let seq = 0;

  function nextNumero(): string {
    seq += 1;
    const tail = String((now() + seq) % 1e13).padStart(13, '0');
    return `36${tail}`.slice(0, 15);
  }

  function lookup(numero: string): MockShipment {
    let s = shipments.get(numero);
    if (!s) {
      // Número desconocido: se trata como creado ahora (home).
      s = {
        createdAt: now(),
        serviceType: 'home',
        response: buildResponse(numero, 'MOCK-UNKNOWN')
      };
      shipments.set(numero, s);
    }
    return s;
  }

  function buildResponse(numero: string, agrupador: string): AndreaniOrderResponse {
    return {
      estado: 'Pendiente',
      tipo: 'B2C',
      fechaCreacion: formatArgentinaLocal(now()),
      bultos: [{ numeroDeBulto: '1', numeroDeEnvio: numero, totalizador: '1', linking: [] }],
      agrupadorDeBultos: agrupador,
      etiquetasPorAgrupador: `mock://etiquetas/${agrupador}`
    };
  }

  return {
    async quote(i) {
      const price = 3000 + i.kilos * 850;
      return {
        price,
        priceWithoutTax: Math.round((price / 1.21) * 100) / 100,
        chargeableWeight: i.kilos
      };
    },

    async createOrder(body: AndreaniCreateOrderRequest) {
      if (body.idPedido) {
        const prev = shipments.get(byIdPedido.get(body.idPedido) ?? '');
        if (prev) return { httpStatus: 208, body: prev.response };
      }
      const numero = nextNumero();
      const response = buildResponse(numero, `MOCK${numero}`);
      shipments.set(numero, {
        createdAt: now(),
        serviceType: body.destino.sucursal ? 'branch' : 'home',
        response
      });
      if (body.idPedido) byIdPedido.set(body.idPedido, numero);
      return { httpStatus: 202, body: response };
    },

    async getOrder(numero) {
      return lookup(numero).response;
    },

    async getLabel(id) {
      return { contentType: 'application/pdf', data: buildPdf(id) };
    },

    async getTraces(numero): Promise<AndreaniTraceEvent[]> {
      const s = lookup(numero);
      const steps = s.serviceType === 'branch' ? BRANCH_STEPS : HOME_STEPS;
      const elapsed = Math.max(0, now() - s.createdAt);
      const count = Math.min(steps.length, Math.floor(elapsed / stepMs) + 1);
      return steps.slice(0, count).map((Evento, idx) => {
        const ev: AndreaniTraceEvent = {
          Fecha: formatArgentinaLocal(s.createdAt + idx * stepMs),
          Ciclo: 'Distribution',
          Evento,
          Estado: Evento
        };
        if (Evento === 'EnvioEntregado') ev.Motivo = 'Entregado';
        return ev;
      });
    },

    async cancelShipment({ trackingNumber }) {
      if (!shipments.has(trackingNumber)) {
        throw new AndreaniError('NOT_FOUND', 'Envío inexistente en mock', { status: 404 });
      }
      cancelled.add(trackingNumber);
    },

    async getCancellation(trackingNumber): Promise<AndreaniCancellationStatus> {
      return cancelled.has(trackingNumber)
        ? { state: 'Aceptado' }
        : { state: 'Rechazado', razon: 'No solicitada' };
    },

    async listBranches() {
      return mockBranches();
    },

    async listLocalities(postcode) {
      return mockLocalities(postcode);
    }
  };
}

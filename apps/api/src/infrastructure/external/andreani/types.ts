// apps/api/src/infrastructure/external/andreani/types.ts
//
// Tipos del wire format de Andreani (nombres de campo en español tal como los devuelve la API)
// y la interfaz AndreaniClient que implementan el cliente HTTP y el mock.

export interface AndreaniQuoteInput {
  postcode: string;
  contract: string;
  kilos: number;
  volumeCm3: number;
  declaredValue: number;
}

export interface AndreaniQuote {
  /** Total con IVA (ARS). */
  price: number;
  priceWithoutTax: number;
  chargeableWeight: number;
}

export interface AndreaniAddress {
  postal?: {
    codigoPostal: string;
    calle: string;
    numero: string;
    piso?: string;
    departamento?: string;
    localidad: string;
    region?: string;
    pais?: string;
  };
  sucursal?: { id: string };
}

/** Remitente / destinatario del request de create-order (el campo es `email`, no `eMail`). */
export interface AndreaniPerson {
  nombreCompleto: string;
  email?: string;
  documentoTipo?: string;
  documentoNumero?: string;
  telefonos?: { tipo: number; numero: string }[];
}

/**
 * Bulto del request. Deliberadamente NO declara valorDeclaradoConImpuestos ni valorACobrar
 * (gestión de cobranza / contrareembolso): Valplas nunca los envía.
 */
export interface AndreaniParcel {
  kilos: number;
  largoCm?: number;
  altoCm?: number;
  anchoCm?: number;
  volumenCm: number;
  valorDeclaradoSinImpuestos?: number;
  referencias?: { meta: string; contenido: string }[];
  descripcion?: string;
}

/** Request de POST /v2/ordenes-de-envio. Sin index signature: el compilador rechaza claves extra. */
export interface AndreaniCreateOrderRequest {
  contrato: string;
  tipoDeServicio?: string;
  sucursalClienteID?: number;
  idPedido?: string;
  origen: AndreaniAddress;
  destino: AndreaniAddress;
  remitente: AndreaniPerson;
  destinatario: AndreaniPerson[];
  remito?: { numeroRemito: string; complementarios?: string[] };
  bultos: AndreaniParcel[];
}

export interface AndreaniOrderResponse {
  estado: string;
  tipo: string;
  sucursalDeDistribucion?: { nomenclatura?: string; descripcion?: string; id?: string };
  fechaCreacion?: string;
  fechaEstimadaDeEntrega?: string;
  bultos: {
    numeroDeBulto: string;
    numeroDeEnvio: string;
    totalizador: string;
    linking: { meta: string; contenido: string }[];
  }[];
  agrupadorDeBultos?: string;
  etiquetasPorAgrupador?: string;
}

export interface AndreaniCreateOrderResult {
  httpStatus: 202 | 208;
  body: AndreaniOrderResponse;
}

export interface AndreaniTraceEvent {
  Fecha: string;
  Ciclo: string;
  Evento: string;
  Motivo?: string;
  Submotivo?: string;
  Estado?: string;
  Sucursal?: string;
  SucursalId?: string;
  Comentario?: string;
}

export interface AndreaniCancellationStatus {
  state: string;
  razon?: string;
}

export interface AndreaniBranch {
  id: string | number;
  codigo?: string;
  numero?: string | number;
  descripcion?: string;
  canal?: string;
  direccion?: {
    calle?: string;
    numero?: string;
    provincia?: string;
    localidad?: string;
    region?: string;
    pais?: string;
    codigoPostal?: string;
  };
  coordenadas?: { latitud?: string; longitud?: string };
  horarioDeAtencion?: string;
  datosAdicionales?: {
    seHaceAtencionAlCliente?: boolean;
    conBuzonInteligente?: boolean;
    tipo?: string;
    tipoPd3?: string;
    admiteEnvios?: boolean;
    entregaEnvios?: boolean;
  };
  telefonos?: string[];
  codigosPostalesAtendidos?: string[];
}

export interface AndreaniLocality {
  idDeProvLocalidad: number;
  localidad: string;
  provincia: string;
  codigosPostales: string[];
}

export interface AndreaniClient {
  quote(i: AndreaniQuoteInput): Promise<AndreaniQuote>;
  createOrder(body: AndreaniCreateOrderRequest): Promise<AndreaniCreateOrderResult>;
  getOrder(numero: string): Promise<AndreaniOrderResponse>;
  getLabel(id: string, format?: 'pdf' | 'zpl'): Promise<{ contentType: string; data: Buffer }>;
  getTraces(numero: string): Promise<AndreaniTraceEvent[]>;
  cancelShipment(i: { contract: string; trackingNumber: string }): Promise<void>;
  getCancellation(trackingNumber: string): Promise<AndreaniCancellationStatus>;
  listBranches(): Promise<AndreaniBranch[]>;
  listLocalities(postcode: string): Promise<AndreaniLocality[]>;
}

import { describe, it, expect } from 'vitest';
import {
  buildCreateOrderRequest,
  toAndreaniPhone,
  remitoNumberFor,
  type CreateOrderRequestContext
} from '../../modules/shipments/request-mapper.js';

const branch = {
  id: '77',
  number: '77',
  code: 'SUC',
  name: 'Sucursal',
  address: 'Calle 1',
  postcode: '1000',
  city: 'CABA',
  province: 'Buenos Aires',
  hours: null
};

function ctx(over: Partial<CreateOrderRequestContext> = {}): CreateOrderRequestContext {
  return {
    shipmentId: 'ship-1',
    orderNumber: 'VLP-20261121-000123',
    contract: 'C1',
    channel: 'B2C',
    serviceType: 'home_delivery',
    originBranchId: '15',
    sender: {
      name: 'Valplas',
      email: 'ventas@valplas.net',
      phone: '1144445555',
      docType: 'CUIT',
      docNumber: '30111111112'
    },
    recipient: {
      fullName: 'Juan Perez',
      email: 'j@x.com',
      phone: '+5491122334455',
      document: null
    },
    address: {
      street: 'Av Siempreviva',
      number: '742',
      floor: '3',
      apartment: 'B',
      postcode: '1414',
      localidad: 'CABA'
    },
    destinationBranch: null,
    packages: [{ kilos: 2.5, volumeCm3: 1000, declaredValue: 1234.5 }],
    ...over
  };
}

describe('buildCreateOrderRequest', () => {
  it('origin is sucursal id from config', () => {
    const r = buildCreateOrderRequest(ctx());
    expect(r.origen).toEqual({ sucursal: { id: '15' } });
    expect(r.origen.postal).toBeUndefined();
  });

  it('home destination uses postal with localidad', () => {
    const r = buildCreateOrderRequest(ctx());
    expect(r.destino.sucursal).toBeUndefined();
    expect(r.destino.postal).toMatchObject({
      codigoPostal: '1414',
      calle: 'Av Siempreviva',
      numero: '742',
      piso: '3',
      departamento: 'B',
      localidad: 'CABA'
    });
  });

  it('branch destination uses sucursal id', () => {
    const r = buildCreateOrderRequest(
      ctx({ serviceType: 'branch_pickup', address: null, destinationBranch: branch })
    );
    expect(r.destino.sucursal).toEqual({ id: '77' });
    expect(r.destino.postal).toBeUndefined();
  });

  it('declared value only in valorDeclaradoSinImpuestos', () => {
    const r = buildCreateOrderRequest(ctx());
    expect(r.bultos[0].valorDeclaradoSinImpuestos).toBe(1234.5);
    const json = JSON.stringify(r);
    expect(json).not.toContain('valorDeclaradoConImpuestos');
    expect(json).not.toContain('valorACobrar');
  });

  it('idPedido is shipmentId and referencias carry idCliente=orderNumber', () => {
    const r = buildCreateOrderRequest(ctx());
    expect(r.idPedido).toBe('ship-1');
    expect(r.bultos[0].referencias).toContainEqual({
      meta: 'idCliente',
      contenido: 'VLP-20261121-000123'
    });
  });

  it('B2B adds remito.numeroRemito', () => {
    expect(remitoNumberFor('VLP-20261121-000123')).toBe('261121000123R');
    const r = buildCreateOrderRequest(ctx({ channel: 'B2B' }));
    expect(r.remito?.numeroRemito).toBe('261121000123R');
  });

  it('B2C has no remito', () => {
    expect(buildCreateOrderRequest(ctx()).remito).toBeUndefined();
  });

  it('recipient phone omitted when null or non-AR', () => {
    expect(toAndreaniPhone('+5491122334455')).toBe('1122334455');
    expect(toAndreaniPhone('+14155552671')).toBeNull();
    expect(toAndreaniPhone(null)).toBeNull();
    expect(toAndreaniPhone('garbage')).toBeNull();
    const r = buildCreateOrderRequest(
      ctx({ recipient: { fullName: 'A', email: null, phone: '+14155552671', document: null } })
    );
    expect(r.destinatario[0].telefonos).toBeUndefined();
    const r2 = buildCreateOrderRequest(ctx());
    expect(r2.destinatario[0].telefonos).toEqual([{ tipo: 2, numero: '1122334455' }]);
  });

  it('names truncated to 40 chars', () => {
    const long = 'X'.repeat(60);
    const r = buildCreateOrderRequest(
      ctx({
        recipient: { fullName: long, email: null, phone: null, document: null },
        sender: { ...ctx().sender, name: long }
      })
    );
    expect(r.destinatario[0].nombreCompleto).toHaveLength(40);
    expect(r.remitente.nombreCompleto).toHaveLength(40);
  });

  it('email falls back to sender email', () => {
    const r = buildCreateOrderRequest(
      ctx({ recipient: { fullName: 'A', email: null, phone: null, document: null } })
    );
    expect(r.destinatario[0].email).toBe('ventas@valplas.net');
  });

  it('document sets documentoTipo DNI and documentoNumero', () => {
    const r = buildCreateOrderRequest(
      ctx({ recipient: { fullName: 'A', email: null, phone: null, document: '30123456' } })
    );
    expect(r.destinatario[0].documentoTipo).toBe('DNI');
    expect(r.destinatario[0].documentoNumero).toBe('30123456');
  });
});

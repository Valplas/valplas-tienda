// apps/api/src/tests/addresses/address.domain.test.ts
//
// Las direcciones se guardan aunque ninguna zona de envío cubra su CP: el
// admin tiene que poder cargar la dirección del cliente y el cliente guardar
// la suya. La cobertura viaja en `is_deliverable` para que el front avise.
// Los errores del dominio llegan al front con su código y status.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../modules/addresses/address.repository.js', () => ({
  findAddresses: vi.fn(),
  findAddressById: vi.fn(),
  findDefaultAddress: vi.fn(),
  countUserAddresses: vi.fn(),
  createAddress: vi.fn(),
  updateAddress: vi.fn(),
  deleteAddress: vi.fn()
}));

vi.mock('../../modules/shipping/shipping.repository.js', () => ({
  findActiveZones: vi.fn(),
  countActiveZones: vi.fn()
}));

import * as addressDomain from '../../modules/addresses/address.domain.js';
import * as addressRepository from '../../modules/addresses/address.repository.js';
import * as shippingRepository from '../../modules/shipping/shipping.repository.js';
import {
  zoneCoversPostcode,
  withDeliverability
} from '../../modules/shipping/shipping-coverage.js';
import type { CreateAddressInput, UserAddress } from '../../modules/addresses/address.types.js';
import type { ShippingZone } from '../../modules/shipping/shipping.types.js';

const USER_ID = 'user-1';
const INPUT = {
  street: 'Av. Siempreviva',
  street_number: '742',
  city: 'CABA',
  province: 'CABA',
  postcode: '1414'
} as CreateAddressInput;

const ADDRESS = { id: 'addr-1', user_id: USER_ID, postcode: '1414' } as UserAddress;

const zone = (excluded: string[] = []) =>
  ({ id: `zone-${excluded.join('-')}`, excluded_postcodes: excluded }) as ShippingZone;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(addressRepository.countUserAddresses).mockResolvedValue(0);
  vi.mocked(addressRepository.createAddress).mockResolvedValue(ADDRESS);
  vi.mocked(shippingRepository.findActiveZones).mockResolvedValue([zone()]);
});

describe('zoneCoversPostcode', () => {
  it('una zona activa sirve el CP salvo que lo excluya', () => {
    expect(zoneCoversPostcode(zone(), '1414')).toBe(true);
    expect(zoneCoversPostcode(zone(['1414']), '1414')).toBe(false);
    expect(
      zoneCoversPostcode({ excluded_postcodes: null } as unknown as ShippingZone, '1414')
    ).toBe(true);
  });
});

describe('withDeliverability', () => {
  it('marca cada dirección con una sola query de zonas', async () => {
    vi.mocked(shippingRepository.findActiveZones).mockResolvedValue([zone(['9999'])]);

    const result = await withDeliverability([
      { id: 'a', postcode: '1414' },
      { id: 'b', postcode: '9999' },
      { id: 'c', postcode: '1043' }
    ]);

    expect(result.map((a) => a.is_deliverable)).toEqual([true, false, true]);
    expect(shippingRepository.findActiveZones).toHaveBeenCalledTimes(1);
  });

  it('sin direcciones no consulta zonas', async () => {
    await expect(withDeliverability([])).resolves.toEqual([]);
    expect(shippingRepository.findActiveZones).not.toHaveBeenCalled();
  });
});

describe('createAddress', () => {
  it('crea la dirección con is_deliverable = true si una zona activa cubre el CP', async () => {
    await expect(addressDomain.createAddress(USER_ID, INPUT)).resolves.toEqual({
      ...ADDRESS,
      is_deliverable: true
    });
    expect(addressRepository.createAddress).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ is_default: true })
    );
  });

  it('sin zonas activas la guarda igual con is_deliverable = false', async () => {
    vi.mocked(shippingRepository.findActiveZones).mockResolvedValue([]);

    await expect(addressDomain.createAddress(USER_ID, INPUT)).resolves.toMatchObject({
      id: ADDRESS.id,
      is_deliverable: false
    });
    expect(addressRepository.createAddress).toHaveBeenCalled();
  });

  it('con zonas que excluyen el CP la guarda igual con is_deliverable = false', async () => {
    vi.mocked(shippingRepository.findActiveZones).mockResolvedValue([zone(['1414'])]);

    await expect(addressDomain.createAddress(USER_ID, INPUT)).resolves.toMatchObject({
      is_deliverable: false
    });
    expect(addressRepository.createAddress).toHaveBeenCalled();
  });
});

describe('updateAddress', () => {
  it('guarda un CP sin cobertura y devuelve is_deliverable = false', async () => {
    vi.mocked(addressRepository.findAddressById).mockResolvedValue(ADDRESS);
    vi.mocked(addressRepository.updateAddress).mockResolvedValue({ ...ADDRESS, postcode: '9999' });
    vi.mocked(shippingRepository.findActiveZones).mockResolvedValue([zone(['9999'])]);

    await expect(
      addressDomain.updateAddress(ADDRESS.id, USER_ID, { postcode: '9999' })
    ).resolves.toMatchObject({ postcode: '9999', is_deliverable: false });
    expect(addressRepository.updateAddress).toHaveBeenCalledWith(ADDRESS.id, USER_ID, {
      postcode: '9999'
    });
  });

  it('dirección inexistente → 404, ajena → 403', async () => {
    vi.mocked(addressRepository.findAddressById).mockResolvedValueOnce(null);
    await expect(addressDomain.updateAddress('x', USER_ID, {})).rejects.toMatchObject({
      code: 'ADDRESS_NOT_FOUND',
      statusCode: 404
    });

    vi.mocked(addressRepository.findAddressById).mockResolvedValueOnce({
      ...ADDRESS,
      user_id: 'otro'
    });
    await expect(addressDomain.updateAddress(ADDRESS.id, USER_ID, {})).rejects.toMatchObject({
      code: 'ADDRESS_FORBIDDEN',
      statusCode: 403
    });
  });
});

describe('getUserAddresses', () => {
  it('marca la cobertura de cada dirección del listado', async () => {
    vi.mocked(addressRepository.findAddresses).mockResolvedValue({
      addresses: [ADDRESS, { ...ADDRESS, id: 'addr-2', postcode: '9999' }],
      total: 2
    });
    vi.mocked(shippingRepository.findActiveZones).mockResolvedValue([zone(['9999'])]);

    const result = await addressDomain.getUserAddresses(USER_ID, {});

    expect(result.total).toBe(2);
    expect(result.addresses.map((a) => a.is_deliverable)).toEqual([true, false]);
  });
});

describe('deleteAddress', () => {
  it('no deja borrar la única dirección activa → 400 LAST_ACTIVE_ADDRESS', async () => {
    vi.mocked(addressRepository.findAddressById).mockResolvedValue(ADDRESS);
    vi.mocked(addressRepository.countUserAddresses).mockResolvedValue(1);

    await expect(addressDomain.deleteAddress(ADDRESS.id, USER_ID)).rejects.toMatchObject({
      code: 'LAST_ACTIVE_ADDRESS',
      statusCode: 400
    });
  });
});

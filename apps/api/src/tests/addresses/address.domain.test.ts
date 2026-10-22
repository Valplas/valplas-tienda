// apps/api/src/tests/addresses/address.domain.test.ts
//
// Los errores del dominio de direcciones tienen que llegar al front con su
// código y status (antes eran Error planos → 500 "Error interno"). La falta de
// cobertura distingue "no hay zonas activas" (el admin tiene que configurar
// envíos) de "este CP está excluido".

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
  findZoneByPostcode: vi.fn(),
  countActiveZones: vi.fn()
}));

import * as addressDomain from '../../modules/addresses/address.domain.js';
import * as addressRepository from '../../modules/addresses/address.repository.js';
import * as shippingRepository from '../../modules/shipping/shipping.repository.js';
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(addressRepository.countUserAddresses).mockResolvedValue(0);
  vi.mocked(addressRepository.createAddress).mockResolvedValue(ADDRESS);
});

describe('createAddress', () => {
  it('crea la dirección si una zona activa cubre el CP', async () => {
    vi.mocked(shippingRepository.findZoneByPostcode).mockResolvedValue({
      id: 'zone-1'
    } as ShippingZone);

    await expect(addressDomain.createAddress(USER_ID, INPUT)).resolves.toBe(ADDRESS);
    expect(addressRepository.createAddress).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ is_default: true })
    );
  });

  it('sin zonas activas → 400 NO_SHIPPING_ZONES', async () => {
    vi.mocked(shippingRepository.findZoneByPostcode).mockResolvedValue(null);
    vi.mocked(shippingRepository.countActiveZones).mockResolvedValue(0);

    await expect(addressDomain.createAddress(USER_ID, INPUT)).rejects.toMatchObject({
      code: 'NO_SHIPPING_ZONES',
      statusCode: 400
    });
    expect(addressRepository.createAddress).not.toHaveBeenCalled();
  });

  it('con zonas que excluyen el CP → 400 POSTCODE_NOT_COVERED con el CP en el mensaje', async () => {
    vi.mocked(shippingRepository.findZoneByPostcode).mockResolvedValue(null);
    vi.mocked(shippingRepository.countActiveZones).mockResolvedValue(2);

    const error = await addressDomain.createAddress(USER_ID, INPUT).catch((e) => e);

    expect(error).toMatchObject({ code: 'POSTCODE_NOT_COVERED', statusCode: 400 });
    expect(error.message).toContain('1414');
  });
});

describe('updateAddress', () => {
  it('valida cobertura solo si cambia el CP', async () => {
    vi.mocked(addressRepository.findAddressById).mockResolvedValue(ADDRESS);
    vi.mocked(addressRepository.updateAddress).mockResolvedValue(ADDRESS);

    await addressDomain.updateAddress(ADDRESS.id, USER_ID, { postcode: '1414', city: 'X' });
    expect(shippingRepository.findZoneByPostcode).not.toHaveBeenCalled();

    vi.mocked(shippingRepository.findZoneByPostcode).mockResolvedValue(null);
    vi.mocked(shippingRepository.countActiveZones).mockResolvedValue(0);
    await expect(
      addressDomain.updateAddress(ADDRESS.id, USER_ID, { postcode: '9999' })
    ).rejects.toMatchObject({ code: 'NO_SHIPPING_ZONES' });
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

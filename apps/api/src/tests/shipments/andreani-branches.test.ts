import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  AndreaniBranch,
  AndreaniLocality
} from '../../infrastructure/external/andreani/types.js';

const fake = vi.hoisted(() => ({
  listBranches: vi.fn(),
  listLocalities: vi.fn()
}));

vi.mock('../../infrastructure/external/andreani/index.js', () => ({
  getAndreaniClient: () => fake
}));

import {
  findPickupBranches,
  findBranchById,
  clearBranchCache
} from '../../infrastructure/external/andreani/branches.js';
import {
  resolveLocalidad,
  normalizePlaceName,
  clearLocalityCache
} from '../../infrastructure/external/andreani/localities.js';

function branch(
  id: number,
  cps: string[],
  over: Partial<AndreaniBranch> = {},
  postcode = '1406'
): AndreaniBranch {
  return {
    id,
    numero: String(id),
    codigo: 'X' + id,
    descripcion: 'SUC ' + id,
    canal: 'B2C',
    direccion: {
      calle: 'Calle ',
      numero: '10',
      provincia: 'Buenos Aires',
      localidad: 'Loc',
      codigoPostal: postcode
    },
    horarioDeAtencion: 'L a V',
    datosAdicionales: { seHaceAtencionAlCliente: true, admiteEnvios: true, entregaEnvios: true },
    codigosPostalesAtendidos: cps,
    ...over
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearBranchCache();
  clearLocalityCache();
});

describe('branches', () => {
  it('filters by codigosPostalesAtendidos', async () => {
    fake.listBranches.mockResolvedValue([branch(1, ['1406']), branch(2, ['5000'])]);
    const r = await findPickupBranches('1406');
    expect(r.map((b) => b.id)).toEqual(['1']);
  });

  it('excludes entregaEnvios=false and canal B2B', async () => {
    fake.listBranches.mockResolvedValue([
      branch(1, ['1406']),
      branch(2, ['1406'], {
        datosAdicionales: {
          seHaceAtencionAlCliente: true,
          admiteEnvios: true,
          entregaEnvios: false
        }
      }),
      branch(3, ['1406'], { canal: 'B2B' })
    ]);
    const r = await findPickupBranches('1406');
    expect(r.map((b) => b.id)).toEqual(['1']);
  });

  it('falls back to nearest postcode when none serve the CP', async () => {
    fake.listBranches.mockResolvedValue([
      branch(1, ['9000'], {}, '9000'),
      branch(2, ['1500'], {}, '1500'),
      branch(3, ['1700'], {}, '1700')
    ]);
    const r = await findPickupBranches('1406', 2);
    expect(r.map((b) => b.id)).toEqual(['2', '3']);
  });

  it('excludes branches without customer service', async () => {
    fake.listBranches.mockResolvedValue([
      branch(1, ['1406']),
      branch(2, ['1406'], {
        datosAdicionales: {
          seHaceAtencionAlCliente: false,
          admiteEnvios: true,
          entregaEnvios: true
        }
      })
    ]);
    expect((await findPickupBranches('1406')).map((b) => b.id)).toEqual(['1']);
  });

  it('fallback handles CPA-format postcodes', async () => {
    fake.listBranches.mockResolvedValue([
      branch(1, ['9999'], {}, '9000'),
      branch(2, ['9999'], {}, '1406')
    ]);
    const r = await findPickupBranches('C1406ABC', 1);
    expect(r.map((b) => b.id)).toEqual(['2']);
  });

  it('respects limit', async () => {
    fake.listBranches.mockResolvedValue([1, 2, 3, 4].map((i) => branch(i, ['1406'])));
    expect(await findPickupBranches('1406', 2)).toHaveLength(2);
  });

  it('caches the list for 12h', async () => {
    fake.listBranches.mockResolvedValue([branch(1, ['1406'])]);
    await findPickupBranches('1406');
    await findPickupBranches('1406');
    expect(fake.listBranches).toHaveBeenCalledTimes(1);
  });

  it('findBranchById returns a snapshot', async () => {
    fake.listBranches.mockResolvedValue([
      branch(10015, ['1406'], {
        numero: '15',
        codigo: 'FLO',
        descripcion: 'FLORES (AV JUAN B ALBERDI)',
        direccion: {
          calle: 'Av. Juan B. Alberdi ',
          numero: '3138',
          provincia: 'Buenos Aires',
          localidad: 'C.a.b.a.',
          codigoPostal: '1406'
        }
      })
    ]);
    const s = await findBranchById('10015');
    expect(s).toMatchObject({
      id: '10015',
      number: '15',
      code: 'FLO',
      name: 'FLORES (AV JUAN B ALBERDI)',
      address: 'Av. Juan B. Alberdi 3138',
      postcode: '1406'
    });
    expect(await findBranchById('nope')).toBeNull();
  });
});

describe('localities', () => {
  const loc = (name: string): AndreaniLocality => ({
    idDeProvLocalidad: 1,
    localidad: name,
    provincia: 'Buenos Aires',
    codigosPostales: ['1648']
  });

  it('matches city ignoring case/accents', async () => {
    fake.listLocalities.mockResolvedValue([loc('TIGRE'), loc('BENAVIDEZ')]);
    expect(await resolveLocalidad('1648', 'Tigre')).toEqual({
      localidad: 'TIGRE',
      candidates: ['TIGRE', 'BENAVIDEZ']
    });
  });

  it('single candidate wins', async () => {
    fake.listLocalities.mockResolvedValue([loc('GENERAL PACHECO')]);
    const r = await resolveLocalidad('1617', 'Otra cosa');
    expect(r.localidad).toBe('GENERAL PACHECO');
  });

  it('ambiguous returns candidates', async () => {
    fake.listLocalities.mockResolvedValue([loc('A'), loc('B')]);
    const r = await resolveLocalidad('1000', 'zzz');
    expect(r.localidad).toBeNull();
    expect(r.candidates).toEqual(['A', 'B']);
  });

  it('no data', async () => {
    fake.listLocalities.mockResolvedValue([]);
    expect(await resolveLocalidad('1000', 'x')).toEqual({ localidad: null, candidates: [] });
  });

  it('caches per postcode', async () => {
    fake.listLocalities.mockResolvedValue([loc('A')]);
    await resolveLocalidad('1000', 'A');
    await resolveLocalidad('1000', 'A');
    expect(fake.listLocalities).toHaveBeenCalledTimes(1);
  });

  it('normalizePlaceName', () => {
    expect(normalizePlaceName('  Río  Cuarto ')).toBe('RIO CUARTO');
  });
});

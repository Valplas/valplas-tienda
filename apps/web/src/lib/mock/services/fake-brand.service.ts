/**
 * Fake Brand Service - Marcas mock
 * Simula operaciones de marcas con localStorage
 */

import { ApiResponse } from '@/lib/api';
import { Brand } from '@/types';
import { fakeFetch } from '../utils/fake-fetch';
import { getOrInit } from '../utils/local-storage';
import { MOCK_BRANDS } from '../data';

const STORAGE_KEY = 'brands';

/**
 * Inicializa marcas en localStorage si no existen
 */
function initBrands(): Brand[] {
  return getOrInit(STORAGE_KEY, MOCK_BRANDS);
}

/**
 * Obtener todas las marcas activas
 */
export async function fake_getBrands(): Promise<ApiResponse<Brand[]>> {
  return fakeFetch(() => {
    const brands = initBrands();
    const active = brands.filter((b) => b.is_active);

    // Ordenar por nombre
    active.sort((a, b) => a.name.localeCompare(b.name, 'es-AR'));

    return {
      success: true,
      data: active
    };
  });
}

/**
 * Obtener marca por ID
 */
export async function fake_getBrandById(id: string): Promise<ApiResponse<Brand>> {
  return fakeFetch(() => {
    const brands = initBrands();
    const brand = brands.find((b) => b.id === id);

    if (!brand) {
      return {
        success: false,
        error: {
          code: 'BRAND_NOT_FOUND',
          message: 'Marca no encontrada'
        }
      };
    }

    return {
      success: true,
      data: brand
    };
  });
}

/**
 * Obtener marca por slug
 */
export async function fake_getBrandBySlug(slug: string): Promise<ApiResponse<Brand>> {
  return fakeFetch(() => {
    const brands = initBrands();
    const brand = brands.find((b) => b.slug === slug);

    if (!brand) {
      return {
        success: false,
        error: {
          code: 'BRAND_NOT_FOUND',
          message: 'Marca no encontrada'
        }
      };
    }

    return {
      success: true,
      data: brand
    };
  });
}

// Config de Andreani: lee env en cada llamada y valida según el modo.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | number | boolean>);

vi.mock('../../env.js', () => ({ env: mockEnv }));

import {
  andreaniConfigWarnings,
  getAndreaniConfig,
  validateAndreaniConfig
} from '../../infrastructure/external/andreani/config.js';

function resetEnv(): void {
  for (const k of Object.keys(mockEnv)) delete mockEnv[k];
  Object.assign(mockEnv, {
    ANDREANI_MODE: 'disabled',
    ANDREANI_BASE_URL: '',
    ANDREANI_USERNAME: '',
    ANDREANI_PASSWORD: '',
    ANDREANI_CLIENT_CODE: '',
    ANDREANI_CONTRACT_HOME: '',
    ANDREANI_CONTRACT_BRANCH: '',
    ANDREANI_CONTRACT_B2B: '',
    ANDREANI_ORIGIN_BRANCH_ID: '',
    ANDREANI_SENDER_NAME: '',
    ANDREANI_SENDER_EMAIL: '',
    ANDREANI_SENDER_PHONE: '',
    ANDREANI_SENDER_DOC_TYPE: '',
    ANDREANI_SENDER_DOC_NUMBER: '',
    ANDREANI_DEFAULT_ITEM_WEIGHT_KG: 0.5,
    ANDREANI_DEFAULT_ITEM_VOLUME_CM3: 1000,
    ANDREANI_AUTO_CREATE_SHIPMENT: false,
    ANDREANI_POLL_CRON: '*/15 * * * *',
    ANDREANI_TRACKING_URL_TEMPLATE: '',
    ANDREANI_PUSH_USERNAME: '',
    ANDREANI_PUSH_PASSWORD: '',
    ANDREANI_MOCK_STEP_SECONDS: 60
  });
}

function fullQaEnv(): void {
  Object.assign(mockEnv, {
    ANDREANI_MODE: 'qa',
    ANDREANI_USERNAME: 'u',
    ANDREANI_PASSWORD: 'p',
    ANDREANI_CLIENT_CODE: 'CL',
    ANDREANI_CONTRACT_HOME: 'C1',
    ANDREANI_ORIGIN_BRANCH_ID: '15',
    ANDREANI_SENDER_NAME: 'Valplas',
    ANDREANI_SENDER_EMAIL: 'a@b.com',
    ANDREANI_SENDER_PHONE: '1100000000',
    ANDREANI_SENDER_DOC_TYPE: 'CUIT',
    ANDREANI_SENDER_DOC_NUMBER: '20123456789'
  });
}

beforeEach(resetEnv);

describe('getAndreaniConfig', () => {
  it('base URL por defecto según modo', () => {
    mockEnv.ANDREANI_MODE = 'qa';
    expect(getAndreaniConfig().baseUrl).toBe('https://apisqa.andreani.com');
    mockEnv.ANDREANI_MODE = 'prod';
    expect(getAndreaniConfig().baseUrl).toBe('https://apis.andreani.com');
  });

  it('ANDREANI_BASE_URL pisa el default', () => {
    mockEnv.ANDREANI_MODE = 'qa';
    mockEnv.ANDREANI_BASE_URL = 'https://custom.test';
    expect(getAndreaniConfig().baseUrl).toBe('https://custom.test');
  });

  it('lee env en cada llamada y mapea los campos', () => {
    fullQaEnv();
    const cfg = getAndreaniConfig();
    expect(cfg.mode).toBe('qa');
    expect(cfg.contracts).toEqual({ home: 'C1', branch: '', b2b: '' });
    expect(cfg.sender.docNumber).toBe('20123456789');
    expect(cfg.defaults).toEqual({ itemWeightKg: 0.5, itemVolumeCm3: 1000 });
    expect(cfg.pollCron).toBe('*/15 * * * *');
    mockEnv.ANDREANI_CLIENT_CODE = 'OTRO';
    expect(getAndreaniConfig().clientCode).toBe('OTRO');
  });

  it('un modo desconocido se trata como disabled', () => {
    mockEnv.ANDREANI_MODE = 'banana';
    expect(getAndreaniConfig().mode).toBe('disabled');
  });
});

describe('validateAndreaniConfig', () => {
  it('disabled no tiene problemas', () => {
    expect(validateAndreaniConfig(getAndreaniConfig(), true)).toEqual([]);
  });

  it('mock en producción es un problema', () => {
    mockEnv.ANDREANI_MODE = 'mock';
    const problems = validateAndreaniConfig(getAndreaniConfig(), true);
    expect(problems.some((p) => p.includes('mock'))).toBe(true);
    expect(validateAndreaniConfig(getAndreaniConfig(), false)).toEqual([]);
  });

  it('qa sin ANDREANI_USERNAME lo reporta', () => {
    fullQaEnv();
    mockEnv.ANDREANI_USERNAME = '';
    const problems = validateAndreaniConfig(getAndreaniConfig(), false);
    expect(problems.some((p) => p.includes('ANDREANI_USERNAME'))).toBe(true);
  });

  it('qa completo es válido', () => {
    fullQaEnv();
    expect(validateAndreaniConfig(getAndreaniConfig(), false)).toEqual([]);
  });
});

describe('validación estricta de la config', () => {
  it('un modo desconocido es un problema aunque getAndreaniConfig lo mapee a disabled', () => {
    mockEnv.ANDREANI_MODE = 'banana';
    const cfg = getAndreaniConfig();
    expect(cfg.mode).toBe('disabled');
    const problems = validateAndreaniConfig(cfg, false);
    expect(problems.some((p) => p.includes('ANDREANI_MODE') && p.includes('banana'))).toBe(true);
  });

  it('ANDREANI_POLL_CRON inválido es un problema', () => {
    mockEnv.ANDREANI_POLL_CRON = 'cada rato';
    const problems = validateAndreaniConfig(getAndreaniConfig(), false);
    expect(problems.some((p) => p.includes('ANDREANI_POLL_CRON'))).toBe(true);
  });

  it('auto-create con modo disabled es un problema', () => {
    mockEnv.ANDREANI_AUTO_CREATE_SHIPMENT = true;
    const problems = validateAndreaniConfig(getAndreaniConfig(), false);
    expect(problems.some((p) => p.includes('ANDREANI_AUTO_CREATE_SHIPMENT'))).toBe(true);
  });

  it('auto-create con modo mock es válido', () => {
    mockEnv.ANDREANI_MODE = 'mock';
    mockEnv.ANDREANI_AUTO_CREATE_SHIPMENT = true;
    expect(validateAndreaniConfig(getAndreaniConfig(), false)).toEqual([]);
  });

  it('qa en producción es solo una advertencia, no un problema', () => {
    fullQaEnv();
    expect(validateAndreaniConfig(getAndreaniConfig(), true)).toEqual([]);
    expect(andreaniConfigWarnings(getAndreaniConfig(), true)).toHaveLength(1);
    expect(andreaniConfigWarnings(getAndreaniConfig(), false)).toEqual([]);
  });
});

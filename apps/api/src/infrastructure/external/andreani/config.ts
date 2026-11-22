// apps/api/src/infrastructure/external/andreani/config.ts
//
// Configuración de Andreani. Se lee de `env` en cada llamada (no al cargar el módulo) para que
// los tests puedan mockear `env`.

import { env } from '../../../env.js';

export type AndreaniMode = 'disabled' | 'mock' | 'qa' | 'prod';

export interface AndreaniConfig {
  mode: AndreaniMode;
  baseUrl: string;
  username: string;
  password: string;
  clientCode: string;
  contracts: { home: string; branch: string; b2b: string };
  originBranchId: string;
  sender: { name: string; email: string; phone: string; docType: string; docNumber: string };
  defaults: { itemWeightKg: number; itemVolumeCm3: number };
  autoCreate: boolean;
  pollCron: string;
  trackingUrlTemplate: string;
  push: { username: string; password: string };
  mockStepSeconds: number;
}

export const ANDREANI_QA_URL = 'https://apisqa.andreani.com';
export const ANDREANI_PROD_URL = 'https://apis.andreani.com';

const MODES: readonly AndreaniMode[] = ['disabled', 'mock', 'qa', 'prod'];

function parseMode(raw: string): AndreaniMode {
  return (MODES as readonly string[]).includes(raw) ? (raw as AndreaniMode) : 'disabled';
}

function defaultBaseUrl(mode: AndreaniMode): string {
  return mode === 'prod' ? ANDREANI_PROD_URL : mode === 'qa' ? ANDREANI_QA_URL : '';
}

export function getAndreaniConfig(): AndreaniConfig {
  const mode = parseMode(env.ANDREANI_MODE);
  return {
    mode,
    baseUrl: env.ANDREANI_BASE_URL || defaultBaseUrl(mode),
    username: env.ANDREANI_USERNAME,
    password: env.ANDREANI_PASSWORD,
    clientCode: env.ANDREANI_CLIENT_CODE,
    contracts: {
      home: env.ANDREANI_CONTRACT_HOME,
      branch: env.ANDREANI_CONTRACT_BRANCH,
      b2b: env.ANDREANI_CONTRACT_B2B
    },
    originBranchId: env.ANDREANI_ORIGIN_BRANCH_ID,
    sender: {
      name: env.ANDREANI_SENDER_NAME,
      email: env.ANDREANI_SENDER_EMAIL,
      phone: env.ANDREANI_SENDER_PHONE,
      docType: env.ANDREANI_SENDER_DOC_TYPE,
      docNumber: env.ANDREANI_SENDER_DOC_NUMBER
    },
    defaults: {
      itemWeightKg: env.ANDREANI_DEFAULT_ITEM_WEIGHT_KG,
      itemVolumeCm3: env.ANDREANI_DEFAULT_ITEM_VOLUME_CM3
    },
    autoCreate: env.ANDREANI_AUTO_CREATE_SHIPMENT,
    pollCron: env.ANDREANI_POLL_CRON,
    trackingUrlTemplate: env.ANDREANI_TRACKING_URL_TEMPLATE,
    push: { username: env.ANDREANI_PUSH_USERNAME, password: env.ANDREANI_PUSH_PASSWORD },
    mockStepSeconds: env.ANDREANI_MOCK_STEP_SECONDS
  };
}

/** Devuelve la lista de problemas de configuración (vacía = OK). Para llamar al arrancar. */
export function validateAndreaniConfig(cfg: AndreaniConfig, isProduction: boolean): string[] {
  const problems: string[] = [];
  if (cfg.mode === 'mock' && isProduction) {
    problems.push('ANDREANI_MODE=mock no está permitido en producción');
  }
  if (cfg.mode === 'qa' || cfg.mode === 'prod') {
    const required: [string, string][] = [
      ['ANDREANI_USERNAME', cfg.username],
      ['ANDREANI_PASSWORD', cfg.password],
      ['ANDREANI_CLIENT_CODE', cfg.clientCode],
      ['ANDREANI_CONTRACT_HOME', cfg.contracts.home],
      ['ANDREANI_ORIGIN_BRANCH_ID', cfg.originBranchId],
      ['ANDREANI_SENDER_NAME', cfg.sender.name],
      ['ANDREANI_SENDER_EMAIL', cfg.sender.email],
      ['ANDREANI_SENDER_PHONE', cfg.sender.phone],
      ['ANDREANI_SENDER_DOC_TYPE', cfg.sender.docType],
      ['ANDREANI_SENDER_DOC_NUMBER', cfg.sender.docNumber]
    ];
    for (const [name, value] of required) {
      if (!value) problems.push(`${name} es obligatorio con ANDREANI_MODE=${cfg.mode}`);
    }
  }
  return problems;
}

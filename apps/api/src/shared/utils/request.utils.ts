// apps/api/src/shared/utils/request.utils.ts

/**
 * Safely extract a string parameter from Express req.params
 * Express types req.params values as string | string[], but we always expect single strings
 */
export function getParam(params: Record<string, string | string[]>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Safely extract a numeric parameter from Express req.params
 */
export function getParamAsNumber(params: Record<string, string | string[]>, key: string): number {
  const value = getParam(params, key);
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new Error(`Invalid numeric parameter: ${key}`);
  }
  return num;
}

/**
 * Valida que una variable de entorno exista
 * @param key - Nombre de la variable de entorno
 * @param defaultValue - Valor por defecto opcional
 * @returns El valor de la variable de entorno
 * @throws Error si la variable no está definida y no hay valor por defecto
 */
export function requireEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Obtiene una variable de entorno opcional
 * @param key - Nombre de la variable de entorno
 * @param defaultValue - Valor por defecto si no está definida
 * @returns El valor de la variable o el valor por defecto
 */
export function getEnv(key: string, defaultValue = ''): string {
  return process.env[key] || defaultValue;
}

/**
 * Obtiene una variable de entorno como número
 * @param key - Nombre de la variable de entorno
 * @param defaultValue - Valor por defecto si no está definida
 * @returns El valor numérico de la variable
 */
export function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = Number(value);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${value}`);
  }
  return parsed;
}

/**
 * Obtiene una variable de entorno como booleano
 * @param key - Nombre de la variable de entorno
 * @param defaultValue - Valor por defecto si no está definida
 * @returns El valor booleano de la variable
 */
export function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

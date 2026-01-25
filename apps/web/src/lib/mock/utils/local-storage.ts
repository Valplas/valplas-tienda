/**
 * Helpers para persistencia en localStorage con namespace valplas_*
 * Maneja serialización/deserialización y errores de manera segura
 */

const NAMESPACE = 'valplas';

/**
 * Genera key con namespace
 */
function getKey(key: string): string {
  return `${NAMESPACE}_${key}`;
}

/**
 * Verifica si localStorage está disponible
 */
function isLocalStorageAvailable(): boolean {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

/**
 * Guarda un valor en localStorage
 * @param key - Key sin namespace (se agregará automáticamente)
 * @param value - Valor a guardar (será stringificado)
 */
export function setItem<T>(key: string, value: T): void {
  if (!isLocalStorageAvailable()) {
    console.warn('localStorage no disponible');
    return;
  }

  try {
    const serialized = JSON.stringify(value);
    localStorage.setItem(getKey(key), serialized);
  } catch (error) {
    console.error(`Error guardando en localStorage [${key}]:`, error);
  }
}

/**
 * Obtiene un valor de localStorage
 * @param key - Key sin namespace
 * @returns Valor deserializado o null si no existe
 */
export function getItem<T>(key: string): T | null {
  if (!isLocalStorageAvailable()) {
    return null;
  }

  try {
    const serialized = localStorage.getItem(getKey(key));
    if (serialized === null) {
      return null;
    }
    return JSON.parse(serialized) as T;
  } catch (error) {
    console.error(`Error leyendo de localStorage [${key}]:`, error);
    return null;
  }
}

/**
 * Elimina un valor de localStorage
 * @param key - Key sin namespace
 */
export function removeItem(key: string): void {
  if (!isLocalStorageAvailable()) {
    return;
  }

  try {
    localStorage.removeItem(getKey(key));
  } catch (error) {
    console.error(`Error eliminando de localStorage [${key}]:`, error);
  }
}

/**
 * Limpia todos los valores con namespace valplas_*
 */
export function clearAll(): void {
  if (!isLocalStorageAvailable()) {
    return;
  }

  try {
    const keys = Object.keys(localStorage);
    const valplasKeys = keys.filter((k) => k.startsWith(`${NAMESPACE}_`));
    valplasKeys.forEach((k) => localStorage.removeItem(k));
  } catch (error) {
    console.error('Error limpiando localStorage:', error);
  }
}

/**
 * Obtiene un valor o inicializa con default si no existe
 * @param key - Key sin namespace
 * @param defaultValue - Valor por defecto si no existe
 * @returns Valor existente o default
 */
export function getOrInit<T>(key: string, defaultValue: T): T {
  const existing = getItem<T>(key);
  if (existing === null) {
    setItem(key, defaultValue);
    return defaultValue;
  }
  return existing;
}

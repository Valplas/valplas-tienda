/**
 * Simulador de llamadas async con delay aleatorio
 * Simula latencia de red realista entre 300-800ms
 */

const MIN_DELAY = 300;
const MAX_DELAY = 800;

/**
 * Genera un delay aleatorio entre MIN_DELAY y MAX_DELAY
 */
function getRandomDelay(): number {
  return Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;
}

/**
 * Simula una llamada async con delay aleatorio
 * @param callback - Función a ejecutar después del delay
 * @returns Promise con el resultado del callback
 */
export async function fakeFetch<T>(callback: () => T): Promise<T> {
  const delay = getRandomDelay();

  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(callback());
    }, delay);
  });
}

/**
 * Simula una llamada async que puede fallar
 * @param callback - Función a ejecutar
 * @param failureRate - Probabilidad de fallo (0-1)
 * @param errorMessage - Mensaje de error si falla
 */
export async function fakeFetchWithFailure<T>(
  callback: () => T,
  failureRate: number = 0,
  errorMessage: string = 'Simulated network error'
): Promise<T> {
  const delay = getRandomDelay();

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() < failureRate) {
        reject(new Error(errorMessage));
      } else {
        resolve(callback());
      }
    }, delay);
  });
}

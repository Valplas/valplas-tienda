export const MAX_TAGS = 30;
export const MAX_TAG_LENGTH = 40;

/**
 * Normaliza tags (sinónimos de búsqueda): minúscula, trim, espacios internos colapsados, sin
 * vacíos ni duplicados (conserva el orden de la primera aparición). Los límites (30 tags de 40
 * caracteres) se validan con 400 en el validator; acá solo se trunca de forma defensiva.
 */
export function normalizeTags(input: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of input) {
    const tag = raw.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH).trim();
    if (tag) seen.add(tag);
  }
  return [...seen].slice(0, MAX_TAGS);
}

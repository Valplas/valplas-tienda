import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Normaliza un teléfono a E.164 (+5491122334455). Sin prefijo internacional asume Argentina.
 * Devuelve null si el número no es válido.
 */
export function normalizePhone(raw: string): string | null {
  const parsed = parsePhoneNumberFromString(raw.trim(), 'AR');
  return parsed && parsed.isValid() ? parsed.number : null;
}

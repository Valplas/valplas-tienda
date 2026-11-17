import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Normaliza un teléfono a E.164 (+5491122334455). Sin prefijo internacional asume Argentina.
 * Acepta también el formato de WhatsApp (wa_id): solo dígitos con código de país y sin '+'
 * (ej: 5491122334455). Devuelve null si el número no es válido.
 */
export function normalizePhone(raw: string): string | null {
  let input = raw.trim();
  // wa_id: dígitos que arrancan con 54 y tienen 12+ dígitos. Ningún código de área argentino
  // empieza con 54, así que no se confunde con un número nacional.
  if (/^54\d{10,}$/.test(input)) {
    input = `+${input}`;
  }
  const parsed = parsePhoneNumberFromString(input, 'AR');
  return parsed && parsed.isValid() ? parsed.number : null;
}

/**
 * Clave para comparar teléfonos argentinos ya normalizados a E.164: colapsa el 9 de móvil
 * (+549… → +54…). Un número cargado a mano como "11 4123-4567" queda +541141234567, y el
 * mismo celular escrito desde WhatsApp es +5491141234567. Espejo de la función SQL
 * phone_match_key() (migración 050): mantener ambas iguales.
 */
export function phoneMatchKey(e164: string): string {
  return e164.replace(/^\+549/, '+54');
}

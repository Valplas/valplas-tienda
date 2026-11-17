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
 * Clave para comparar teléfonos argentinos guardados en cualquier formato: el número nacional
 * de 10 dígitos (área + abonado). '+5491141234567' (WhatsApp), '+541141234567' (cargado a
 * mano y normalizado), '1141234567' y '011 15 4123-4567' (crudos) dan '1141234567'.
 * Espejo de la función SQL phone_match_key() (migración 052): mantener ambas iguales.
 */
export function phoneMatchKey(phone: string): string {
  return phone
    .replace(/\D/g, '')
    .replace(/^00/, '') // prefijo internacional
    .replace(/^549?(\d{10})$/, '$1') // código de país + 9 de móvil opcional
    .replace(/^0(\d{10})$/, '$1') // 0 troncal nacional
    .replace(/^0?1115(\d{8})$/, '11$1'); // AMBA con 0/15
}

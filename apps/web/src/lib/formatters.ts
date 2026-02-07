/**
 * Formatea un numero como precio en pesos argentinos
 * @param amount - Monto a formatear
 * @returns String formateado como $1.234,56
 */
export function formatPrice(amount: number | null | undefined): string {
  // Manejar valores inválidos
  if (amount == null || isNaN(amount)) {
    return '$0,00';
  }

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Formatea una fecha en formato argentino
 * @param date - Fecha a formatear
 * @param options - Opciones de formato
 * @returns String formateado como DD/MM/YYYY
 */
export function formatDate(
  date: string | Date,
  options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }
): string {
  return new Intl.DateTimeFormat('es-AR', options).format(new Date(date));
}

/**
 * Formatea una fecha con hora
 * @param date - Fecha a formatear
 * @returns String formateado como DD/MM/YYYY HH:mm
 */
export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(date));
}

/**
 * Formatea un numero de telefono argentino
 * @param phone - Telefono en formato E.164 (+5491122334455)
 * @returns String formateado como (11) 2233-4455
 */
export function formatPhone(phone: string): string {
  // Remover +54
  const cleaned = phone.replace(/^\+54/, '');

  // Formato: (AA) NNNN-NNNN
  const areaCode = cleaned.slice(0, cleaned.length === 10 ? 2 : cleaned.length === 11 ? 3 : 2);
  const first = cleaned.slice(areaCode.length, areaCode.length + 4);
  const second = cleaned.slice(areaCode.length + 4);

  return `(${areaCode}) ${first}-${second}`;
}

/**
 * Pure parser for free-text catalog searches (WhatsApp bot).
 * Output contains only [a-z0-9] words and numbers, so it can never carry SQL wildcards.
 */

export interface AttributeAliasIndex {
  /** normalized term (label, key, unit, alias) → attribute key */
  terms: Map<string, string>;
}

export interface ParsedSearch {
  words: string[];
  measures: Array<{ a: number; b: number }>;
  quantities: Array<{ value: number; attributeKey: string | null; rawUnit: string }>;
  fourDigitCandidates: number[];
}

export const SEARCH_STOPWORDS: ReadonlySet<string> = new Set([
  'hola',
  'quiero',
  'queria',
  'quisiera',
  'necesito',
  'busco',
  'tenes',
  'tienen',
  'tiene',
  'hay',
  'precio',
  'precios',
  'cuanto',
  'cuesta',
  'cuestan',
  'sale',
  'salen',
  'vale',
  'valen',
  'de',
  'del',
  'la',
  'las',
  'el',
  'los',
  'un',
  'una',
  'unos',
  'unas',
  'para',
  'por',
  'con',
  'y',
  'o',
  'me',
  'mi',
  'que',
  'si',
  'porfa',
  'gracias',
  'buenas',
  'buen',
  'dia',
  'tarde'
]);

/** Units that are quantities but map to no attribute. */
const UNITS_WITHOUT_ATTRIBUTE: ReadonlySet<string> = new Set(['pulgadas', 'pulgada', 'pulg']);

const MEASURE_RE = /(\d+(?:[.,]\d+)?)\s*[x×*/]\s*(\d+(?:[.,]\d+)?)/g;
const NUMBER_RE = /^\d+(?:[.,]\d+)?$/;
const NUMBER_UNIT_RE = /^(\d+(?:[.,]\d+)?)([a-z]+)$/;

export function normalizeSearchText(text: string): string {
  return (
    text
      .replace(/[µμ]/g, 'u')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      // inch sign after a digit → "pulg"
      .replace(/(\d)\s*"/g, '$1 pulg ')
      .replace(/[^a-z0-9×*/.,\s]/g, ' ')
      // decimal separators only between digits
      .replace(/(?<!\d)[.,]|[.,](?!\d)/g, ' ')
      // measure separators only between numbers
      .replace(/(?<!\d\s*)[×*/]|[×*/](?!\s*\d)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

const toNumber = (s: string): number => Number(s.replace(',', '.'));

export function parseSearch(text: string, aliases: AttributeAliasIndex): ParsedSearch {
  const result: ParsedSearch = { words: [], measures: [], quantities: [], fourDigitCandidates: [] };
  let normalized = normalizeSearchText(text);
  if (!normalized) return result;

  normalized = normalized.replace(MEASURE_RE, (_m, a: string, b: string) => {
    result.measures.push({ a: toNumber(a), b: toNumber(b) });
    return ' ';
  });

  const unitKey = (unit: string): string | null | undefined => {
    if (aliases.terms.has(unit)) return aliases.terms.get(unit) ?? null;
    if (UNITS_WITHOUT_ATTRIBUTE.has(unit)) return null;
    return undefined; // not a unit
  };

  const tokens = normalized.split(' ').filter((t) => /[a-z0-9]/.test(t));
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    const glued = NUMBER_UNIT_RE.exec(token);
    if (glued) {
      const key = unitKey(glued[2]);
      if (key !== undefined) {
        result.quantities.push({ value: toNumber(glued[1]), attributeKey: key, rawUnit: glued[2] });
        continue;
      }
    }

    if (NUMBER_RE.test(token)) {
      const next = tokens[i + 1];
      const key = next !== undefined ? unitKey(next) : undefined;
      if (key !== undefined) {
        result.quantities.push({ value: toNumber(token), attributeKey: key, rawUnit: next });
        i++;
        continue;
      }
      if (/^\d{4}$/.test(token)) {
        result.fourDigitCandidates.push(Number(token));
        continue;
      }
    }

    if (!SEARCH_STOPWORDS.has(token)) result.words.push(token);
  }

  return result;
}

const VOWELS = 'aeiou';

export function singularize(word: string): string {
  if (word.length <= 3 || /\d/.test(word)) return word;
  if (/(ss|is|us)$/.test(word) || !word.endsWith('s')) return word;
  if (word.endsWith('ones')) return word.slice(0, -2);
  if (/[lrd]es$/.test(word)) return word.slice(0, -2);
  if (VOWELS.includes(word[word.length - 2])) return word.slice(0, -1);
  return word;
}

/**
 * SQL de la búsqueda del catálogo (web y bot) a partir de `parseSearch` (search-parser.ts).
 *
 * Builder puro: arma fragmentos SQL con placeholders `$n` y sus parámetros. El texto del
 * usuario NUNCA se interpola: las palabras viajan como patrones LIKE escapados y las medidas y
 * cantidades como regex armadas solo con números.
 *
 * El SQL espera los alias `p` (products), `b` (brands), `c` (categories) y `ct` (tags de la
 * categoría y sus ancestros), que aportan SEARCH_WITH + SEARCH_JOINS.
 */
import { singularize, type ParsedSearch } from './search-parser.js';

export type SearchMode = 'exact' | 'relaxed';

export type SearchToken =
  | { kind: 'word'; word: string }
  | { kind: 'measure'; a: number; b: number }
  /** Número en el nombre o, con `attributeKey`, valor numérico de ese atributo. */
  | { kind: 'number'; value: number; attributeKey: string | null };

export interface SearchAttempt {
  mode: SearchMode;
  tokens: SearchToken[];
}

export interface SearchSql {
  /** Exacto: AND de todos los tokens. Relajado: OR de las palabras significativas. */
  where: string;
  /** Relevancia: por palabra 3 (nombre/SKU) + 2 (tags) + 1 (atributo/categoría/marca); +3 por medida. */
  score: string;
  /** Cantidad de tokens que coinciden (primer criterio del modo relajado). */
  matched: string;
  /** Parámetros en orden de placeholder; los primeros `whereParamCount` son los de `where`. */
  params: unknown[];
  /** `where` solo usa `params.slice(0, whereParamCount)`: el resto es de `score`/`matched`. */
  whereParamCount: number;
}

/**
 * Tope por tipo de término (palabras distintas, medidas, cantidades, números de 4 dígitos):
 * acota el tamaño del SQL ante textos largos (la web no limita el largo de `search`).
 */
export const MAX_SEARCH_TERMS = 12;

/** Profundidad máxima al subir por categories.parent_id (guarda contra ciclos de datos). */
export const MAX_CATEGORY_DEPTH = 20;

/** Claves del diccionario de atributos (seed 059) que forman una medida "ancho x alto". */
const MEASURE_KEYS = { width: 'ancho', height: 'alto' } as const;

/**
 * Tags de cada categoría más los de sus ancestros, normalizados (sin acentos, minúscula).
 * Una sola CTE recursiva por query; las categorías sin tags en la cadena no aparecen.
 */
export const SEARCH_WITH = `WITH RECURSIVE search_category_chain AS (
    SELECT c.id AS category_id, c.parent_id, c.tags, 0 AS depth
    FROM categories c
    UNION ALL
    SELECT ch.category_id, parent.parent_id, parent.tags, ch.depth + 1
    FROM search_category_chain ch
    JOIN categories parent ON parent.id = ch.parent_id AND parent.deleted_at IS NULL
    WHERE ch.depth < ${MAX_CATEGORY_DEPTH}
  ),
  search_category_tags AS (
    SELECT ch.category_id, array_agg(DISTINCT unaccent(lower(t.tag))) AS tags
    FROM search_category_chain ch, unnest(ch.tags) AS t(tag)
    GROUP BY ch.category_id
  )`;

export const SEARCH_JOINS = `LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN search_category_tags ct ON ct.category_id = p.category_id`;

/** Escapa los comodines de LIKE (`%`, `_`) y la barra (carácter de escape con `ESCAPE '\'`). */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Palabra que alcanza para el modo relajado: 3+ caracteres con al menos una letra. */
export function isSignificantWord(word: string): boolean {
  return word.length >= 3 && /[a-z]/.test(word);
}

/** Número como fragmento de regex: entero tal cual, decimal con `[.,]`. null si no es plano. */
function numberPattern(value: number): string | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const text = String(value);
  return /^\d+(\.\d+)?$/.test(text) ? text.replace('.', '[.,]') : null;
}

// El número no puede ser parte de otro: ni dígitos ni "1." / "1," pegados antes, ni ",5" / "5" después
const NUMBER_START = String.raw`(?<![0-9])(?<![0-9][.,])`;
const NUMBER_END = String.raw`(?![.,]?[0-9])`;
const MEASURE_SEPARATOR = String.raw`\s*[x×*/]\s*`;

/** Regex (POSIX ARE de Postgres) de un número entero/decimal suelto dentro del nombre. */
export function numberRegex(value: number): string | null {
  const pattern = numberPattern(value);
  return pattern === null ? null : `${NUMBER_START}${pattern}${NUMBER_END}`;
}

/** Regex de la medida `a x b` dentro del nombre, con cualquier separador (x × * /). */
export function measureRegex(a: number, b: number): string | null {
  const first = numberPattern(a);
  const second = numberPattern(b);
  if (first === null || second === null) return null;
  return `${NUMBER_START}${first}${MEASURE_SEPARATOR}${second}${NUMBER_END}`;
}

/** Palabras sin repetir (singular/plural cuentan como una), conservando la primera forma. */
function uniqueWords(words: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const word of words) {
    const singular = singularize(word);
    if (seen.has(singular)) continue;
    seen.add(singular);
    result.push(word);
    if (result.length === MAX_SEARCH_TERMS) break;
  }
  return result;
}

/**
 * Intentos en orden; el llamador usa el primero con total > 0 (o el último si ninguno trae):
 * 1. exacto (un número de 4 dígitos se busca tal cual en el nombre);
 * 2. si hubo números de 4 dígitos, exacto leyéndolos como medida ("4050" → 40x50);
 * 3. si hay alguna palabra significativa, relajado.
 * El fallback "4050" va antes que el relajado: si no, "4050 camiseta" caería siempre en el
 * relajado (que encuentra cualquier camiseta) y nunca llegaría a leerse como 40x50.
 * Sin términos útiles (solo stopwords o signos) devuelve [] = sin búsqueda.
 */
export function planSearchAttempts(parsed: ParsedSearch): SearchAttempt[] {
  const words = uniqueWords(parsed.words);
  const fourDigits = parsed.fourDigitCandidates.slice(0, MAX_SEARCH_TERMS);
  const base: SearchToken[] = [
    ...words.map((word): SearchToken => ({ kind: 'word', word })),
    ...parsed.measures
      .slice(0, MAX_SEARCH_TERMS)
      .map(({ a, b }): SearchToken => ({ kind: 'measure', a, b })),
    ...parsed.quantities
      .slice(0, MAX_SEARCH_TERMS)
      .map(({ value, attributeKey }): SearchToken => ({ kind: 'number', value, attributeKey }))
  ];
  const fourDigitAsNumber = fourDigits.map(
    (value): SearchToken => ({ kind: 'number', value, attributeKey: null })
  );
  const fourDigitAsMeasure = fourDigits.map(
    (n): SearchToken => ({ kind: 'measure', a: Math.floor(n / 100), b: n % 100 })
  );

  if (base.length === 0 && fourDigitAsNumber.length === 0) return [];

  const attempts: SearchAttempt[] = [{ mode: 'exact', tokens: [...base, ...fourDigitAsNumber] }];
  if (fourDigitAsMeasure.length > 0) {
    attempts.push({ mode: 'exact', tokens: [...base, ...fourDigitAsMeasure] });
  }
  if (words.some(isSignificantWord)) {
    // Las medidas y números no filtran en el relajado, pero suman al ordenar
    attempts.push({
      mode: 'relaxed',
      tokens: [...base, ...fourDigitAsNumber, ...fourDigitAsMeasure]
    });
  }
  return attempts;
}

interface CompiledToken {
  match: string;
  score: string;
}

type ParamAllocator = (value: unknown) => string;

const NO_MATCH: CompiledToken = { match: 'FALSE', score: '0' };

function compileWord(word: string, param: ParamAllocator): CompiledToken {
  // singularize solo recorta un sufijo, así que '%singular%' ya cubre el plural; si alguna vez
  // deja de ser prefijo, se buscan las dos formas
  const singular = singularize(word);
  const variants = word.startsWith(singular) ? [singular] : [word, singular];
  const placeholders = variants.map((variant) => param(`%${escapeLike(variant)}%`));
  const like = (expr: string) =>
    `(${placeholders.map((ph) => `${expr} ILIKE ${ph} ESCAPE '\\'`).join(' OR ')})`;
  const anyTag = (tags: string, tag: string) =>
    `EXISTS (SELECT 1 FROM unnest(${tags}) AS st(tag) WHERE ${like(tag)})`;

  const inName = `(${like('unaccent(lower(p.name))')} OR ${like('p.sku')})`;
  const inTags = `(${anyTag('p.tags', 'unaccent(lower(st.tag))')} OR ${anyTag('ct.tags', 'st.tag')})`;
  const inOther = `(${like('unaccent(lower(c.name))')} OR ${like('unaccent(lower(b.name))')}
    OR EXISTS (
      SELECT 1 FROM product_attribute_values sav
      JOIN attribute_definitions sad ON sad.id = sav.attribute_id AND sad.is_active = true
      WHERE sav.product_id = p.id AND ${like('unaccent(lower(sav.value_text))')}
    ))`;

  return {
    match: `(${inName} OR ${inTags} OR ${inOther})`,
    score: `(CASE WHEN ${inName} THEN 3 ELSE 0 END
      + CASE WHEN ${inTags} THEN 2 ELSE 0 END
      + CASE WHEN ${inOther} THEN 1 ELSE 0 END)`
  };
}

function compileMeasure(a: number, b: number, param: ParamAllocator): CompiledToken {
  const regex = measureRegex(a, b);
  if (regex === null) return NO_MATCH;
  const pattern = param(regex);
  const first = param(a);
  const second = param(b);
  const byAttributes = `EXISTS (
      SELECT 1
      FROM product_attribute_values mw
      JOIN attribute_definitions mwd ON mwd.id = mw.attribute_id
        AND mwd.is_active = true AND mwd.key = '${MEASURE_KEYS.width}'
      JOIN product_attribute_values mh ON mh.product_id = mw.product_id
      JOIN attribute_definitions mhd ON mhd.id = mh.attribute_id
        AND mhd.is_active = true AND mhd.key = '${MEASURE_KEYS.height}'
      WHERE mw.product_id = p.id
        AND ((mw.value_number = ${first} AND mh.value_number = ${second})
          OR (mw.value_number = ${second} AND mh.value_number = ${first}))
    )`;
  const match = `(p.name ~* ${pattern} OR ${byAttributes})`;
  return { match, score: `(CASE WHEN ${match} THEN 3 ELSE 0 END)` };
}

function compileNumber(
  value: number,
  attributeKey: string | null,
  param: ParamAllocator
): CompiledToken {
  const regex = numberRegex(value);
  if (regex === null) return NO_MATCH;
  const inName = `p.name ~ ${param(regex)}`;
  if (attributeKey === null) return { match: inName, score: '0' };
  const key = param(attributeKey);
  const number = param(value);
  return {
    match: `(${inName} OR EXISTS (
      SELECT 1 FROM product_attribute_values nv
      JOIN attribute_definitions nd ON nd.id = nv.attribute_id AND nd.is_active = true
      WHERE nv.product_id = p.id AND nd.key = ${key} AND nv.value_number = ${number}
    ))`,
    score: '0'
  };
}

function compileToken(token: SearchToken, param: ParamAllocator): CompiledToken {
  switch (token.kind) {
    case 'word':
      return compileWord(token.word, param);
    case 'measure':
      return compileMeasure(token.a, token.b, param);
    case 'number':
      return compileNumber(token.value, token.attributeKey, param);
  }
}

/**
 * SQL de un intento. Los placeholders arrancan en `$firstParamIndex`. Los tokens que filtran
 * se compilan primero, así `where` usa un prefijo de `params` (Postgres rechaza parámetros
 * sin referenciar: el COUNT y un orden explícito pasan solo ese prefijo).
 */
export function buildSearchSql(attempt: SearchAttempt, firstParamIndex: number): SearchSql {
  const params: unknown[] = [];
  const param: ParamAllocator = (value) => {
    params.push(value);
    return `$${firstParamIndex + params.length - 1}`;
  };

  const filters = (token: SearchToken) =>
    attempt.mode === 'exact' || (token.kind === 'word' && isSignificantWord(token.word));
  const filtering = attempt.tokens.filter(filters).map((token) => compileToken(token, param));
  const whereParamCount = params.length;
  const signals = attempt.tokens
    .filter((token) => !filters(token))
    .map((token) => compileToken(token, param));
  const all = [...filtering, ...signals];

  const joiner = attempt.mode === 'exact' ? ' AND ' : ' OR ';
  const where =
    filtering.length > 0
      ? filtering.map((t) => t.match).join(joiner)
      : attempt.mode === 'exact'
        ? 'TRUE'
        : 'FALSE';

  return {
    where,
    score: all.length > 0 ? `(${all.map((t) => t.score).join(' + ')})` : '0',
    matched:
      all.length > 0
        ? `(${all.map((t) => `CASE WHEN ${t.match} THEN 1 ELSE 0 END`).join(' + ')})`
        : '0',
    params,
    whereParamCount
  };
}

// Fase 0 - EXPLAIN (ANALYZE, BUFFERS) of hot queries. Read-only. Connection string from FASE0_DB_URL.
const { createRequire } = require('module');
const fs = require('fs');
const req = createRequire(require('path').join(__dirname, '../../apps/api/package.json'));
const { Client } = req('pg');

const url = process.env.FASE0_DB_URL;
if (!url) { console.error('FASE0_DB_URL missing'); process.exit(1); }

const USER = '327d8644-0bc8-4e1d-bdff-e32ecc0f8b3b';
const CAT = '517908de-7d3a-4324-a23a-5c8ff6e854d3';
const TERM = '%bolsas%';

const PRICE = `COALESCE((SELECT TRUNC(p.cost_price * (1 + pl.margin / 100) * 100) / 100
  FROM product_price_tiers ppt JOIN price_lists pl ON pl.id = ppt.price_list_id
  WHERE ppt.product_id = p.id AND ppt.is_active = true AND pl.is_active = true AND pl.deleted_at IS NULL
  ORDER BY ppt.min_quantity ASC LIMIT 1), p.cost_price)`;

const CATALOG = (where, order) => `SELECT p.id, p.sku, p.name, p.slug, ${PRICE} AS price,
  (p.stock - p.reserved_stock) AS available_stock, p.category_id, p.brand_id, c.name AS category_name, b.name AS brand_name,
  (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.display_order ASC LIMIT 1) AS image_url
FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN brands b ON b.id = p.brand_id
WHERE p.deleted_at IS NULL AND p.is_active = true AND (p.stock - p.reserved_stock) > 0 ${where}
ORDER BY ${order} LIMIT 20 OFFSET 0`;

const SEARCH = `AND (unaccent(p.name) ILIKE unaccent('${TERM}') OR p.sku ILIKE '${TERM}')`;

const IMAGES = `COALESCE(json_agg(json_build_object('id', pi.id,'url', pi.url,'altText', pi.alt_text,'displayOrder', pi.display_order,'isPrimary', pi.is_primary)
    ORDER BY pi.display_order) FILTER (WHERE pi.id IS NOT NULL), '[]')`;
const TIERS = `COALESCE((SELECT json_agg(json_build_object('priceListId', ppt.price_list_id,'priceListName', pl.name,'minQuantity', ppt.min_quantity,
      'unitPrice', TRUNC(p.cost_price * (1 + pl.margin / 100) * 100) / 100) ORDER BY pl.name ASC)
    FROM product_price_tiers ppt JOIN price_lists pl ON pl.id = ppt.price_list_id
    WHERE ppt.product_id = p.id AND ppt.is_active = true AND pl.is_active = true AND pl.deleted_at IS NULL), '[]')`;

const ADMIN_PRODUCTS = (where) => `SELECT p.*, c.name AS category_name, b.name AS brand_name, (p.stock - p.reserved_stock) AS available_stock,
  ${IMAGES} AS images, ${TIERS} AS price_tiers
FROM products p LEFT JOIN categories c ON p.category_id = c.id LEFT JOIN brands b ON p.brand_id = b.id
LEFT JOIN product_images pi ON p.id = pi.product_id
WHERE p.deleted_at IS NULL ${where}
GROUP BY p.id, c.id, b.id ORDER BY p.created_at DESC LIMIT 50 OFFSET 0`;

const ORDERS_ITEMS = (where) => `SELECT o.*,
  CASE WHEN u.id IS NOT NULL THEN json_build_object('id', u.id, 'first_name', u.first_name, 'last_name', u.last_name, 'email', u.email, 'phone', u.phone) END AS "user",
  COALESCE(json_agg(json_build_object('id', oi.id,'product_id', oi.product_id,'product_name', p.name,'product_sku', p.sku,'quantity', oi.quantity,
    'unit_price', oi.unit_price,'subtotal', oi.subtotal) ORDER BY oi.created_at) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
FROM orders o LEFT JOIN users u ON o.user_id = u.id LEFT JOIN order_items oi ON oi.order_id = o.id LEFT JOIN products p ON p.id = oi.product_id
WHERE ${where}
GROUP BY o.id, u.id, u.first_name, u.last_name, u.email, u.phone ORDER BY o.created_at DESC LIMIT 50 OFFSET 0`;

const ORDERS_PLAIN = (where, join) => `SELECT o.*,
  CASE WHEN u.id IS NOT NULL THEN json_build_object('id', u.id, 'first_name', u.first_name, 'last_name', u.last_name, 'email', u.email, 'phone', u.phone) END AS "user"
FROM orders o LEFT JOIN users u ON o.user_id = u.id ${join || ''}
WHERE ${where} ORDER BY o.created_at DESC LIMIT 50 OFFSET 0`;

const USERS_PAGED = (where, order) => `WITH paged_users AS (SELECT id FROM users WHERE ${where} ORDER BY ${order} LIMIT 50 OFFSET 0)
SELECT u.id, u.email, u.username, u.phone, u.first_name, u.last_name, u.role, u.is_active, u.email_verified, u.phone_verified, u.created_at, u.updated_at, u.deleted_at,
  COALESCE(json_agg(json_build_object('id', a.id,'street', a.street,'street_number', a.street_number,'city', a.city,'postcode', a.postcode,'is_default', a.is_default)
    ORDER BY a.is_default DESC, a.created_at ASC) FILTER (WHERE a.id IS NOT NULL), '[]') AS addresses
FROM users u JOIN paged_users pu ON u.id = pu.id
LEFT JOIN user_addresses a ON a.user_id = u.id AND a.deleted_at IS NULL AND a.is_active = true
GROUP BY u.id ORDER BY u.first_name ASC, u.last_name ASC, u.id`;

const CASES = [
  ['Q1a catalog featured (sin filtro)', CATALOG('', 'p.is_featured DESC, p.name ASC')],
  ['Q1b catalog busqueda "bolsas"', CATALOG(SEARCH, 'p.is_featured DESC, p.name ASC')],
  ['Q1c catalog categoria mayor + precio asc', CATALOG(`AND p.category_id = '${CAT}'`, `${PRICE} ASC, p.name ASC`)],
  ['Q1d catalog precio asc + filtro min/max', CATALOG(`AND ${PRICE} >= 1000 AND ${PRICE} <= 50000`, `${PRICE} ASC, p.name ASC`)],
  ['Q1e catalog COUNT busqueda', `SELECT COUNT(*) AS total FROM products p WHERE p.deleted_at IS NULL AND p.is_active = true AND (p.stock - p.reserved_stock) > 0 ${SEARCH}`],
  ['Q6 pedidos /me con items (usuario con mas pedidos)', ORDERS_ITEMS(`o.user_id = '${USER}'`)],
  ['Q7a admin pedidos default (sin items)', ORDERS_PLAIN('TRUE')],
  ['Q7b admin pedidos por estado', ORDERS_PLAIN(`o.status = 'delivered'`)],
  ['Q7c admin pedidos busqueda texto', ORDERS_PLAIN(`(o.order_number ILIKE '${TERM}' OR u.first_name ILIKE '${TERM}' OR u.last_name ILIKE '${TERM}' OR u.email ILIKE '${TERM}' OR u.phone ILIKE '${TERM}')`)],
  ['Q7d admin pedidos COUNT busqueda', `SELECT COUNT(*) AS count FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE (o.order_number ILIKE '${TERM}' OR u.first_name ILIKE '${TERM}' OR u.last_name ILIKE '${TERM}' OR u.email ILIKE '${TERM}' OR u.phone ILIKE '${TERM}')`],
  ['Q7e admin pedidos con items (impresion del dia, limit 500)', ORDERS_ITEMS('TRUE').replace('LIMIT 50', 'LIMIT 500')],
  ['Q9a admin productos default', ADMIN_PRODUCTS('')],
  ['Q9b admin productos busqueda', ADMIN_PRODUCTS(`AND (unaccent(p.name) ILIKE unaccent('${TERM}') OR p.sku ILIKE '${TERM}' OR unaccent(b.name) ILIKE unaccent('${TERM}'))`)],
  ['Q10a usuarios default (first_name)', USERS_PAGED('deleted_at IS NULL', 'first_name ASC, last_name ASC, id')],
  ['Q10b usuarios busqueda', USERS_PAGED(`deleted_at IS NULL AND (email ILIKE '${TERM}' OR username ILIKE '${TERM}' OR first_name ILIKE '${TERM}' OR last_name ILIKE '${TERM}')`, 'first_name ASC, last_name ASC, id')],
  ['Q10c usuarios sort por ultima compra', USERS_PAGED('deleted_at IS NULL', '(SELECT MAX(o.created_at) FROM orders o WHERE o.user_id = users.id) DESC NULLS LAST, id')],
  ['Q14 login lower(email) OR username', `SELECT id, email, username, password_hash FROM users WHERE (lower(email) = lower('someone@example.com') OR username = 'someone@example.com') AND deleted_at IS NULL LIMIT 1`],
  ['Q14b lookup solo lower(email)', `SELECT id FROM users WHERE lower(email) = lower('someone@example.com') AND deleted_at IS NULL LIMIT 1`],
  ['Q15a dashboard orders agregados', `SELECT COUNT(*) AS total_orders, COUNT(*) FILTER (WHERE status = ANY(ARRAY['pending_payment','payment_confirmed']::order_status[])) AS pending_orders,
     COALESCE(SUM(total) FILTER (WHERE status = ANY(ARRAY['payment_confirmed','delivered']::order_status[]) AND created_at >= date_trunc('month', NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires') AT TIME ZONE 'America/Argentina/Buenos_Aires'), 0) AS month_revenue FROM orders`],
  ['Q15b dashboard stock bajo', `SELECT p.id, p.name, p.sku, (p.stock - p.reserved_stock) AS available_stock FROM products p WHERE p.is_active = true AND p.deleted_at IS NULL AND (p.stock - p.reserved_stock) < 10 ORDER BY available_stock ASC, p.name ASC LIMIT 10`],
  ['Q16 accounting resumen diario (DATE() sobre columna)', `SELECT o.id FROM orders o WHERE DATE(o.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') = '2026-10-20'`],
  ['Q16b accounting rango semiabierto (reescritura propuesta)', `SELECT o.id FROM orders o WHERE o.created_at >= ('2026-10-20'::date)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires' AND o.created_at < (('2026-10-20'::date) + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'`],
  ['Q17 envio: carrier por rate (N+1, 1 llamada)', `SELECT * FROM shipping_carriers WHERE id = (SELECT id FROM shipping_carriers LIMIT 1) AND deleted_at IS NULL`]
];

async function connect() {
  let lastErr;
  for (let i = 0; i < 4; i++) {
    const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: process.env.FASE0_INSECURE_TLS !== '1' }, connectionTimeoutMillis: 15000 });
    try { await c.connect(); return c; } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 1500)); }
  }
  throw lastErr;
}

(async () => {
  const client = await connect();
  const results = [];
  for (const [name, sql] of CASES) {
    await client.query('BEGIN READ ONLY');
    try {
      await client.query(`SET LOCAL statement_timeout = '20s'`);
      const rows = (await client.query('EXPLAIN (ANALYZE, BUFFERS) ' + sql)).rows.map(r => r['QUERY PLAN']);
      results.push({ name, plan: rows });
    } catch (e) { results.push({ name, error: e.message }); }
    await client.query('ROLLBACK');
  }
  await client.end();
  fs.writeFileSync(process.argv[2] || 'fase0-explain.json', JSON.stringify(results, null, 1));
  for (const r of results) {
    if (r.error) { console.log(`## ${r.name}\n  ERROR ${r.error}`); continue; }
    const txt = r.plan.join('\n');
    const exec = (txt.match(/Execution Time: ([\d.]+) ms/) || [])[1];
    const plan = (txt.match(/Planning Time: ([\d.]+) ms/) || [])[1];
    const scans = [...txt.matchAll(/(Seq Scan|Index Scan|Index Only Scan|Bitmap Heap Scan|Bitmap Index Scan) (?:using (\S+) )?on (\S+)/g)].map(m => `${m[1]}${m[2] ? '[' + m[2] + ']' : ''}:${m[3]}`);
    const sort = /Sort Method|->  Sort/.test(txt) ? 'Sort' : '-';
    const removed = [...txt.matchAll(/Rows Removed by Filter: (\d+)/g)].map(m => m[1]).join(',');
    const hit = (txt.match(/Buffers: shared hit=(\d+)(?: read=(\d+))?/) || []);
    console.log(`## ${r.name}\n  exec=${exec}ms plan=${plan}ms sort=${sort} removed=[${removed}] buffers hit=${hit[1]} read=${hit[2] || 0}\n  scans: ${[...new Set(scans)].join(' | ')}`);
  }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

# Fase 0 — Línea de base de rendimiento SQL

Fecha: 2026-11-15. Plan: [rendimiento-sql.md](rendimiento-sql.md). Todo fue de **solo lectura** (`BEGIN READ ONLY` + `ROLLBACK`).

## Alcance y límites de la medición

- Base consultada: la que el usuario indicó como **dev** (PostgreSQL 17.6, Supabase pooler `aws-1-sa-east-1`, puerto 5432). Contiene datos del CRM migrado (2.440 pedidos históricos, 848 usuarios), no datos de prueba. **Confirmar que no es producción**: la cadena salió de `apps/api/tools/migration/.env`.
- Conexión con TLS sin verificar (el pooler firma con CA propia; decisión explícita del usuario, corrida única).
- `pg_stat_user_indexes.idx_scan` sale de tráfico de dev (`stats_reset` nulo) y de scripts de limpieza/migración. **Un índice con 0 scans acá no está probado como inútil en producción.** Consultas para producción al final.
- Los dos primeros `EXPLAIN` (Q1a, Q1b) tienen `Planning Time` de 57–74 ms por catálogo frío; el resto planifica en < 5 ms. No son representativos.
- `EXPLAIN` con literales, no con bind params (no refleja plan genérico).
- Parámetros usados (solo UUIDs y términos, sin datos personales): usuario con más pedidos `327d8644-0bc8-4e1d-bdff-e32ecc0f8b3b` (44 pedidos), categoría más grande `517908de-7d3a-4324-a23a-5c8ff6e854d3` (451 productos), término `bolsas` (29 productos), marca `059c…` (11 productos, sin usar).

## Volúmenes reales (COUNT exacto)

| Tabla          | Filas                            | Tabla                             | Filas     |
| -------------- | -------------------------------- | --------------------------------- | --------- |
| order_items    | 11.896                           | brands                            | 16        |
| orders         | 2.440                            | shipping_zones / rates / carriers | 5 / 4 / 3 |
| users          | 848                              | **categories**                    | **1**     |
| user_addresses | 804                              | **product_images**                | **5**     |
| products       | 726 (451 activos, 280 con stock) | **product_price_tiers**           | **0**     |
| price_lists    | 44                               | banners / refresh_tokens          | 0 / 0     |

- Pedidos: 2.435 `delivered`, 2 `processing`, 2 `cancelled`, 1 `shipped`; rango 2025-06-24 a 2026-10-11.
- **Implicancia para las mediciones:** sin tiers, el precio efectivo siempre cae a `cost_price`; con 1 categoría y 5 imágenes, los joins del catálogo no son representativos. Los números de Q1/Q9 son piso, no techo.
- `n_live_tup` de `pg_stat_user_tables` está desactualizado en tablas nunca analizadas (tiers, categorías, imágenes). Usar `COUNT(*)`.

## Drift de schema vs migraciones

| Punto                                | Resultado                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Migraciones aplicadas                | 43 (última `043_add_is_external_to_shipping_carriers.sql`). Coincide con el repo                                                            |
| `order_status`                       | `pending_payment, payment_confirmed, processing, ready_to_ship, shipped, delivered, cancelled, refunded`. **Falta `failed`** (confirma bug) |
| `orders.deleted_at`                  | **No existe** (confirma que `GET /users/:id/stats` falla)                                                                                   |
| Extensiones                          | `pg_trgm`, `unaccent`, `pg_stat_statements`, `pgcrypto`, `uuid-ossp`, `supabase_vault`                                                      |
| Emails duplicados por mayúsculas     | 0 → un índice `lower(email)` podría ser UNIQUE                                                                                              |
| RLS                                  | `relrowsecurity = false` en `public.users`, `public.orders`, `public.refresh_tokens`                                                        |
| Items con `bundle_size_snapshot > 1` | **0** (incluye pedidos `ADM-` y pagos confirmados)                                                                                          |

- **Fase 1:** en esta base los bugs de stock/subtotal con bundle **no afectan ningún dato**. Verificar en producción antes de decidir un backfill.
- **RLS:** sin RLS, las tablas del esquema `public` quedan expuestas por la Data API de Supabase con la clave `anon`, incluida `users.password_hash`. Es un problema de seguridad, no de rendimiento, y está fuera del plan. **Verificar en producción cuanto antes** (ver "Fuera de alcance").

## Resultados de `EXPLAIN (ANALYZE, BUFFERS)`

| Caso                                                     | Exec         | Buffers   | Plan                                                            |
| -------------------------------------------------------- | ------------ | --------- | --------------------------------------------------------------- |
| Q1a catálogo featured, sin filtro                        | 26 ms        | 113       | Index Scan `idx_products_active` + Sort                         |
| Q1b catálogo búsqueda `bolsas`                           | 2,2 ms       | 135       | `idx_products_active`, 429 filas descartadas por filtro         |
| Q1c catálogo categoría + orden por precio                | 2,0 ms       | 631       | idem, precio correlacionado en SELECT y ORDER BY                |
| Q1d catálogo orden por precio + filtro min/max           | 3,1 ms       | **1.613** | precio evaluado 3 veces por fila; Seq Scan en categories/brands |
| Q1e COUNT búsqueda                                       | 1,1 ms       | 23        | `idx_products_active`                                           |
| Q6 pedidos `/me` con items (44 pedidos)                  | **91 ms**    | 208       | Bitmap `idx_orders_user_id`, **Seq Scan products**, Sort        |
| Q7a admin pedidos default                                | 26 ms        | 143       | Index Scan `idx_orders_created_at`, sin Sort                    |
| Q7b admin pedidos por estado                             | 2,3 ms       | 150       | usa `idx_orders_created_at` + filtro (5 descartadas)            |
| Q7c admin pedidos búsqueda texto                         | **45 ms**    | 101       | **Seq Scan orders + users**, 2.440 descartadas, Sort            |
| Q7d COUNT búsqueda pedidos                               | 12 ms        | 101       | Seq Scan orders + users                                         |
| Q7e admin pedidos con items, limit 500 (imprimir día)    | **264 ms**   | **7.004** | Index Scan pkey + order_items + products, Sort                  |
| Q9a admin productos default                              | 2,4 ms       | 152       | Seq Scan product_images, Sort                                   |
| Q9b admin productos búsqueda                             | 2,4 ms       | 171       | Seq Scan brands, 422 descartadas                                |
| Q10a usuarios default                                    | 22 ms        | 233       | Seq Scan users + Sort                                           |
| Q10b usuarios búsqueda                                   | 3,8 ms       | 43        | Seq Scan users                                                  |
| Q10c usuarios orden por última compra                    | 8,4 ms       | **5.134** | subquery correlacionada `MAX(created_at)` por usuario           |
| Q14 login `lower(email) OR username`                     | 0,8 ms       | 43        | Seq Scan users (848 filas)                                      |
| Q14b solo `lower(email)`                                 | 0,75 ms      | 43        | Seq Scan users                                                  |
| Q15a dashboard agregados de pedidos                      | 6,9 ms       | 58        | Seq Scan orders                                                 |
| Q15b dashboard stock bajo                                | 0,3 ms       | 23        | `idx_products_active`                                           |
| Q16 contabilidad `DATE(created_at AT TIME ZONE …) = día` | 1,6 ms       | 58        | Seq Scan, 2.440 descartadas                                     |
| **Q16b** mismo reporte con rango semiabierto             | **0,022 ms** | 2         | Index Scan `idx_orders_created_at`                              |
| Q17 carrier por rate (una llamada del N+1)               | 1,5 ms       | 2         | Seq Scan, tabla de 3 filas                                      |

## Conclusiones

1. **Hoy todo corre en milisegundos.** Con este volumen, ningún índice nuevo cambia lo que ve el usuario. El valor del plan es evitar el crecimiento lineal (10x/100x), no ganar tiempo hoy.
2. **Peores casos reales:** impresión del día con items (264 ms, 7.004 buffers), pedidos `/me` con items (91 ms), búsqueda de pedidos (45 ms), listado de usuarios (22 ms). Los tres primeros son los que más ganan con "paginar antes de agregar" y con no unir `products` solo para el nombre.
3. **Precio efectivo (confirmado):** los buffers crecen 113 → 631 → 1.613 según cuántas veces se evalúa por fila. La reescritura con `LATERAL` está justificada. Falta medirla con tiers cargados (hay 0).
4. **Rango de fechas (confirmado):** Q16b es ~70 veces más rápido y pasa de Seq Scan a Index Scan. Es la reescritura con mejor relación esfuerzo/resultado.
5. **Login por `lower(email)`:** 0,8 ms sobre 848 filas. El índice `lower(email)` no cambia nada hoy, y mientras la query tenga `OR username` el planner no lo va a usar solo. Baja prioridad; si se hace, partir en dos lookups.
6. **Trigram para búsqueda de productos:** innecesario con 726 productos (2 ms). Mover a "cuando el catálogo supere ~5–10 mil productos".
7. **`idx_products_active` no es inútil:** tiene 2.134 scans y es el acceso base de catálogo, dashboard y búsqueda (es parcial `WHERE deleted_at IS NULL`). El plan original lo listaba entre los índices booleanos a borrar.
8. **Los índices "duplicados" de UNIQUE son parciales y son los que se usan.** `idx_products_slug` 2.518 scans vs `products_slug_key` 0; `idx_users_email` 1.403 vs 194; `idx_users_username` 1.901 vs 10; `idx_categories_slug` 389 vs 14; `idx_orders_order_number` 116 vs 0. Borrarlos obliga al UNIQUE total a absorber el tráfico; funciona, pero ahorra solo KB de disco y algo de escritura.
9. **Q7a/Q7b:** el orden por `created_at` ya sale del índice sin Sort. Los índices compuestos `(status, created_at)` y `(user_id, created_at)` darían ganancia solo con muchos más pedidos.
10. `pg_stat_statements` está dominado por scripts de limpieza/migración de dev (`DELETE FROM order_items WHERE order_id IN …` 3.293 llamadas). No sirve para priorizar queries de la app; **hay que consultarlo en producción**.

## Ajustes propuestos al plan

| Fase | Cambio                                                                                                                                                                                                                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Mantener los fixes de código y migraciones (`failed`, `/users/:id/stats`, trigger de stock). Las pruebas de bundle necesitan datos sintéticos: no hay ningún item afectado en esta base. Backfill: decidir tras revisar producción                                                                   |
| 2    | **No borrar `idx_products_active`** sin reemplazo (índice parcial `(name, id) WHERE deleted_at IS NULL AND is_active`). Bajar "borrar duplicados de UNIQUE" a oportunista. Diferir trigram y `lower(email)`. Mantener índices compuestos de pedidos como opcionales, validados con volumen sintético |
| 3    | **Prioridad alta:** rango semiabierto en contabilidad y filtro de pedidos, paginar antes de agregar en pedidos/productos, no unir `products` para `json_agg` de items (Q6, Q7e), `LATERAL` del precio. Prioridad media: N+1 de envío y de alta de pedidos admin. Pool: sin cambios de riesgo         |
| 4    | Keyset: sin cambios. Ganancia real hoy en usuarios (Q10a) y pedidos; menor en el resto                                                                                                                                                                                                               |
| 5    | Sin cambios                                                                                                                                                                                                                                                                                          |

## Consultas para correr en producción (solo lectura)

```sql
-- 1) Uso real de índices (tomar nota de stats_reset)
SELECT s.relname AS tabla, s.indexrelname AS indice, s.idx_scan,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS tamano, i.indisunique AS unico
FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.schemaname = 'public' ORDER BY s.idx_scan, s.relname;
SELECT stats_reset FROM pg_stat_database WHERE datname = current_database();

-- 2) Filas reales
SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY 2 DESC;

-- 3) Queries más costosas de la app
SELECT calls, round(total_exec_time::numeric,1) AS total_ms, round(mean_exec_time::numeric,2) AS mean_ms, rows, left(query, 160) AS query
FROM pg_stat_statements WHERE query NOT ILIKE '%pg_%' AND query NOT ILIKE '%storage.%'
ORDER BY total_exec_time DESC LIMIT 25;

-- 4) Datos afectados por los bugs de la Fase 1
SELECT COUNT(*) AS items_bundle, COUNT(DISTINCT oi.order_id) AS pedidos
FROM order_items oi WHERE oi.bundle_size_snapshot > 1;

-- 5) RLS en tablas expuestas
SELECT relname, relrowsecurity FROM pg_class
WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY relrowsecurity, relname;
```

## Fuera de alcance, pero urgente

- **RLS desactivado en todo `public`** (verificado en dev: `users`, `orders`, `refresh_tokens`). Habilitar RLS sin políticas en todas las tablas bloquea `anon`/`authenticated` y no afecta al backend (conecta con `pg` como dueño). Hacerlo en una rama aparte, tras confirmar en producción.
- Reproducir las mediciones: `.claude/plans/fase0-explain.cjs` (lee la cadena de `FASE0_DB_URL`; no la guarda).

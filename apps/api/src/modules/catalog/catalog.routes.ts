import { Router } from 'express';
import * as catalogController from './catalog.controller.js';

const router = Router();

/**
 * @swagger
 * /api/catalog/products:
 *   get:
 *     summary: Productos públicos con tiers de precio (sin autenticación)
 *     tags: [Catalog]
 *     parameters:
 *       - in: query
 *         name: search
 *         description: "Misma búsqueda que /api/bot/catalog/products: stopwords, singular/plural, nombre, SKU, marca, categoría, tags, atributos, medidas (40x50), número + unidad (20 mic) y números de 4 dígitos en nombre o SKU; fallback 4050 → 40x50 y modo relajado si nada coincide con todo."
 *         schema: { type: string }
 *       - { in: query, name: category_id, schema: { type: string, format: uuid } }
 *       - { in: query, name: brand_id, schema: { type: string, format: uuid } }
 *       - { in: query, name: min_price, schema: { type: number } }
 *       - { in: query, name: max_price, schema: { type: number } }
 *       - in: query
 *         name: sort
 *         description: "Con search y sin sort (o featured): por relevancia (en el modo relajado primero los que coinciden con más términos: palabras, medidas y números). Un sort explícito se respeta."
 *         schema: { type: string, enum: [featured, price_asc, price_desc, name_asc, name_desc, newest] }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200:
 *         description: "Lista paginada { data, pagination } (sin tags ni costos)."
 *       400:
 *         description: INVALID_PARAM (category_id o brand_id no son UUID)
 */
router.get('/products', catalogController.listProducts);

export default router;

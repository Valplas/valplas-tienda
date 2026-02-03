import { Router } from 'express';
import * as cartController from './cart.controller.js';
import { validate } from '../../shared/middleware/validation.middleware.js';
import { authMiddleware } from '../../shared/middleware/auth.middleware.js';
import { addToCartSchema, updateCartItemSchema } from './cart.validator.js';

const router = Router();

// Todas estas rutas NO requieren autenticación (funcionan para guest y autenticados)
router.get('/', cartController.getCart);
router.post('/items', validate(addToCartSchema), cartController.addToCart);
router.put('/items/:productId', validate(updateCartItemSchema), cartController.updateCartItem);
router.delete('/items/:productId', cartController.removeFromCart);
router.delete('/', cartController.clearCart);

// Esta ruta SÍ requiere autenticación
router.post('/sync', authMiddleware, cartController.syncCart);

export default router;

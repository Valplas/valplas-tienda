import type { Request, Response, NextFunction } from 'express';
import * as cartService from './cart.service.js';
import { ApiResponseBuilder as ApiResponse } from '../../shared/utils/api-response.js';

/**
 * Obtener carrito actual
 */
export async function getCart(req: Request, res: Response, next: NextFunction) {
  try {
    const cart = cartService.getCartFromCookie(req);
    const cartWithDetails = await cartService.getCartWithDetails(cart);

    // Si el carrito cambió (productos eliminados o cantidades ajustadas), actualizar cookie
    const updatedCart = {
      items: cartWithDetails.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity
      }))
    };

    if (JSON.stringify(cart) !== JSON.stringify(updatedCart)) {
      cartService.saveCartToCookie(res, updatedCart);
    }

    return res.json(ApiResponse.success({ cart: cartWithDetails }));
  } catch (error) {
    next(error);
  }
}

/**
 * Agregar producto al carrito
 */
export async function addToCart(req: Request, res: Response, next: NextFunction) {
  try {
    const cart = cartService.getCartFromCookie(req);
    const result = await cartService.addToCart(cart, req.body);

    cartService.saveCartToCookie(res, result.cart);

    const cartWithDetails = await cartService.getCartWithDetails(result.cart);

    return res.json(
      ApiResponse.success({
        cart: cartWithDetails,
        message: 'Producto agregado al carrito'
      })
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Actualizar cantidad de producto en carrito
 */
export async function updateCartItem(req: Request, res: Response, next: NextFunction) {
  try {
    const cart = cartService.getCartFromCookie(req);
    const result = await cartService.updateCartItem(cart, req.params.productId as string, req.body);

    cartService.saveCartToCookie(res, result.cart);

    const cartWithDetails = await cartService.getCartWithDetails(result.cart);

    return res.json(
      ApiResponse.success({
        cart: cartWithDetails,
        message: 'Cantidad actualizada'
      })
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Eliminar producto del carrito
 */
export async function removeFromCart(req: Request, res: Response, next: NextFunction) {
  try {
    const cart = cartService.getCartFromCookie(req);
    const result = cartService.removeFromCart(cart, req.params.productId as string);

    cartService.saveCartToCookie(res, result.cart);

    const cartWithDetails = await cartService.getCartWithDetails(result.cart);

    return res.json(
      ApiResponse.success({
        cart: cartWithDetails,
        message: 'Producto eliminado del carrito'
      })
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Vaciar carrito
 */
export async function clearCart(req: Request, res: Response, next: NextFunction) {
  try {
    const emptyCart = cartService.clearCart();
    cartService.clearCartCookie(res);

    const cartWithDetails = await cartService.getCartWithDetails(emptyCart);

    return res.json(
      ApiResponse.success({
        cart: cartWithDetails,
        message: 'Carrito vaciado'
      })
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Sincronizar carrito de guest a usuario autenticado
 */
export async function syncCart(req: Request, res: Response, next: NextFunction) {
  try {
    const guestCart = cartService.getCartFromCookie(req);
    const userId = req.user!.userId;

    const syncedCart = await cartService.syncCart(guestCart, userId);
    cartService.saveCartToCookie(res, syncedCart);

    const cartWithDetails = await cartService.getCartWithDetails(syncedCart);

    return res.json(
      ApiResponse.success({
        cart: cartWithDetails,
        message: 'Carrito sincronizado'
      })
    );
  } catch (error) {
    next(error);
  }
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface CartItemWithProduct extends CartItem {
  name: string;
  slug: string;
  sku: string;
  basePrice: number;
  imageUrl: string | null;
  availableStock: number;
  subtotal: number;
}

export interface Cart {
  items: CartItem[];
}

export interface CartSummary {
  items: CartItemWithProduct[];
  subtotal: number;
  itemCount: number;
  totalItems: number;
}

export interface AddToCartData {
  productId: string;
  quantity: number;
}

export interface UpdateCartItemData {
  quantity: number;
}

export interface CartItem {
  productId: string;
  quantity: number; // number of bundles (or units if no tier)
  priceListId?: string;
}

export interface CartItemWithProduct extends CartItem {
  name: string;
  slug: string;
  sku: string;
  price: number; // precio efectivo de venta (tier unitario o cost_price)
  imageUrl: string | null;
  availableStock: number;
  minQuantity: number; // bundle size (1 if no tier)
  unitPrice: number; // price per individual unit
  pricePerBundle: number; // unitPrice × minQuantity
  subtotal: number; // pricePerBundle × quantity (bundles)
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
  quantity: number; // number of bundles
  priceListId?: string;
}

export interface UpdateCartItemData {
  quantity: number;
}

export type ConversationState =
  | 'idle'              // Menú principal
  | 'awaiting_name'     // Esperando nombre para registro
  | 'catalog_menu'      // Mostrando lista de categorías
  | 'catalog_search'    // Esperando texto de búsqueda (context: {categoryId})
  | 'catalog_results'   // Mostrando resultados paginados
  | 'awaiting_quantity' // Esperando cantidad (context: + productId, productName, unitPrice)
  | 'cart_view'         // Mostrando carrito
  | 'checkout_confirm'; // Mostrando resumen antes de confirmar

export interface BotCartItem {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
}

export interface SessionContext {
  categoryId?: string;
  query?: string;
  page?: number;
  total?: number;
  productId?: string;
  productName?: string;
  unitPrice?: number;
  cart: BotCartItem[];
}

export interface WhatsAppSession {
  id: string;
  phone: string;
  userId: string | null;
  state: ConversationState;
  context: SessionContext;
  lastMessageId: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Meta webhook payload types
export interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppChange {
  value: WhatsAppValue;
  field: string;
}

export interface WhatsAppValue {
  messaging_product: string;
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
}

export interface WhatsAppContact {
  profile: { name: string };
  wa_id: string;
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'image' | 'audio' | 'document' | 'video' | 'sticker' | 'location' | 'contacts' | 'interactive';
  text?: { body: string };
}

export interface WhatsAppStatus {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
}

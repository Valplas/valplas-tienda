# TODO Backend - Valplas E-commerce

## 🚀 Endpoints Necesarios (Iteración 1 - MVP)

### Auth

- [ ] POST /api/auth/register - Registro de usuario
- [ ] POST /api/auth/login - Login (email/username + password)
- [ ] POST /api/auth/logout - Logout y limpiar sesión
- [ ] POST /api/auth/refresh - Refresh access token
- [ ] GET /api/auth/me - Obtener usuario actual

### Products

- [ ] GET /api/products - Lista paginada con filtros
- [ ] GET /api/products/:id - Detalle de producto
- [ ] POST /api/products - Crear producto (admin)
- [ ] PUT /api/products/:id - Actualizar producto (admin)
- [ ] DELETE /api/products/:id - Eliminar producto (admin)
- [ ] POST /api/products/bulk-delete - Eliminación masiva (admin)

### Categories

- [ ] GET /api/categories - Lista jerárquica de categorías
- [ ] GET /api/categories/:id - Detalle de categoría
- [ ] POST /api/categories - Crear categoría (admin)
- [ ] PUT /api/categories/:id - Actualizar categoría (admin)
- [ ] DELETE /api/categories/:id - Eliminar categoría (admin)
- [ ] PATCH /api/categories/reorder - Reordenar categorías (admin)

### Brands

- [ ] GET /api/brands - Lista de marcas
- [ ] GET /api/brands/:id - Detalle de marca
- [ ] POST /api/brands - Crear marca (admin)
- [ ] PUT /api/brands/:id - Actualizar marca (admin)
- [ ] DELETE /api/brands/:id - Eliminar marca (admin)
- [ ] POST /api/brands/bulk-delete - Eliminación masiva (admin)

### Cart

- [ ] GET /api/cart - Obtener carrito actual
- [ ] POST /api/cart/items - Agregar producto al carrito
- [ ] PUT /api/cart/items/:productId - Actualizar cantidad
- [ ] DELETE /api/cart/items/:productId - Eliminar del carrito
- [ ] DELETE /api/cart - Vaciar carrito
- [ ] POST /api/cart/sync - Sincronizar carrito guest → auth

### Orders

- [ ] GET /api/orders - Lista de pedidos del usuario
- [ ] GET /api/orders/:id - Detalle de pedido
- [ ] POST /api/orders - Crear pedido (desde checkout)
- [ ] GET /api/admin/orders - Lista de todos los pedidos (admin)
- [ ] PUT /api/admin/orders/:id/status - Cambiar estado (admin)

### Addresses

- [ ] GET /api/addresses - Direcciones del usuario
- [ ] POST /api/addresses - Crear dirección
- [ ] PUT /api/addresses/:id - Actualizar dirección
- [ ] DELETE /api/addresses/:id - Eliminar dirección
- [ ] PATCH /api/addresses/:id/default - Marcar como predeterminada

### Shipping

- [ ] GET /api/shipping/zones - Zonas de envío (admin)
- [ ] POST /api/shipping/zones - Crear zona (admin)
- [ ] PUT /api/shipping/zones/:id - Actualizar zona (admin)
- [ ] DELETE /api/shipping/zones/:id - Eliminar zona (admin)
- [ ] GET /api/shipping/carriers - Carriers (admin)
- [ ] POST /api/shipping/carriers - Crear carrier (admin)
- [ ] PUT /api/shipping/carriers/:id - Actualizar carrier (admin)
- [ ] DELETE /api/shipping/carriers/:id - Eliminar carrier (admin)
- [ ] POST /api/shipping/calculate - Calcular costo de envío (public)

### Users (Admin)

- [ ] GET /api/admin/users - Lista de usuarios (owner)
- [ ] GET /api/admin/users/:id - Detalle de usuario (owner)
- [ ] POST /api/admin/users - Crear usuario (owner)
- [ ] PUT /api/admin/users/:id - Actualizar usuario (owner)
- [ ] DELETE /api/admin/users/:id - Eliminar usuario (owner)

### Payments (Mercado Pago)

- [ ] POST /api/payments/preference - Crear preferencia de pago
- [ ] POST /api/payments/webhook - Webhook de notificaciones MP
- [ ] GET /api/payments/:id/status - Verificar estado de pago

## 🔐 Seguridad

### Authentication

- [ ] Implementar JWT con access token (15min) y refresh token (7 días)
- [ ] HttpOnly cookies para refresh token
- [ ] Rate limiting en endpoints de auth
- [ ] Bloqueo de cuenta tras intentos fallidos

### Authorization

- [ ] Middleware de verificación de roles
- [ ] Policies para cada endpoint
- [ ] Verificar ownership en operaciones de usuario (mis pedidos, mis direcciones)

### Input Validation

- [ ] Validar con Zod todos los request bodies
- [ ] Sanitizar inputs para prevenir XSS
- [ ] Validar tipos y rangos de números
- [ ] Límites de tamaño en uploads

### Database

- [ ] Prepared statements (prevención SQL injection)
- [ ] Row-level security en Supabase
- [ ] Índices en columnas de búsqueda
- [ ] Soft delete para datos críticos

## 📊 Database

### Migrations Necesarias

- [ ] Users table con roles
- [ ] Products, Categories, Brands con relaciones
- [ ] Orders, OrderItems con estados
- [ ] Addresses con geocoding
- [ ] ShippingZones, ZonePostcodes
- [ ] Carriers
- [ ] PaymentTransactions
- [ ] AuditLogs
- [ ] Sessions

### Triggers

- [ ] Stock reservation on order creation
- [ ] Stock update on payment confirmation
- [ ] Stock release on order cancellation
- [ ] Audit log on critical changes
- [ ] Updated_at timestamp auto-update

### Functions

- [ ] calculate_product_final_price(product_id, quantity)
- [ ] get_available_stock(product_id)
- [ ] calculate_shipping_cost(postcode, cart_total)
- [ ] generate_order_number()

## 🔄 Integrations

### Mercado Pago

- [ ] Setup credenciales (TEST y PROD)
- [ ] Implementar flujo de preferencia
- [ ] Webhook handler con validación de firma
- [ ] Manejo de estados (approved, rejected, pending, refunded)
- [ ] Logging de transacciones

### Andreani (Iteración 2)

- [ ] Cotización en tiempo real
- [ ] Generación de etiquetas
- [ ] Tracking de envíos
- [ ] Webhook de actualizaciones

### Google Maps

- [ ] Geocoding de direcciones
- [ ] Validación de códigos postales
- [ ] Autocomplete de direcciones

### Resend (Email)

- [ ] Template de confirmación de pedido
- [ ] Template de cambio de estado
- [ ] Template de bienvenida
- [ ] Template de recuperación de contraseña

## 🚀 Performance

### Caching

- [ ] Redis para sesiones
- [ ] Cache de productos destacados (5min TTL)
- [ ] Cache de categorías (15min TTL)
- [ ] Cache de configuración (30min TTL)

### Background Jobs (BullMQ)

- [ ] Email queue
- [ ] Notification queue
- [ ] Cache invalidation queue
- [ ] Audit log queue
- [ ] Stock sync queue

### Database Optimization

- [ ] Índices en: email, username, SKU, slug, order_number, postcode
- [ ] Materialized views para reportes
- [ ] Partitioning de audit_logs por fecha
- [ ] EXPLAIN ANALYZE en queries lentas

## 📝 Monitoring & Logging

- [ ] Sentry para error tracking
- [ ] Structured logging con Winston
- [ ] Metrics con Prometheus
- [ ] Health check endpoint
- [ ] Database connection pooling
- [ ] Request ID tracing

## 🧪 Testing

- [ ] Unit tests para business logic
- [ ] Integration tests para endpoints
- [ ] E2E tests para flujos críticos
- [ ] Load testing con k6
- [ ] Security testing (OWASP)

## 📦 Deployment

- [ ] CI/CD con GitHub Actions
- [ ] Environment variables validation
- [ ] Database backup strategy
- [ ] Rollback plan
- [ ] Blue-green deployment

---

**Última actualización:** 2026-01-26

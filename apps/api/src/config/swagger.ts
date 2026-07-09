// apps/api/src/config/swagger.ts

import swaggerJsdoc from 'swagger-jsdoc';
import { env } from '../env.js';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Valplas E-commerce API',
      version: '1.0.0',
      description:
        'API REST para plataforma e-commerce de Valplas - Distribuidora de artículos plásticos, productos de limpieza y electrodomésticos',
      contact: {
        name: 'Valplas',
        url: 'https://valplas.net',
        email: 'tech@valplas.net'
      },
      license: {
        name: 'Proprietary',
        url: 'https://valplas.net'
      }
    },
    servers: [
      {
        url: env.API_URL || `http://localhost:${env.PORT}/api`,
        description: 'Development server'
      },
      {
        url: 'https://api.valplas.net/api',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token JWT en header Authorization'
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'refresh_token',
          description: 'Refresh token en cookie HttpOnly'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  example: 'VALIDATION_ERROR'
                },
                message: {
                  type: 'string',
                  example: 'Los datos proporcionados no son válidos'
                },
                details: {
                  type: 'object',
                  additionalProperties: true
                }
              }
            }
          }
        },
        PaginationMetadata: {
          type: 'object',
          properties: {
            page: {
              type: 'integer',
              example: 1
            },
            limit: {
              type: 'integer',
              example: 24
            },
            total: {
              type: 'integer',
              example: 150
            },
            totalPages: {
              type: 'integer',
              example: 7
            },
            hasMore: {
              type: 'boolean',
              example: true
            }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            username: { type: 'string' },
            phone: { type: 'string', example: '+541122334455' },
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            role: { type: 'string', enum: ['owner', 'admin', 'driver', 'customer'] },
            is_active: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            sku: { type: 'string', example: 'MAG-001' },
            name: { type: 'string' },
            slug: { type: 'string' },
            description: { type: 'string' },
            base_price: {
              type: 'integer',
              description: 'Precio en centavos (ARS)',
              example: 125000
            },
            stock: { type: 'integer' },
            reserved_stock: { type: 'integer' },
            is_featured: { type: 'boolean' },
            is_active: { type: 'boolean' },
            category: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                slug: { type: 'string' }
              }
            },
            brand: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                slug: { type: 'string' }
              }
            },
            images: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  url: { type: 'string', format: 'uri' },
                  alt_text: { type: 'string' },
                  is_primary: { type: 'boolean' }
                }
              }
            }
          }
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            order_number: { type: 'string', example: 'VLP-20260203-0001' },
            user_id: { type: 'string', format: 'uuid' },
            status: {
              type: 'string',
              enum: [
                'pending_payment',
                'payment_confirmed',
                'processing',
                'shipped',
                'delivered',
                'cancelled',
                'failed',
                'refunded'
              ]
            },
            subtotal: { type: 'integer', description: 'Subtotal en centavos' },
            shipping_cost: { type: 'integer', description: 'Costo de envío en centavos' },
            total: { type: 'integer', description: 'Total en centavos' },
            shipping_street: { type: 'string' },
            shipping_city: { type: 'string' },
            shipping_province: { type: 'string' },
            shipping_postcode: { type: 'string' },
            payment_method: { type: 'string', nullable: true },
            tracking_number: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        }
      }
    },
    tags: [
      {
        name: 'Auth',
        description: 'Autenticación y registro de usuarios'
      },
      {
        name: 'Products',
        description: 'Catálogo de productos'
      },
      {
        name: 'Categories',
        description: 'Categorías de productos'
      },
      {
        name: 'Brands',
        description: 'Marcas de productos'
      },
      {
        name: 'Cart',
        description: 'Carrito de compras'
      },
      {
        name: 'Orders',
        description: 'Gestión de pedidos'
      },
      {
        name: 'Addresses',
        description: 'Direcciones de envío del usuario'
      },
      {
        name: 'Shipping',
        description: 'Zonas y tarifas de envío'
      },
      {
        name: 'Users',
        description: 'Gestión de usuarios (Admin)'
      }
    ]
  },
  apis: ['./src/modules/**/*.routes.ts', './src/modules/**/*.routes.js']
};

// swagger-jsdoc no debe poder tirar el server. Si la generación falla (ej:
// incompatibilidad de deps), logueamos y devolvemos un spec mínimo en vez de crashear.
function buildSwaggerSpec(): object {
  try {
    return swaggerJsdoc(options);
  } catch (err) {
    console.error('⚠️ No se pudo generar el spec de Swagger, /api/docs quedará vacío:', err);
    return { ...options.definition, paths: {} };
  }
}

export const swaggerSpec = buildSwaggerSpec();

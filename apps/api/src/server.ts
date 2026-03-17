import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { errorHandler } from './shared/middleware/error.middleware.js';
import { apiRateLimiter } from './shared/middleware/rate-limit.middleware.js';
import { env, validateEnv } from './env.js';
import { swaggerSpec } from './config/swagger.js';

// Validar variables de entorno al inicio
validateEnv();

const app = express();
const PORT = env.PORT;

// Middleware globales
console.log('🔧 CORS Debug - Allowed origins:', env.ALLOWED_ORIGINS);
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Permitir requests sin origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      console.log('🔍 CORS - Checking origin:', origin);

      // Verificar si el origin está en la lista de permitidos
      const isAllowed = env.ALLOWED_ORIGINS.some((allowedOrigin) => {
        // Soporte para wildcards (*.vercel.app)
        if (allowedOrigin.includes('*')) {
          const pattern = allowedOrigin.replace(/\*/g, '.*');
          const regex = new RegExp(`^${pattern}$`);
          const matches = regex.test(origin);
          console.log(
            `  🔸 Testing wildcard: "${allowedOrigin}" → pattern: "${pattern}" → matches: ${matches}`
          );
          return matches;
        }
        const matches = allowedOrigin === origin;
        console.log(`  🔸 Testing exact: "${allowedOrigin}" → matches: ${matches}`);
        return matches;
      });

      if (isAllowed) {
        console.log('✅ CORS allowed for:', origin);
        callback(null, true);
      } else {
        console.warn(`❌ CORS blocked origin: ${origin}`);
        console.warn('   Configured origins:', env.ALLOWED_ORIGINS);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  })
);
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate limiting
app.use('/api', apiRateLimiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    version: '0.1.0'
  });
});

// Rutas API
app.get('/api', (_req, res) => {
  res.json({
    message: 'Valplas API',
    version: '0.1.0',
    docs: '/api/docs'
  });
});

// Importar rutas de módulos
import authRoutes from './modules/auth/auth.routes.js';
import productRoutes from './modules/products/product.routes.js';
import categoryRoutes from './modules/categories/category.routes.js';
import brandRoutes from './modules/brands/brand.routes.js';
import priceListRoutes from './modules/price-lists/price-list.routes.js';
import cartRoutes from './modules/cart/cart.routes.js';
import shippingRoutes from './modules/shipping/shipping.routes.js';
import addressRoutes from './modules/addresses/address.routes.js';
import orderRoutes from './modules/orders/order.routes.js';
import userRoutes from './modules/users/user.routes.js';
import accountingRoutes from './modules/accounting/accounting.routes.js';
import { scheduleTokenCleanup } from './infrastructure/jobs/cleanup-tokens.job.js';

// Montar rutas
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/price-lists', priceListRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/accounting', accountingRoutes);

// Swagger documentation
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Valplas API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true
    }
  })
);

// Manejo de errores (debe ir al final)
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Ruta no encontrada: ${req.method} ${req.path}`
    }
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
  console.log(`📍 Ambiente: ${env.NODE_ENV}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  scheduleTokenCleanup();
  console.log(`🕒 Job programado: limpieza de tokens a las 3:00 AM ART (06:00 UTC)`);
});

export default app;

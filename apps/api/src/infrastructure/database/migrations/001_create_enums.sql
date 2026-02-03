-- Migration: 001_create_enums
-- Description: Create PostgreSQL extensions and enums for the application
-- Created: 2026-02-01

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable fuzzy text search (trigram similarity)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create order_status enum
CREATE TYPE order_status AS ENUM (
  'pending_payment',      -- Pedido creado, esperando pago
  'payment_confirmed',    -- Pago confirmado por MP
  'processing',           -- En preparación
  'ready_to_ship',        -- Listo para envío
  'shipped',              -- En camino
  'delivered',            -- Entregado
  'cancelled',            -- Cancelado
  'refunded'              -- Reembolsado
);

-- Create user_role enum
CREATE TYPE user_role AS ENUM (
  'customer',   -- Cliente (comprador)
  'driver',     -- Chofer/repartidor
  'admin',      -- Administrador operativo
  'owner'       -- Dueño del negocio
);

-- Rollback SQL (commented for reference)
-- DROP TYPE IF EXISTS order_status CASCADE;
-- DROP TYPE IF EXISTS user_role CASCADE;
-- DROP EXTENSION IF EXISTS "pg_trgm";
-- DROP EXTENSION IF EXISTS "uuid-ossp";

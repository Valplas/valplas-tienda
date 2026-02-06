// apps/api/src/infrastructure/database/seed-complete.ts

import { query, pool } from './client.js';
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;

async function seedComplete() {
  try {
    console.log('🌱 Iniciando seed completo de base de datos...\n');

    // 1. USERS
    console.log('👥 Creando usuarios...');
    const passwordHash = await bcrypt.hash('password123', BCRYPT_ROUNDS);

    const users = await query(
      `
      INSERT INTO users (email, username, password_hash, phone, first_name, last_name, role, is_active, email_verified)
      VALUES
        ('owner@valplas.net', 'owner', $1, '+541122334455', 'Juan', 'Pérez', 'owner', true, true),
        ('admin@valplas.net', 'admin', $1, '+541133445566', 'María', 'González', 'admin', true, true),
        ('driver@valplas.net', 'driver', $1, '+541144556677', 'Carlos', 'Rodríguez', 'driver', true, true),
        ('cliente@test.com', 'cliente1', $1, '+541155667788', 'Ana', 'Martínez', 'customer', true, true),
        ('cliente2@test.com', 'cliente2', $1, '+541166778899', 'Pedro', 'López', 'customer', true, true)
      ON CONFLICT (email) DO NOTHING
      RETURNING id, email, role
    `,
      [passwordHash]
    );

    console.log(`  ✓ ${users.rows.length || 5} usuarios`);

    // Get user IDs
    const allUsers = await query('SELECT id, email FROM users LIMIT 5');
    const _userMap = new Map(
      allUsers.rows.map((u: Record<string, unknown>) => [u.email as string, u.id as string])
    );

    // 2. CATEGORIES & BRANDS
    console.log('\n📁 Creando categorías y marcas...');
    await query(`
      INSERT INTO categories (name, slug, description, display_order, is_active)
      VALUES
        ('Limpieza', 'limpieza', 'Productos de limpieza', 1, true),
        ('Electrodomésticos', 'electrodomesticos', 'Electrodomésticos', 2, true),
        ('Plásticos', 'plasticos', 'Artículos plásticos', 3, true)
      ON CONFLICT (slug) DO NOTHING
    `);

    await query(`
      INSERT INTO brands (name, slug, is_active)
      VALUES
        ('Magistral', 'magistral', true),
        ('Ayudín', 'ayudin', true),
        ('Liliana', 'liliana', true)
      ON CONFLICT (slug) DO NOTHING
    `);

    console.log('  ✓ Categorías y marcas creadas');

    // 3. PRODUCTS
    console.log('\n📦 Creando productos...');
    const catResult = await query("SELECT id FROM categories WHERE slug = 'limpieza' LIMIT 1");
    const brandResult = await query("SELECT id FROM brands WHERE slug = 'magistral' LIMIT 1");

    if (catResult.rows[0] && brandResult.rows[0]) {
      await query(
        `
        INSERT INTO products (sku, name, slug, description, category_id, brand_id, base_price, stock, is_featured, is_active)
        VALUES
          ('MAG-001', 'Detergente Magistral 500ml', 'detergente-magistral-500ml', 'Detergente líquido', $1, $2, 125000, 150, true, true),
          ('MAG-002', 'Detergente Magistral 750ml', 'detergente-magistral-750ml', 'Detergente líquido', $1, $2, 165000, 120, true, true),
          ('AYU-001', 'Lavandina Ayudín 1L', 'lavandina-ayudin-1l', 'Lavandina concentrada', $1, $2, 98000, 200, false, true)
        ON CONFLICT (sku) DO NOTHING
      `,
        [catResult.rows[0].id, brandResult.rows[0].id]
      );

      console.log('  ✓ 3 productos creados');
    }

    // 4. SHIPPING
    console.log('\n🚚 Creando envíos...');
    const zones = await query(`
      INSERT INTO shipping_zones (name, base_cost, free_shipping_threshold, provinces, excluded_postcodes, is_active)
      VALUES
        ('CABA', 150000, 5000000, '["CABA"]', '[]', true),
        ('GBA Norte', 200000, 5000000, '["Buenos Aires"]', '[]', true)
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `);

    const carriers = await query(`
      INSERT INTO shipping_carriers (name, code, is_active)
      VALUES
        ('Envío Estándar', 'standard', true),
        ('Envío Express', 'express', true)
      RETURNING id, name
    `);

    if (zones.rows.length > 0 && carriers.rows.length > 0) {
      await query(
        `
        INSERT INTO shipping_rates (zone_id, carrier_id, min_amount, max_amount, price, estimated_days_min, estimated_days_max, is_active)
        VALUES
          ($1, $2, 0, 5000000, 150000, 2, 3, true),
          ($1, $2, 5000001, NULL, 0, 2, 3, true),
          ($1, $3, 0, NULL, 250000, 1, 1, true)
      `,
        [zones.rows[0].id, carriers.rows[0].id, carriers.rows[1].id]
      );

      console.log(`  ✓ ${zones.rows.length} zonas, ${carriers.rows.length} carriers`);
    }

    console.log('\n🎉 ¡Seed completado!\n');
    console.log('👤 Usuarios de prueba (password: password123):');
    console.log('  • owner@valplas.net (Owner)');
    console.log('  • admin@valplas.net (Admin)');
    console.log('  • driver@valplas.net (Driver)');
    console.log('  • cliente@test.com (Customer)');
    console.log('  • cliente2@test.com (Customer)\n');
  } catch (error) {
    console.error('❌ Error en seed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

seedComplete();

import bcrypt from 'bcryptjs';
import { query } from './client.js';
import { logger } from '../logger/index.js';

/**
 * Seed database with initial data for development/testing
 */
export async function seedDatabase(): Promise<void> {
  try {
    logger.info('Starting database seeding...');

    // 1. Create users
    await seedUsers();

    // 2. Create categories
    await seedCategories();

    // 3. Create brands
    await seedBrands();

    // 4. Create products
    await seedProducts();

    // 5. Create product images
    await seedProductImages();

    // 6. Create user addresses
    await seedUserAddresses();

    // 7. Create shipping zones
    await seedShippingZones();

    logger.info('Database seeding completed successfully');
  } catch (error) {
    logger.error('Error seeding database:', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Seed users (owner, admin, customer)
 */
async function seedUsers(): Promise<void> {
  logger.info('Seeding users...');

  const passwordHash = await bcrypt.hash('Test1234', 12);

  const users = [
    {
      email: 'admin@valplas.net',
      username: 'admin',
      password_hash: passwordHash,
      first_name: 'Admin',
      last_name: 'Valplas',
      role: 'owner',
      email_verified: true,
      is_active: true
    },
    {
      email: 'cliente@test.com',
      username: 'cliente_test',
      phone: '+5491122334455',
      password_hash: passwordHash,
      first_name: 'Juan',
      last_name: 'Pérez',
      role: 'customer',
      email_verified: true,
      phone_verified: true,
      is_active: true
    },
    {
      email: 'maria@test.com',
      username: 'maria_test',
      phone: '+5491166778899',
      password_hash: passwordHash,
      first_name: 'María',
      last_name: 'González',
      role: 'customer',
      email_verified: true,
      is_active: true
    }
  ];

  for (const user of users) {
    await query(
      `INSERT INTO users (email, username, phone, password_hash, first_name, last_name, role, email_verified, phone_verified, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (email) DO NOTHING`,
      [
        user.email,
        user.username,
        user.phone || null,
        user.password_hash,
        user.first_name,
        user.last_name,
        user.role,
        user.email_verified,
        user.phone_verified || false,
        user.is_active
      ]
    );
  }

  logger.info('Users seeded successfully');
}

/**
 * Seed categories (hierarchical structure)
 */
async function seedCategories(): Promise<void> {
  logger.info('Seeding categories...');

  // Parent categories
  const parentCategories = [
    {
      name: 'Limpieza',
      slug: 'limpieza',
      description: 'Productos de limpieza para el hogar y comercios',
      display_order: 1
    },
    {
      name: 'Electrodomésticos',
      slug: 'electrodomesticos',
      description: 'Electrodomésticos para el hogar',
      display_order: 2
    },
    {
      name: 'Plásticos',
      slug: 'plasticos',
      description: 'Artículos plásticos para el hogar',
      display_order: 3
    },
    {
      name: 'Cocina',
      slug: 'cocina',
      description: 'Utensilios y productos para la cocina',
      display_order: 4
    },
    {
      name: 'Baño',
      slug: 'bano',
      description: 'Accesorios y productos para el baño',
      display_order: 5
    }
  ];

  for (const category of parentCategories) {
    await query(
      `INSERT INTO categories (name, slug, description, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug) DO NOTHING`,
      [category.name, category.slug, category.description, category.display_order, true]
    );
  }

  // Get parent IDs for subcategories
  const limpiezaResult = await query("SELECT id FROM categories WHERE slug = 'limpieza'");
  const limpiezaId = limpiezaResult.rows[0]?.id;

  if (limpiezaId) {
    const subcategories = [
      { parent_id: limpiezaId, name: 'Detergentes', slug: 'detergentes', display_order: 1 },
      { parent_id: limpiezaId, name: 'Desinfectantes', slug: 'desinfectantes', display_order: 2 },
      { parent_id: limpiezaId, name: 'Lavandinas', slug: 'lavandinas', display_order: 3 },
      {
        parent_id: limpiezaId,
        name: 'Limpiadores Multiuso',
        slug: 'limpiadores-multiuso',
        display_order: 4
      }
    ];

    for (const subcategory of subcategories) {
      await query(
        `INSERT INTO categories (parent_id, name, slug, display_order, is_active)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (slug) DO NOTHING`,
        [subcategory.parent_id, subcategory.name, subcategory.slug, subcategory.display_order, true]
      );
    }
  }

  logger.info('Categories seeded successfully');
}

/**
 * Seed brands
 */
async function seedBrands(): Promise<void> {
  logger.info('Seeding brands...');

  const brands = [
    { name: 'Magistral', slug: 'magistral', description: 'Productos de limpieza argentinos' },
    { name: 'Ayudín', slug: 'ayudin', description: 'Lavandinas y desinfectantes' },
    { name: 'Cif', slug: 'cif', description: 'Limpiadores multiuso' },
    { name: 'Mr. Músculo', slug: 'mr-musculo', description: 'Productos de limpieza potentes' },
    { name: 'Queruclor', slug: 'queruclor', description: 'Lavandinas de calidad' },
    { name: 'Skip', slug: 'skip', description: 'Detergentes para ropa' },
    { name: 'Ariel', slug: 'ariel', description: 'Jabones y detergentes' },
    { name: 'Drean', slug: 'drean', description: 'Productos para el lavado' },
    { name: 'Plasticforte', slug: 'plasticforte', description: 'Artículos plásticos' },
    { name: 'Liliana', slug: 'liliana', description: 'Electrodomésticos argentinos' }
  ];

  for (const brand of brands) {
    await query(
      `INSERT INTO brands (name, slug, description, is_active)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO NOTHING`,
      [brand.name, brand.slug, brand.description, true]
    );
  }

  logger.info('Brands seeded successfully');
}

/**
 * Seed products
 */
async function seedProducts(): Promise<void> {
  logger.info('Seeding products...');

  // Get category and brand IDs
  const limpiezaResult = await query("SELECT id FROM categories WHERE slug = 'limpieza'");
  const detergentesResult = await query("SELECT id FROM categories WHERE slug = 'detergentes'");
  const lavandResult = await query("SELECT id FROM categories WHERE slug = 'lavandinas'");
  const magistralResult = await query("SELECT id FROM brands WHERE slug = 'magistral'");
  const ayudinResult = await query("SELECT id FROM brands WHERE slug = 'ayudin'");
  const skipResult = await query("SELECT id FROM brands WHERE slug = 'skip'");

  const limpiezaId = limpiezaResult.rows[0]?.id;
  const detergentesId = detergentesResult.rows[0]?.id;
  const lavandId = lavandResult.rows[0]?.id;
  const magistralId = magistralResult.rows[0]?.id;
  const ayudinId = ayudinResult.rows[0]?.id;
  const skipId = skipResult.rows[0]?.id;

  if (!limpiezaId || !magistralId) {
    logger.warn('Required categories or brands not found, skipping products seed');
    return;
  }

  const products = [
    {
      sku: 'MAG-DET-001',
      name: 'Detergente Magistral Limón 500ml',
      slug: 'detergente-magistral-limon-500ml',
      description: 'Detergente líquido concentrado aroma limón. Ideal para vajilla y superficies.',
      category_id: detergentesId || limpiezaId,
      brand_id: magistralId,
      base_price: 125000, // $1.250,00 en centavos
      stock: 150,
      is_featured: true
    },
    {
      sku: 'MAG-DET-002',
      name: 'Detergente Magistral Original 750ml',
      slug: 'detergente-magistral-original-750ml',
      description: 'Detergente líquido concentrado aroma original. Limpieza profunda.',
      category_id: detergentesId || limpiezaId,
      brand_id: magistralId,
      base_price: 165000, // $1.650,00
      stock: 120,
      is_featured: true
    },
    {
      sku: 'AYU-LAV-001',
      name: 'Lavandina Ayudín Clásica 1L',
      slug: 'lavandina-ayudin-clasica-1l',
      description: 'Lavandina concentrada para desinfección y limpieza. Con hipoclorito de sodio.',
      category_id: lavandId || limpiezaId,
      brand_id: ayudinId,
      base_price: 98000, // $980,00
      stock: 200,
      is_featured: false
    },
    {
      sku: 'AYU-LAV-002',
      name: 'Lavandina Ayudín Gel Pino 750ml',
      slug: 'lavandina-ayudin-gel-pino-750ml',
      description: 'Lavandina en gel con aroma a pino. Mayor adherencia en superficies.',
      category_id: lavandId || limpiezaId,
      brand_id: ayudinId,
      base_price: 145000, // $1.450,00
      stock: 80,
      is_featured: false
    },
    {
      sku: 'SKIP-DET-001',
      name: 'Detergente Skip Ropa Triple Poder 3L',
      slug: 'detergente-skip-ropa-triple-poder-3l',
      description: 'Detergente líquido para ropa con triple acción: limpia, cuida y perfuma.',
      category_id: detergentesId || limpiezaId,
      brand_id: skipId,
      base_price: 485000, // $4.850,00
      stock: 50,
      is_featured: true
    },
    {
      sku: 'MAG-LIMP-001',
      name: 'Limpiador Magistral Multiuso 500ml',
      slug: 'limpiador-magistral-multiuso-500ml',
      description: 'Limpiador multiuso para todo tipo de superficies. Con desengrasante.',
      category_id: limpiezaId,
      brand_id: magistralId,
      base_price: 135000, // $1.350,00
      stock: 100,
      is_featured: false
    },
    {
      sku: 'AYU-DESINF-001',
      name: 'Desinfectante Ayudín Aerosol 360ml',
      slug: 'desinfectante-ayudin-aerosol-360ml',
      description: 'Desinfectante en aerosol. Elimina 99.9% de bacterias y virus.',
      category_id: limpiezaId,
      brand_id: ayudinId,
      base_price: 275000, // $2.750,00
      stock: 60,
      is_featured: false
    }
  ];

  for (const product of products) {
    await query(
      `INSERT INTO products (sku, name, slug, description, category_id, brand_id, base_price, stock, is_featured, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (sku) DO NOTHING`,
      [
        product.sku,
        product.name,
        product.slug,
        product.description,
        product.category_id,
        product.brand_id,
        product.base_price,
        product.stock,
        product.is_featured,
        true
      ]
    );
  }

  logger.info('Products seeded successfully');
}

/**
 * Seed product images
 */
async function seedProductImages(): Promise<void> {
  logger.info('Seeding product images...');

  // Get product IDs
  const products = await query('SELECT id, sku FROM products LIMIT 7');

  for (const product of products.rows) {
    // Primary image
    await query(
      `INSERT INTO product_images (product_id, url, alt_text, display_order, is_primary)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        product.id,
        `https://via.placeholder.com/600x600/4F46E5/FFFFFF?text=${encodeURIComponent(product.sku)}`,
        `Imagen principal de ${product.sku}`,
        0,
        true
      ]
    );

    // Secondary image
    await query(
      `INSERT INTO product_images (product_id, url, alt_text, display_order, is_primary)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        product.id,
        `https://via.placeholder.com/600x600/7C3AED/FFFFFF?text=${encodeURIComponent(product.sku + '-2')}`,
        `Imagen secundaria de ${product.sku}`,
        1,
        false
      ]
    );
  }

  logger.info('Product images seeded successfully');
}

/**
 * Seed user addresses
 */
async function seedUserAddresses(): Promise<void> {
  logger.info('Seeding user addresses...');

  // Get customer user ID
  const userResult = await query("SELECT id FROM users WHERE email = 'cliente@test.com'");
  const userId = userResult.rows[0]?.id;

  if (!userId) {
    logger.warn('Customer user not found, skipping addresses seed');
    return;
  }

  const addresses = [
    {
      user_id: userId,
      street: 'Av. Corrientes',
      street_number: '1234',
      floor: '5',
      apartment: 'A',
      city: 'Buenos Aires',
      province: 'Buenos Aires',
      postcode: '1043',
      latitude: -34.603722,
      longitude: -58.381592,
      is_default: true
    },
    {
      user_id: userId,
      street: 'Av. Santa Fe',
      street_number: '2500',
      floor: null,
      apartment: null,
      city: 'Buenos Aires',
      province: 'Buenos Aires',
      postcode: '1425',
      latitude: -34.596892,
      longitude: -58.397656,
      is_default: false
    }
  ];

  for (const address of addresses) {
    await query(
      `INSERT INTO user_addresses (user_id, street, street_number, floor, apartment, city, province, postcode, latitude, longitude, is_default, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        address.user_id,
        address.street,
        address.street_number,
        address.floor,
        address.apartment,
        address.city,
        address.province,
        address.postcode,
        address.latitude,
        address.longitude,
        address.is_default,
        true
      ]
    );
  }

  logger.info('User addresses seeded successfully');
}

/**
 * Seed shipping zones
 */
async function seedShippingZones(): Promise<void> {
  logger.info('Seeding shipping zones...');

  const zones = [
    {
      name: 'CABA - Capital Federal',
      description: 'Ciudad Autónoma de Buenos Aires',
      base_cost: 150000, // $1.500,00
      free_shipping_threshold: 2000000, // $20.000,00
      postcodes: [
        '1000',
        '1001',
        '1002',
        '1003',
        '1004',
        '1005',
        '1006',
        '1007',
        '1010',
        '1043',
        '1425'
      ]
    },
    {
      name: 'GBA - Zona Norte',
      description: 'Gran Buenos Aires - Zona Norte (San Isidro, Vicente López, etc)',
      base_cost: 200000, // $2.000,00
      free_shipping_threshold: 2500000, // $25.000,00
      postcodes: ['1602', '1603', '1636', '1638', '1640', '1642']
    },
    {
      name: 'GBA - Zona Sur',
      description: 'Gran Buenos Aires - Zona Sur (Lomas, Quilmes, etc)',
      base_cost: 220000, // $2.200,00
      free_shipping_threshold: 3000000, // $30.000,00
      postcodes: ['1832', '1854', '1878', '1880', '1882', '1884']
    }
  ];

  for (const zone of zones) {
    const zoneResult = await query(
      `INSERT INTO shipping_zones (name, description, base_cost, free_shipping_threshold, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [zone.name, zone.description, zone.base_cost, zone.free_shipping_threshold, true]
    );

    const zoneId = zoneResult.rows[0].id;

    // Insert postcodes for this zone
    for (const postcode of zone.postcodes) {
      await query(
        `INSERT INTO zone_postcodes (zone_id, postcode, is_excluded)
         VALUES ($1, $2, $3)`,
        [zoneId, postcode, false]
      );
    }
  }

  logger.info('Shipping zones seeded successfully');
}

// Run seed if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase()
    .then(() => {
      logger.info('Seed completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Seed failed:', error);
      process.exit(1);
    });
}

/**
 * Example Usage of Mock System
 * Copy these patterns to your components
 */

 

'use client';

import React, { useState, useEffect } from 'react';
import {
  fake_login,
  fake_getProducts,
  fake_getFeaturedProducts,
  fake_addToCart,
  fake_getCart,
  fake_getShippingOptions
} from './services';
import type { Product, Cart, AuthSession, ShippingOption } from '@/types';

// ============================================================================
// Example 1: Login Component
// ============================================================================
export function ExampleLogin() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const identifier = formData.get('identifier') as string;
    const password = formData.get('password') as string;

    const response = await fake_login({ identifier, password });

    if (response.success && response.data) {
      setSession(response.data);
      // In real app: update auth store (Zustand)
    } else {
      setError(response.error?.message || 'Error al iniciar sesión');
    }

    setLoading(false);
  };

  return (
    <div>
      <h2>Login Example</h2>
      {session ? (
        <div>
          <p>Bienvenido, {session.user.first_name}!</p>
          <p>Email: {session.user.email}</p>
          <p>Rol: {session.user.role}</p>
        </div>
      ) : (
        <form onSubmit={handleLogin}>
          <input
            name="identifier"
            type="text"
            placeholder="Email o usuario"
            defaultValue="owner@valplas.net"
          />
          <input
            name="password"
            type="password"
            placeholder="Contraseña"
            defaultValue="Valplas123"
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Cargando...' : 'Ingresar'}
          </button>
          {error && <p style={{ color: 'red' }}>{error}</p>}
        </form>
      )}
    </div>
  );
}

// ============================================================================
// Example 2: Product List with Filters
// ============================================================================
export function ExampleProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadProducts();
  }, [page]);

  const loadProducts = async () => {
    setLoading(true);

    const response = await fake_getProducts(
      {
        // category_id: 'cat-004', // Uncomment to filter by category
        // min_price: 1000,
        // max_price: 5000,
        // search: 'bolsas',
        is_active: true
      },
      {
        page,
        limit: 10
      }
    );

    if (response.success && response.data) {
      setProducts(response.data);
      setTotal(response.pagination?.total || 0);
    }

    setLoading(false);
  };

  if (loading) return <div>Cargando productos...</div>;

  return (
    <div>
      <h2>Productos ({total} total)</h2>
      <div>
        {products.map((product) => (
          <div
            key={product.id}
            style={{ border: '1px solid #ccc', padding: '10px', margin: '10px' }}
          >
            <h3>{product.name}</h3>
            <p>{product.description}</p>
            <p>
              <strong>${product.final_price.toLocaleString('es-AR')}</strong>
            </p>
            <p>Stock: {product.available_stock}</p>
            <p>
              Categoría: {product.category?.name} | Marca: {product.brand?.name}
            </p>
          </div>
        ))}
      </div>
      <div>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
          Anterior
        </button>
        <span>
          {' '}
          Página {page} de {Math.ceil(total / 10)}{' '}
        </span>
        <button onClick={() => setPage((p) => p + 1)} disabled={page >= Math.ceil(total / 10)}>
          Siguiente
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Example 3: Featured Products (Home Page)
// ============================================================================
export function ExampleFeaturedProducts() {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    loadFeatured();
  }, []);

  const loadFeatured = async () => {
    const response = await fake_getFeaturedProducts(8);
    if (response.success && response.data) {
      setProducts(response.data);
    }
  };

  return (
    <div>
      <h2>Productos Destacados</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
        {products.map((product) => (
          <div key={product.id} style={{ border: '1px solid #ccc', padding: '10px' }}>
            <img
              src={product.image_url}
              alt={product.name}
              style={{ width: '100%', height: '200px', objectFit: 'cover' }}
            />
            <h4>{product.name}</h4>
            <p>${product.final_price.toLocaleString('es-AR')}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Example 4: Shopping Cart
// ============================================================================
export function ExampleCart() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);

  const userId = 'user-004'; // In real app: from auth store

  useEffect(() => {
    loadCart();
  }, []);

  const loadCart = async () => {
    const response = await fake_getCart(userId);
    if (response.success && response.data) {
      setCart(response.data);
    }
  };

  const addProduct = async (productId: string, quantity: number) => {
    setLoading(true);
    const response = await fake_addToCart(productId, quantity, userId);

    if (response.success && response.data) {
      setCart(response.data);
    } else {
      alert(response.error?.message);
    }
    setLoading(false);
  };

  if (!cart) return <div>Cargando carrito...</div>;

  return (
    <div>
      <h2>Carrito de Compras</h2>
      {cart.items.length === 0 ? (
        <p>El carrito está vacío</p>
      ) : (
        <div>
          {cart.items.map((item) => (
            <div
              key={item.product_id}
              style={{ border: '1px solid #ccc', padding: '10px', margin: '10px' }}
            >
              <h4>{item.product?.name}</h4>
              <p>Cantidad: {item.quantity}</p>
              <p>Precio unitario: ${item.product?.final_price.toLocaleString('es-AR')}</p>
              <p>
                Subtotal: $
                {((item.product?.final_price || 0) * item.quantity).toLocaleString('es-AR')}
              </p>
            </div>
          ))}

          <div style={{ marginTop: '20px', fontSize: '18px', fontWeight: 'bold' }}>
            <p>Subtotal: ${cart.subtotal.toLocaleString('es-AR')}</p>
            <p>Envío: ${cart.shipping_cost.toLocaleString('es-AR')}</p>
            <p>TOTAL: ${cart.total.toLocaleString('es-AR')}</p>
          </div>
        </div>
      )}

      <div style={{ marginTop: '20px' }}>
        <h3>Agregar producto de prueba</h3>
        <button onClick={() => addProduct('prod-001', 1)} disabled={loading}>
          Agregar Bolsas 40x60
        </button>
        <button onClick={() => addProduct('prod-005', 1)} disabled={loading}>
          Agregar Ariel 3L
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Example 5: Shipping Calculator
// ============================================================================
export function ExampleShipping() {
  const [postcode, setPostcode] = useState('1043');
  const [amount, setAmount] = useState(10000);
  const [result, setResult] = useState<{
    success: boolean;
    data?: ShippingOption[];
    error?: { message: string };
  } | null>(null);

  const calculate = async () => {
    const response = await fake_getShippingOptions(postcode, amount);
    setResult(response);
  };

  return (
    <div>
      <h2>Calculadora de Envío</h2>
      <div>
        <input
          type="text"
          placeholder="Código Postal"
          value={postcode}
          onChange={(e) => setPostcode(e.target.value)}
        />
        <input
          type="number"
          placeholder="Monto del carrito"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <button onClick={calculate}>Calcular</button>
      </div>

      {result && (
        <div style={{ marginTop: '20px' }}>
          {result.success ? (
            <div>
              <h3>Opciones de envío:</h3>
              {result.data?.map((option, i) => (
                <div key={i} style={{ border: '1px solid #ccc', padding: '10px', margin: '10px' }}>
                  <p>
                    <strong>{option.carrier_name}</strong>
                  </p>
                  <p>Costo: ${option.cost.toLocaleString('es-AR')}</p>
                  <p>Tiempo estimado: {option.estimated_days} días</p>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'red' }}>{result.error?.message}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Example 6: Complete Test Page
// ============================================================================
export function MockSystemDemo() {
  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Mock System Demo</h1>

      <section style={{ marginBottom: '40px' }}>
        <ExampleLogin />
      </section>

      <section style={{ marginBottom: '40px' }}>
        <ExampleFeaturedProducts />
      </section>

      <section style={{ marginBottom: '40px' }}>
        <ExampleProductList />
      </section>

      <section style={{ marginBottom: '40px' }}>
        <ExampleCart />
      </section>

      <section style={{ marginBottom: '40px' }}>
        <ExampleShipping />
      </section>
    </div>
  );
}

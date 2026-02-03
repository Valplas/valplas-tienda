// apps/web/src/app/api-test/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useAuth } from '@/hooks/useAuth';

// Move StatusBadge outside component to fix React Compiler error
const StatusBadge = ({ status }: { status: 'pending' | 'success' | 'error' }) => {
  const colors = {
    pending: 'bg-yellow-100 text-yellow-800',
    success: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800'
  };

  const labels = {
    pending: '⏳ Pendiente',
    success: '✅ OK',
    error: '❌ Error'
  };

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[status]}`}>
      {labels[status]}
    </span>
  );
};

export default function ApiTestPage() {
  const { products, isLoading, error, pagination } = useProducts({ limit: 5 });
  const { user, isAuthenticated, login, logout } = useAuth();
  const [testStatus, setTestStatus] = useState<{
    backend: 'pending' | 'success' | 'error';
    auth: 'pending' | 'success' | 'error';
    products: 'pending' | 'success' | 'error';
  }>({
    backend: 'pending',
    auth: 'pending',
    products: 'pending'
  });

  useEffect(() => {
    // Test backend connection
    fetch('http://localhost:3001/health')
      .then((res) => res.json())
      .then(() => {
        queueMicrotask(() => {
          setTestStatus((prev) => ({ ...prev, backend: 'success' }));
        });
      })
      .catch(() => {
        queueMicrotask(() => {
          setTestStatus((prev) => ({ ...prev, backend: 'error' }));
        });
      });
  }, []);

  useEffect(() => {
    if (!isLoading) {
      queueMicrotask(() => {
        if (error) {
          setTestStatus((prev) => ({ ...prev, products: 'error' }));
        } else if (products.length > 0) {
          setTestStatus((prev) => ({ ...prev, products: 'success' }));
        }
      });
    }
  }, [products, isLoading, error]);

  const handleTestLogin = async () => {
    try {
      await login({
        emailOrUsername: 'cliente@test.com',
        password: 'password123'
      });
      setTestStatus((prev) => ({ ...prev, auth: 'success' }));
    } catch (err) {
      console.error('Login error:', err);
      setTestStatus((prev) => ({ ...prev, auth: 'error' }));
    }
  };

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">🔌 Test de Conexión API</h1>

      <div className="space-y-6">
        {/* Backend Health */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Backend Health</h2>
            <StatusBadge status={testStatus.backend} />
          </div>
          <p className="text-gray-600">
            Endpoint: <code className="bg-gray-100 px-2 py-1 rounded">http://localhost:3001/health</code>
          </p>
        </div>

        {/* Authentication */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Autenticación</h2>
            <StatusBadge status={testStatus.auth} />
          </div>

          {!isAuthenticated ? (
            <div>
              <p className="text-gray-600 mb-4">Usuario de prueba: cliente@test.com</p>
              <button
                onClick={handleTestLogin}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition"
              >
                Hacer Login de Prueba
              </button>
            </div>
          ) : (
            <div>
              <p className="text-green-600 font-medium mb-2">✅ Usuario autenticado</p>
              <div className="bg-gray-50 p-4 rounded mb-4">
                <p className="text-sm">
                  <strong>Email:</strong> {user?.email}
                </p>
                <p className="text-sm">
                  <strong>Rol:</strong> {user?.role}
                </p>
                <p className="text-sm">
                  <strong>Nombre:</strong> {user?.first_name} {user?.last_name}
                </p>
              </div>
              <button
                onClick={() => logout()}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition"
              >
                Cerrar Sesión
              </button>
            </div>
          )}
        </div>

        {/* Products */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Productos</h2>
            <StatusBadge status={testStatus.products} />
          </div>

          {isLoading && <p className="text-gray-600">Cargando productos...</p>}

          {error && <p className="text-red-600">Error: {error}</p>}

          {products.length > 0 && (
            <div>
              <p className="text-gray-600 mb-4">
                Mostrando {products.length} de {pagination?.total || 0} productos
              </p>
              <div className="space-y-3">
                {products.map((product) => (
                  <div key={product.id} className="border rounded p-4">
                    <h3 className="font-semibold">{product.name}</h3>
                    <p className="text-sm text-gray-600">SKU: {product.sku}</p>
                    <p className="text-sm text-gray-600">
                      Precio: ${(product.base_price / 100).toFixed(2)}
                    </p>
                    <p className="text-sm text-gray-600">
                      Stock: {product.stock - product.reserved_stock} disponibles
                    </p>
                    <p className="text-sm text-gray-600">Categoría: {product.category.name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* API Documentation */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">📚 Documentación API</h2>
          <a
            href="http://localhost:3001/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-700 underline"
          >
            Ver Swagger Docs →
          </a>
        </div>
      </div>
    </div>
  );
}

import { describe, it, expect } from 'vitest';
import { defaultRedirectForRole, sanitizeRedirect } from '../../modules/auth/oauth-redirect.js';

describe('sanitizeRedirect', () => {
  it.each(['/checkout', '/cuenta?tab=pedidos', '/productos/abc-123'])('acepta %s', (path) => {
    expect(sanitizeRedirect(path)).toBe(path);
  });

  it.each([
    '//evil.com',
    '/\\evil.com',
    '/\t/evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    '',
    `/${'a'.repeat(600)}`
  ])('rechaza %j', (path) => {
    expect(sanitizeRedirect(path)).toBeNull();
  });

  it('rechaza valores que no son string', () => {
    expect(sanitizeRedirect(undefined)).toBeNull();
    expect(sanitizeRedirect(['/a'])).toBeNull();
  });
});

describe('defaultRedirectForRole', () => {
  it('manda admin/owner al backoffice y al resto a /cuenta', () => {
    expect(defaultRedirectForRole('owner')).toBe('/admin');
    expect(defaultRedirectForRole('admin')).toBe('/admin');
    expect(defaultRedirectForRole('customer')).toBe('/cuenta');
  });
});

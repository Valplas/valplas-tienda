// apps/api/src/tests/auth/auth.basic.test.ts

import { describe, it, expect } from 'vitest';
import * as authService from '../../modules/auth/auth.service.js';

describe('Auth Service - Basic Tests', () => {
  it('should complete full auth flow: register → login → verify token', async () => {
    // 1. Register
    const userData = {
      email: 'basictest@test.com',
      username: 'basictest123',
      password: 'Test1234',
      firstName: 'Basic',
      lastName: 'Test',
      phone: '+541188887777'
    };

    const registerResult = await authService.register(userData);

    expect(registerResult).toBeDefined();
    expect(registerResult.user.email).toBe(userData.email);
    expect(registerResult.accessToken).toBeDefined();
    expect(registerResult.refreshToken).toBeDefined();

    // 2. Login
    const loginResult = await authService.login({
      emailOrUsername: userData.email,
      password: userData.password
    });

    expect(loginResult.user.id).toBe(registerResult.user.id);
    expect(loginResult.accessToken).toBeDefined();

    // 3. Verify token
    const decoded = authService.verifyAccessToken(loginResult.accessToken);
    expect(decoded.userId).toBe(registerResult.user.id);
    expect(decoded.role).toBe('customer');
  });

  it('should reject duplicate email', async () => {
    const userData = {
      email: 'duplicate@test.com',
      username: 'duplicate123',
      password: 'Test1234',
      firstName: 'Dup',
      lastName: 'Test'
    };

    await authService.register(userData);

    await expect(
      authService.register({
        ...userData,
        username: 'different'
      })
    ).rejects.toThrow('EMAIL_ALREADY_EXISTS');
  });

  it('should reject invalid credentials', async () => {
    const userData = {
      email: 'creds@test.com',
      username: 'creds123',
      password: 'Test1234',
      firstName: 'Creds',
      lastName: 'Test'
    };

    await authService.register(userData);

    await expect(
      authService.login({
        emailOrUsername: userData.email,
        password: 'wrongpassword'
      })
    ).rejects.toThrow();
  });
});

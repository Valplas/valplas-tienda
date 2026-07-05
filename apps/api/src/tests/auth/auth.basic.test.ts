// apps/api/src/tests/auth/auth.basic.test.ts

import { describe, it, expect } from 'vitest';
import * as authService from '../../modules/auth/auth.service.js';
import { createTestUser, uniqueSuffix } from '../helpers.js';

describe('Auth Service - Basic Tests', () => {
  it('should complete full auth flow: register → login → verify token', async () => {
    const user = await createTestUser();

    expect(user.id).toBeDefined();
    expect(user.accessToken).toBeDefined();
    expect(user.refreshToken).toBeDefined();

    const loginResult = await authService.login({
      emailOrUsername: user.email,
      password: user.password
    });

    expect(loginResult.user.id).toBe(user.id);
    expect(loginResult.accessToken).toBeDefined();

    const decoded = authService.verifyAccessToken(loginResult.accessToken);
    expect(decoded.userId).toBe(user.id);
    expect(decoded.role).toBe('customer');
  });

  it('should reject duplicate email', async () => {
    const user = await createTestUser();

    await expect(
      authService.register({
        email: user.email,
        username: `vt_other_${uniqueSuffix()}`,
        password: 'Test1234!',
        firstName: 'Dup',
        lastName: 'Test'
      })
    ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS' });
  });

  it('should reject invalid credentials', async () => {
    const user = await createTestUser();

    await expect(
      authService.login({
        emailOrUsername: user.email,
        password: 'wrongpassword'
      })
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
});

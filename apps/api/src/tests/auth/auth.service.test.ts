// apps/api/src/tests/auth/auth.service.test.ts
//
// Tests del servicio de auth contra la DB real. Cada test crea sus propios
// usuarios (@vitest.local) — sin dependencia de usuarios seed ni de sus passwords.

import { describe, it, expect } from 'vitest';
import * as authService from '../../modules/auth/auth.service.js';
import { query } from '../../infrastructure/database/client.js';
import { createTestUser, uniqueSuffix } from '../helpers.js';

describe('Auth Service', () => {
  describe('register', () => {
    it('should create a new user with valid data', async () => {
      const suffix = uniqueSuffix();
      const userData = {
        email: `register-${suffix}@vitest.local`,
        username: `vt_reg_${suffix}`,
        password: 'Test1234!',
        firstName: 'Test',
        lastName: 'User'
      };

      const result = await authService.register(userData);

      expect(result.user).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe(userData.email);
      expect(result.user.username).toBe(userData.username);
      expect(result.user.role).toBe('customer');
      // Nunca exponer el hash, en ninguna convención de nombre
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result.user as any).password_hash).toBeUndefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result.user as any).passwordHash).toBeUndefined();
    });

    it('should reject duplicate email', async () => {
      const user = await createTestUser();

      await expect(
        authService.register({
          email: user.email,
          username: `vt_dup_${uniqueSuffix()}`,
          password: 'Test1234!',
          firstName: 'Test',
          lastName: 'User'
        })
      ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS' });
    });

    it('should reject duplicate username', async () => {
      const user = await createTestUser();

      await expect(
        authService.register({
          email: `dupuser-${uniqueSuffix()}@vitest.local`,
          username: user.username,
          password: 'Test1234!',
          firstName: 'Test',
          lastName: 'User'
        })
      ).rejects.toMatchObject({ code: 'USERNAME_ALREADY_EXISTS' });
    });

    it('should hash password correctly', async () => {
      const user = await createTestUser();

      const result = await query('SELECT password_hash FROM users WHERE email = $1', [user.email]);

      expect(result.rows[0].password_hash).toBeDefined();
      expect(result.rows[0].password_hash).not.toBe(user.password);
      expect(result.rows[0].password_hash.length).toBeGreaterThan(50); // bcrypt

      const loginResult = await authService.login({
        emailOrUsername: user.email,
        password: user.password
      });
      expect(loginResult.user.id).toBe(user.id);
    });
  });

  describe('login', () => {
    it('should login with valid email and password', async () => {
      const user = await createTestUser();

      const result = await authService.login({
        emailOrUsername: user.email,
        password: user.password
      });

      expect(result.user.email).toBe(user.email);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('should login with valid username and password', async () => {
      const user = await createTestUser();

      const result = await authService.login({
        emailOrUsername: user.username,
        password: user.password
      });

      expect(result.user.username).toBe(user.username);
      expect(result.accessToken).toBeDefined();
    });

    it('should reject invalid password', async () => {
      const user = await createTestUser();

      await expect(
        authService.login({
          emailOrUsername: user.email,
          password: 'wrongpassword'
        })
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });

    it('should reject non-existent user', async () => {
      await expect(
        authService.login({
          emailOrUsername: `ghost-${uniqueSuffix()}@vitest.local`,
          password: 'Test1234!'
        })
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });

    it('should reject inactive user', async () => {
      const suffix = uniqueSuffix();
      const hashedPassword = await authService.hashPassword('Test1234!');
      await query(
        `INSERT INTO users (email, username, password_hash, first_name, last_name, role, is_active)
         VALUES ($1, $2, $3, 'Inactive', 'User', 'customer', false)`,
        [`inactive-${suffix}@vitest.local`, `vt_inactive_${suffix}`, hashedPassword]
      );

      await expect(
        authService.login({
          emailOrUsername: `inactive-${suffix}@vitest.local`,
          password: 'Test1234!'
        })
      ).rejects.toMatchObject({ code: 'USER_INACTIVE' });
    });

    it('should update last_login_at on successful login', async () => {
      const user = await createTestUser();

      await authService.login({ emailOrUsername: user.email, password: user.password });

      const after = await query('SELECT last_login_at FROM users WHERE email = $1', [user.email]);
      expect(after.rows[0].last_login_at).not.toBeNull();
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify valid access token', async () => {
      const user = await createTestUser();

      const decoded = authService.verifyAccessToken(user.accessToken);

      expect(decoded.userId).toBe(user.id);
      expect(decoded.role).toBe('customer');
    });

    it('should reject invalid token', () => {
      expect(() => authService.verifyAccessToken('invalid.token.here')).toThrow();
    });
  });

  describe('refreshAccessToken', () => {
    it('should rotate the refresh token and issue a new access token', async () => {
      const user = await createTestUser();

      const rotated = await authService.refreshAccessToken(user.refreshToken);

      expect(rotated.accessToken).toBeDefined();
      expect(rotated.newRefreshToken).toBeDefined();
      expect(rotated.newRefreshToken).not.toBe(user.refreshToken);

      const decoded = authService.verifyAccessToken(rotated.accessToken);
      expect(decoded.userId).toBe(user.id);
    });

    it('should reject a refresh token that was already rotated (revoked)', async () => {
      const user = await createTestUser();

      await authService.refreshAccessToken(user.refreshToken);

      // El token viejo quedó revocado por la rotación
      await expect(authService.refreshAccessToken(user.refreshToken)).rejects.toMatchObject({
        code: 'INVALID_TOKEN'
      });
    });

    it('should reject a malformed refresh token', async () => {
      await expect(authService.refreshAccessToken('invalid.token.here')).rejects.toMatchObject({
        code: 'INVALID_TOKEN'
      });
    });
  });
});

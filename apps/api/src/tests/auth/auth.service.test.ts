// apps/api/src/tests/auth/auth.service.test.ts

import { describe, it, expect } from 'vitest';
import * as authService from '../../modules/auth/auth.service.js';
import { query } from '../../infrastructure/database/client.js';

describe('Auth Service', () => {
  describe('register', () => {
    it('should create a new user with valid data', async () => {
      const userData = {
        email: 'newuser@test.com',
        username: 'newuser123',
        password: 'Test1234',
        firstName: 'Test',
        lastName: 'User',
        phone: '+541199998888'
      };

      const result = await authService.register(userData);

      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe(userData.email);
      expect(result.user.username).toBe(userData.username);
      expect(result.user.role).toBe('customer');
      expect(result.user.isActive).toBe(true);
      expect(result.user.passwordHash).toBeUndefined(); // Should not return password
    });

    it('should reject duplicate email', async () => {
      const userData = {
        email: 'owner@valplas.net', // Already exists from seed
        username: 'newuser',
        password: 'Test1234',
        firstName: 'Test',
        lastName: 'User'
      };

      await expect(authService.register(userData)).rejects.toThrow();
    });

    it('should reject duplicate username', async () => {
      const userData = {
        email: 'newuser@example.com',
        username: 'owner', // Already exists from seed
        password: 'Test1234',
        firstName: 'Test',
        lastName: 'User'
      };

      await expect(authService.register(userData)).rejects.toThrow();
    });

    it('should hash password correctly', async () => {
      const userData = {
        email: 'hashtest@test.com',
        username: 'hashtest123',
        password: 'Test1234',
        firstName: 'Hash',
        lastName: 'Test',
        phone: '+541177776666'
      };

      const registerResult = await authService.register(userData);

      // Verify password is hashed in DB
      const result = await query('SELECT password_hash FROM users WHERE email = $1', [
        userData.email
      ]);

      expect(result.rows[0].password_hash).toBeDefined();
      expect(result.rows[0].password_hash).not.toBe(userData.password);
      expect(result.rows[0].password_hash.length).toBeGreaterThan(50); // bcrypt hash length

      // Verify can login with password
      const loginResult = await authService.login({
        emailOrUsername: userData.email,
        password: userData.password
      });
      expect(loginResult.user.id).toBe(registerResult.user.id);
    });
  });

  describe('login', () => {
    it('should login with valid email and password', async () => {
      const result = await authService.login({
        emailOrUsername: 'owner@valplas.net',
        password: 'password123'
      });

      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('owner@valplas.net');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('should login with valid username and password', async () => {
      const result = await authService.login({
        emailOrUsername: 'owner',
        password: 'password123'
      });

      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.username).toBe('owner');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('should reject invalid password', async () => {
      await expect(
        authService.login({
          emailOrUsername: 'owner@valplas.net',
          password: 'wrongpassword'
        })
      ).rejects.toThrow();
    });

    it('should reject non-existent user', async () => {
      await expect(
        authService.login({
          emailOrUsername: 'nonexistent@example.com',
          password: 'Test1234'
        })
      ).rejects.toThrow();
    });

    it('should reject inactive user', async () => {
      // Create inactive user
      const hashedPassword = await authService.hashPassword('Test1234');
      await query(
        `INSERT INTO users (email, username, password_hash, first_name, last_name, role, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['inactive@test.com', 'inactiveuser', hashedPassword, 'Inactive', 'User', 'customer', false]
      );

      await expect(
        authService.login({
          emailOrUsername: 'inactive@test.com',
          password: 'Test1234'
        })
      ).rejects.toThrow('USER_INACTIVE');
    });

    it('should update last_login_at on successful login', async () => {
      const beforeLogin = await query('SELECT last_login_at FROM users WHERE email = $1', [
        'owner@valplas.net'
      ]);

      await authService.login({
        emailOrUsername: 'owner@valplas.net',
        password: 'password123'
      });

      const afterLogin = await query('SELECT last_login_at FROM users WHERE email = $1', [
        'owner@valplas.net'
      ]);

      // last_login_at should be updated
      if (beforeLogin.rows[0].last_login_at) {
        expect(new Date(afterLogin.rows[0].last_login_at).getTime()).toBeGreaterThan(
          new Date(beforeLogin.rows[0].last_login_at).getTime()
        );
      } else {
        expect(afterLogin.rows[0].last_login_at).toBeDefined();
      }
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify valid access token', async () => {
      const loginResult = await authService.login({
        emailOrUsername: 'owner@valplas.net',
        password: 'password123'
      });

      const decoded = authService.verifyAccessToken(loginResult.accessToken);

      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe(loginResult.user.id);
      expect(decoded.role).toBe('owner');
    });

    it('should reject invalid token', () => {
      expect(() => {
        authService.verifyAccessToken('invalid.token.here');
      }).toThrow();
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify valid refresh token', async () => {
      const loginResult = await authService.login({
        emailOrUsername: 'owner@valplas.net',
        password: 'password123'
      });

      const decoded = authService.verifyRefreshToken(loginResult.refreshToken);

      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe(loginResult.user.id);
    });

    it('should reject invalid refresh token', () => {
      expect(() => {
        authService.verifyRefreshToken('invalid.token.here');
      }).toThrow();
    });
  });
});

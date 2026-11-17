// apps/api/src/tests/bot/bot.customers.test.ts
//
// Identificación de clientes del bot por teléfono contra la DB real. Los clientes que crea el
// bot llevan email @vitest.local para que los limpie setup.ts.

import { describe, it, expect } from 'vitest';
import * as botDomain from '../../modules/bot/bot.domain.js';
import { query } from '../../infrastructure/database/client.js';
import { createLegacyUser, randomMobilePhone, uniqueSuffix } from '../helpers.js';

const testEmail = () => `bot-${uniqueSuffix()}@vitest.local`;

/** wa_id de WhatsApp: dígitos con código de país y sin '+' */
const toWaId = (e164: string) => e164.slice(1);

/** El mismo celular sin el 9 de móvil, como queda un número cargado a mano ("11 ...") */
const withoutMobileNine = (e164: string) => e164.replace(/^\+549/, '+54');

describe('bot: findOrCreateCustomer', () => {
  it('crea el cliente con signup_channel whatsapp y como cuenta nueva (no admin-created)', async () => {
    const phone = randomMobilePhone();

    const result = await botDomain.findOrCreateCustomer({
      phone: toWaId(phone),
      first_name: 'Juana',
      email: testEmail()
    });

    expect(result.created).toBe(true);
    expect(result.customer.phone).toBe(phone);

    const row = await query<{
      signup_channel: string;
      is_admin_created: boolean;
      is_legacy: boolean;
      role: string;
      password_hash: string | null;
    }>(
      `SELECT signup_channel, is_admin_created, is_legacy, role, password_hash
       FROM users WHERE id = $1`,
      [result.customer.id]
    );
    expect(row.rows[0]).toMatchObject({
      signup_channel: 'whatsapp',
      is_admin_created: false,
      is_legacy: false,
      role: 'customer',
      password_hash: null
    });
  });

  it('devuelve el cliente existente sin modificar sus datos', async () => {
    const phone = randomMobilePhone();
    const first = await botDomain.findOrCreateCustomer({
      phone,
      first_name: 'Original',
      email: testEmail()
    });

    const second = await botDomain.findOrCreateCustomer({
      phone: toWaId(phone),
      first_name: 'Otro Nombre'
    });

    expect(second.created).toBe(false);
    expect(second.customer.id).toBe(first.customer.id);
    expect(second.customer.first_name).toBe('Original');
  });

  it('encuentra un cliente legacy cargado sin el 9 de móvil (no crea duplicado)', async () => {
    const phone = randomMobilePhone();
    const legacy = await createLegacyUser({ firstName: 'Legacy', phone: withoutMobileNine(phone) });

    const result = await botDomain.findOrCreateCustomer({
      phone: toWaId(phone),
      first_name: 'Desde WhatsApp'
    });

    expect(result.created).toBe(false);
    expect(result.customer.id).toBe(legacy.id);
  });

  it('prioriza la cuenta con el teléfono idéntico si hay duplicados por clave', async () => {
    const phone = randomMobilePhone();
    await createLegacyUser({ phone: withoutMobileNine(phone) });
    const exact = await createLegacyUser({ phone });

    const result = await botDomain.findCustomerByPhone(toWaId(phone));
    expect(result.id).toBe(exact.id);
  });

  it('rechaza teléfonos inválidos con 400 INVALID_PHONE', async () => {
    await expect(
      botDomain.findOrCreateCustomer({ phone: '12345678', first_name: 'X' })
    ).rejects.toMatchObject({ code: 'INVALID_PHONE', statusCode: 400 });
  });

  it('responde 403 si la única cuenta del teléfono está desactivada', async () => {
    const phone = randomMobilePhone();
    const legacy = await createLegacyUser({ phone });
    await query('UPDATE users SET is_active = false WHERE id = $1', [legacy.id]);

    await expect(botDomain.findOrCreateCustomer({ phone, first_name: 'X' })).rejects.toMatchObject({
      code: 'CUSTOMER_INACTIVE',
      statusCode: 403
    });
  });

  it('responde 409 EMAIL_IN_USE si el email ya es de otra cuenta', async () => {
    const email = testEmail();
    await botDomain.findOrCreateCustomer({ phone: randomMobilePhone(), first_name: 'A', email });

    await expect(
      botDomain.findOrCreateCustomer({ phone: randomMobilePhone(), first_name: 'B', email })
    ).rejects.toMatchObject({ code: 'EMAIL_IN_USE', statusCode: 409 });
  });
});

describe('bot: findCustomerByPhone', () => {
  it('404 CUSTOMER_NOT_FOUND para un teléfono desconocido', async () => {
    await expect(botDomain.findCustomerByPhone(randomMobilePhone())).rejects.toMatchObject({
      code: 'CUSTOMER_NOT_FOUND',
      statusCode: 404
    });
  });
});

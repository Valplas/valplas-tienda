import * as userRepository from '../../users/user.repository.js';
import { sendTextMessage } from '../whatsapp.client.js';
import { upsertSession } from '../session.repository.js';
import type { WhatsAppSession } from '../whatsapp.types.js';
import { showMainMenu } from './menu.handler.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function handleRegistration(phone: string): Promise<void> {
  await upsertSession(phone, 'awaiting_name', { cart: [] });
  await sendTextMessage(
    phone,
    '¡Hola! Soy el bot de Valplas 👋\n\nPara empezar, ¿cómo te llamás?'
  );
}

export async function handleAwaitingName(
  session: WhatsAppSession,
  name: string
): Promise<void> {
  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length < 2) {
    await sendTextMessage(session.phone, 'Por favor ingresá tu nombre completo.');
    return;
  }

  // Generar username a partir de los dígitos del teléfono
  const digits = session.phone.replace(/\D/g, '');
  const username = `wsp_${digits.slice(-8)}`;

  // Crear usuario con contraseña random (no se usa para login)
  const passwordHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);

  const user = await userRepository.createUser(
    {
      username,
      phone: session.phone,
      first_name: trimmedName,
      password: '',
      role: 'customer',
      is_active: true
    },
    passwordHash
  );

  await upsertSession(session.phone, 'idle', { cart: [] }, user.id);
  await showMainMenu(session.phone);
}

import { query } from '../../infrastructure/database/client.js';
import type { ConversationState, SessionContext, WhatsAppSession } from './whatsapp.types.js';

function mapRow(row: Record<string, unknown>): WhatsAppSession {
  return {
    id: row.id as string,
    phone: row.phone as string,
    userId: row.user_id as string | null,
    state: row.state as ConversationState,
    context: row.context as SessionContext,
    lastMessageId: row.last_message_id as string | null,
    expiresAt: row.expires_at as Date,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date
  };
}

export async function findSessionByPhone(phone: string): Promise<WhatsAppSession | null> {
  const result = await query<Record<string, unknown>>(
    `SELECT * FROM whatsapp_sessions WHERE phone = $1`,
    [phone]
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function upsertSession(
  phone: string,
  state: ConversationState,
  context: SessionContext,
  userId?: string | null
): Promise<WhatsAppSession> {
  const result = await query<Record<string, unknown>>(
    `INSERT INTO whatsapp_sessions (phone, user_id, state, context, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 minutes')
     ON CONFLICT (phone) DO UPDATE SET
       state = EXCLUDED.state,
       context = EXCLUDED.context,
       user_id = COALESCE($2, whatsapp_sessions.user_id),
       expires_at = NOW() + INTERVAL '30 minutes',
       updated_at = NOW()
     RETURNING *`,
    [phone, userId ?? null, state, JSON.stringify(context)]
  );
  return mapRow(result.rows[0]);
}

export async function updateSessionState(
  phone: string,
  state: ConversationState,
  context: SessionContext,
  lastMessageId?: string
): Promise<void> {
  await query(
    `UPDATE whatsapp_sessions
     SET state = $2, context = $3, last_message_id = COALESCE($4, last_message_id),
         expires_at = NOW() + INTERVAL '30 minutes', updated_at = NOW()
     WHERE phone = $1`,
    [phone, state, JSON.stringify(context), lastMessageId ?? null]
  );
}

export async function deleteExpiredSessions(): Promise<number> {
  const result = await query<Record<string, unknown>>(
    `DELETE FROM whatsapp_sessions WHERE expires_at < NOW()`
  );
  return result.rowCount ?? 0;
}

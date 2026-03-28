import { env } from '../../env.js';

const META_API_URL = `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

export async function sendTextMessage(to: string, body: string): Promise<void> {
  const response = await fetch(META_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WhatsApp API error ${response.status}: ${error}`);
  }
}

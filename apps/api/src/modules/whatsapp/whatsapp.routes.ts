import { Router } from 'express';
import { verifyWebhook, receiveWebhook } from './whatsapp.controller.js';

const router = Router();

// GET /webhooks/whatsapp — verificación del webhook por Meta
router.get('/', verifyWebhook);

// POST /webhooks/whatsapp — mensajes entrantes
router.post('/', receiveWebhook);

export default router;

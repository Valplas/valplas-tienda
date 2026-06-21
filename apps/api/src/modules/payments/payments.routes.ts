import { Router } from 'express';
import { handleWebhook, handleOAuthCallback } from './payments.controller.js';

const router = Router();

router.post('/webhook', handleWebhook);
router.get('/oauth/callback', handleOAuthCallback);

export default router;

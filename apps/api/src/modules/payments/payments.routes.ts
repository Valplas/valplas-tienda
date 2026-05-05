import { Router } from 'express';
import { handleWebhook } from './payments.controller.js';

const router = Router();

router.post('/webhook', handleWebhook);

export default router;

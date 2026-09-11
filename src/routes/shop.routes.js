import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAdmin } from '../middleware/auth.js';
import { ratesSchema, settingsSchema } from '../lib/schemas.js';
import * as shop from '../services/shop.js';
import * as reports from '../services/reports.js';
import { asyncHandler } from '../lib/helpers.js';

const router = Router();

router.get('/rates', asyncHandler(async (_req, res) => {
  res.json(await shop.getRates());
}));

// आज का भाव — staff भी डाल सकता है
router.put('/rates', validate(ratesSchema), asyncHandler(async (req, res) => {
  res.json(await shop.updateRates(req.body));
}));

router.get('/settings', asyncHandler(async (_req, res) => {
  res.json(await shop.getSettings());
}));

// दुकान का नाम, पता, GST, बिल की छपाई — सिर्फ मालिक / Admin
router.put('/settings', requireAdmin, validate(settingsSchema), asyncHandler(async (req, res) => {
  res.json(await shop.updateSettings(req.body));
}));

router.get('/dashboard', asyncHandler(async (_req, res) => {
  res.json(await reports.dashboard());
}));

export default router;

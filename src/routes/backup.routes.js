import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAdmin } from '../middleware/auth.js';
import { restoreSchema } from '../lib/schemas.js';
import * as backup from '../services/backup.js';
import { seedDemoData } from '../services/seed.js';
import { asyncHandler, todayStr } from '../lib/helpers.js';
import { notFound } from '../lib/errors.js';

const router = Router();

// ?download=1 पर वही .json फाइल मिलती है जो ऐप के Backup पेज से बनती है.
// (ऐप का सारा डेटा इसी से लोड होता है, इसलिए staff के लिए भी खुला)
router.get('/', asyncHandler(async (req, res) => {
  const data = await backup.exportAll();
  if (req.query.download === '1' || req.query.download === 'true') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="ShreejiGold_Backup_' + todayStr() + '.json"',
    );
  }
  res.send(JSON.stringify(data, null, 2));
}));

// मौजूदा डेटा हटाने वाले काम — सिर्फ मालिक / Admin
router.post('/restore', requireAdmin, validate(restoreSchema), asyncHandler(async (req, res) => {
  res.json(await backup.importAll(req.body));
}));

router.post('/seed-demo', requireAdmin, asyncHandler(async (_req, res) => {
  res.json(await seedDemoData());
}));

router.delete('/all', requireAdmin, asyncHandler(async (_req, res) => {
  res.json(await backup.clearAll());
}));

// ---- अपने आप बनने वाली कॉपियाँ (डेटाबेस के अंदर ही) ----

router.get('/snapshots', asyncHandler(async (_req, res) => {
  res.json(await backup.listSnapshots());
}));

router.post('/snapshots', asyncHandler(async (req, res) => {
  res.status(201).json(await backup.createSnapshot(req.query.label || 'manual'));
}));

// किसी पुरानी कॉपी का पूरा डेटा — डाउनलोड करने के लिए
router.get('/snapshots/:id', asyncHandler(async (req, res) => {
  const data = await backup.getSnapshot(req.params.id);
  if (!data) throw notFound('यह कॉपी नहीं मिली');
  if (req.query.download === '1') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + req.params.id + '.json"');
  }
  res.send(JSON.stringify(data, null, 2));
}));

// पुरानी कॉपी से पूरा डेटा वापस लाएं — मौजूदा डेटा बदलता है, इसलिए सिर्फ मालिक / Admin
router.post('/snapshots/:id/restore', requireAdmin, asyncHandler(async (req, res) => {
  const data = await backup.getSnapshot(req.params.id);
  if (!data) throw notFound('यह कॉपी नहीं मिली');
  res.json(await backup.importAll(data));
}));

export default router;

import { Router } from 'express';
import { quickSearch } from '../services/search.js';
import { asyncHandler } from '../lib/helpers.js';

const router = Router();

// ?q=रमेश&limit=8 — ग्राहक और बिल, दोनों एक ही जवाब में
router.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 25);
  res.json(await quickSearch(req.query.q, limit));
}));

export default router;

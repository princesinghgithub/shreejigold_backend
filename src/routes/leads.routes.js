import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { leadUpdateSchema } from '../lib/schemas.js';
import * as leads from '../services/leads.js';
import { asyncHandler } from '../lib/helpers.js';

// Website से आई enquiries — admin panel से (लॉगिन के बाद)
const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json(await leads.listLeads({ status: req.query.status }));
}));

router.put('/:id', validate(leadUpdateSchema), asyncHandler(async (req, res) => {
  res.json(await leads.updateLead(req.params.id, req.body));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  res.json(await leads.deleteLead(req.params.id));
}));

export default router;

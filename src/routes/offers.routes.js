import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { offerCreateSchema, offerUpdateSchema } from '../lib/schemas.js';
import * as offers from '../services/offers.js';
import { asyncHandler } from '../lib/helpers.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json(await offers.listOffers({ activeOnly: req.query.active === '1' || req.query.active === 'true' }));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await offers.getOffer(req.params.id));
}));

router.post('/', validate(offerCreateSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await offers.createOffer(req.body));
}));

router.put('/:id', validate(offerUpdateSchema), asyncHandler(async (req, res) => {
  res.json(await offers.updateOffer(req.params.id, req.body));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  res.json(await offers.deleteOffer(req.params.id));
}));

export default router;

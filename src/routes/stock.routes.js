import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { stockCreateSchema, stockUpdateSchema } from '../lib/schemas.js';
import * as stock from '../services/stock.js';
import { asyncHandler } from '../lib/helpers.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json(await stock.listStock({ category: req.query.category, search: req.query.search }));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await stock.getStockItem(req.params.id));
}));

router.post('/', validate(stockCreateSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await stock.createStockItem(req.body));
}));

router.put('/:id', validate(stockUpdateSchema), asyncHandler(async (req, res) => {
  res.json(await stock.updateStockItem(req.params.id, req.body));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  res.json(await stock.deleteStockItem(req.params.id));
}));

export default router;

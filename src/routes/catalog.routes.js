import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { productCreateSchema, productUpdateSchema } from '../lib/schemas.js';
import * as catalog from '../services/catalog.js';
import { asyncHandler } from '../lib/helpers.js';

// Website catalog — admin panel से (लॉगिन के बाद)
const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  res.json(await catalog.listProducts());
}));

router.post('/', validate(productCreateSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await catalog.createProduct(req.body));
}));

// website के पहले से बने designs — जो catalog में नहीं हैं वही जुड़ते हैं
router.post('/import-defaults', asyncHandler(async (_req, res) => {
  res.json(await catalog.importWebsiteDefaults());
}));

router.put('/:id', validate(productUpdateSchema), asyncHandler(async (req, res) => {
  res.json(await catalog.updateProduct(req.params.id, req.body));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  res.json(await catalog.deleteProduct(req.params.id));
}));

export default router;

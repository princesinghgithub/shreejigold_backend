import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { userCreateSchema, userUpdateSchema } from '../lib/schemas.js';
import * as users from '../services/users.js';
import { asyncHandler } from '../lib/helpers.js';

// दुकान के users (staff / admin) — सिर्फ मालिक या Admin (app.js में requireAdmin)
const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  res.json(await users.listUsers());
}));

// नया user — admin dashboard का register फॉर्म
router.post('/', validate(userCreateSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await users.createUser(req.body));
}));

router.put('/:id', validate(userUpdateSchema), asyncHandler(async (req, res) => {
  res.json(await users.updateUser(req.params.id, req.body, req.user));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  res.json(await users.deleteUser(req.params.id, req.user));
}));

export default router;

import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { customerCreateSchema, customerUpdateSchema, ledgerSchema } from '../lib/schemas.js';
import * as customers from '../services/customers.js';
import { asyncHandler } from '../lib/helpers.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json(await customers.listCustomers({ search: req.query.search }));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await customers.getCustomer(req.params.id));
}));

router.post('/', validate(customerCreateSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await customers.createCustomer(req.body));
}));

router.put('/:id', validate(customerUpdateSchema), asyncHandler(async (req, res) => {
  res.json(await customers.updateCustomer(req.params.id, req.body));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  res.json(await customers.deleteCustomer(req.params.id));
}));

// उधारी खाता — amount + = बकाया बढ़ा, - = जमा हुआ
router.post('/:id/ledger', validate(ledgerSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await customers.addLedgerEntry(req.params.id, req.body));
}));

router.delete('/:id/ledger/:entryId', asyncHandler(async (req, res) => {
  res.json(await customers.deleteLedgerEntry(req.params.id, req.params.entryId));
}));

export default router;

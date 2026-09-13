import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { customerCreateSchema, customerUpdateSchema, ledgerSchema } from '../lib/schemas.js';
import * as customers from '../services/customers.js';
import { asyncHandler } from '../lib/helpers.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json(await customers.listCustomers({ search: req.query.search }));
}));

// एक ही नंबर/नाम वाले खाते — "/:id" से ऊपर रहना ज़रूरी है, वरना id समझ लिया जाएगा
router.get('/duplicates', asyncHandler(async (_req, res) => {
  res.json(await customers.findDuplicates());
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await customers.getCustomer(req.params.id));
}));

// वही ग्राहक पहले से हो तो 409 — जान-बूझकर नया बनाना हो तो allowDuplicate: true
router.post('/', validate(customerCreateSchema), asyncHandler(async (req, res) => {
  const { allowDuplicate, ...input } = req.body;
  res.status(201).json(allowDuplicate
    ? await customers.createCustomer(input)
    : await customers.createCustomerChecked(input));
}));

// दो खाते मिलाकर एक — { from } वाला खाता इसी में समा जाता है
router.post('/:id/merge', asyncHandler(async (req, res) => {
  res.json(await customers.mergeCustomers(req.params.id, req.body && req.body.from));
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

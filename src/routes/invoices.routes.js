import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { invoiceCreateSchema, paymentSchema } from '../lib/schemas.js';
import * as invoices from '../services/invoices.js';
import { asyncHandler } from '../lib/helpers.js';

const router = Router();

// ?from=&to=&type=sale|purchase&gstMode=gst|nongst&customerId=&billNo=&search=&limit=&offset=
router.get('/', asyncHandler(async (req, res) => {
  res.json(await invoices.listInvoices(req.query));
}));

router.get('/barcode/:code', asyncHandler(async (req, res) => {
  res.json(await invoices.getInvoiceByBarcode(req.params.code));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await invoices.getInvoice(req.params.id));
}));

// बिल बनाएं — total सर्वर खुद निकालता है, stock और ग्राहक का खाता अपने आप अपडेट
router.post('/', validate(invoiceCreateSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await invoices.createInvoice(req.body));
}));

router.post('/:id/payment', validate(paymentSchema), asyncHandler(async (req, res) => {
  res.json(await invoices.recordPayment(req.params.id, req.body.amount, req.body.note, req.body.mode));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  res.json(await invoices.deleteInvoice(req.params.id));
}));

export default router;

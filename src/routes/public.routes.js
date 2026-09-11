import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { leadPublicSchema } from '../lib/schemas.js';
import * as catalog from '../services/catalog.js';
import * as leads from '../services/leads.js';
import * as invoices from '../services/invoices.js';
import { asyncHandler } from '../lib/helpers.js';
import { notFound } from '../lib/errors.js';
import { rateLimit } from '../middleware/rateLimit.js';

// Website के लिए — बिना login. सिर्फ पढ़ना (catalog, फोटो, बिल की जाँच) और enquiry भेजना.
const router = Router();

const leadLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many requests — please try again in a few minutes, or message us on WhatsApp',
});

// बिल नंबर अंदाज़े से ढूँढने की कोशिश रोकने के लिए — एक IP से 15 मिनट में 60 जाँच
const billCheckLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  name: 'public-bill-check',
  message: 'Too many checks — please try again in a few minutes',
});

router.get('/catalog', asyncHandler(async (_req, res) => {
  // admin में बदलाव एक मिनट के अंदर website पर दिखे
  res.set('Cache-Control', 'public, max-age=60');
  res.json(await catalog.publicCatalog());
}));

router.get('/products/:id/image', asyncHandler(async (req, res) => {
  const img = await catalog.getProductImage(req.params.id);
  if (!img) throw notFound('Photo not found');
  res.set('Content-Type', img.contentType);
  // फोटो बदलने पर पते का ?v= बदल जाता है, इसलिए लंबा cache सुरक्षित है
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(img.data);
}));

// बिल पर छपे QR से — "यह बिल असली है?"
router.get('/bills/:code', billCheckLimit, asyncHandler(async (req, res) => {
  const bill = await invoices.publicBill(req.params.code);
  if (!bill) throw notFound('Bill not found');
  res.set('Cache-Control', 'no-store');
  res.json(bill);
}));

router.post('/leads', leadLimit, validate(leadPublicSchema), asyncHandler(async (req, res) => {
  // छिपा "website" खाना सिर्फ bots भरते हैं — उन्हें सफल जवाब दें, पर सेव न करें
  if (req.body.website) return res.status(201).json({ ok: true });
  const lead = await leads.createLead(req.body);
  return res.status(201).json({ ok: true, id: lead.id });
}));

export default router;

import { Router } from 'express';
import * as reports from '../services/reports.js';
import { asyncHandler, todayStr } from '../lib/helpers.js';

const router = Router();

// ?from=&to=&type=&gstMode=&customerId=&search=
router.get('/', asyncHandler(async (req, res) => {
  res.json(await reports.rangeReport(req.query));
}));

router.get('/daily', asyncHandler(async (req, res) => {
  const day = req.query.date || todayStr();
  res.json(await reports.rangeReport({ ...req.query, from: day, to: day }));
}));

// ?month=YYYY-MM
router.get('/monthly', asyncHandler(async (req, res) => {
  const month = req.query.month || todayStr().slice(0, 7);
  res.json(await reports.rangeReport({ ...req.query, from: month + '-01', to: month + '-31' }));
}));

router.get('/export.csv', asyncHandler(async (req, res) => {
  const csv = await reports.invoicesCsv(req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ShreejiGold_Report_' + todayStr() + '.csv"');
  res.send(csv);
}));

export default router;

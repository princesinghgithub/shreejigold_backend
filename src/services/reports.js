import { Customer, Stock, Invoice } from '../models/index.js';
import { todayStr, daysAgo, round2 } from '../lib/helpers.js';
import { summarizeInvoices } from '../lib/calc.js';
import { listInvoices } from './invoices.js';
import { listOffers } from './offers.js';

/** Dashboard के लिए एक ही call में सारे आंकड़े */
export async function dashboard() {
  const today = todayStr();
  const month = today.slice(0, 7);

  const sum = async (match) => {
    const [row] = await Invoice.aggregate([
      { $match: match },
      { $group: { _id: null, v: { $sum: '$total' } } },
    ]);
    return row ? row.v : 0;
  };

  const [todaySales, monthSales] = await Promise.all([
    sum({ type: 'sale', date: today }),
    sum({ type: 'sale', date: { $regex: '^' + month } }),
  ]);

  const [dueRow] = await Customer.aggregate([
    { $match: { balance: { $gt: 0 } } },
    { $group: { _id: null, v: { $sum: '$balance' } } },
  ]);

  const [stockRow] = await Stock.aggregate([
    { $group: { _id: null, v: { $sum: '$qty' } } },
  ]);

  const customerCount = await Customer.countDocuments();

  // पिछले 7 दिन की बिक्री (चार्ट के लिए) — एक ही query में
  const from = daysAgo(6);
  const perDay = await Invoice.aggregate([
    { $match: { type: 'sale', date: { $gte: from, $lte: today } } },
    { $group: { _id: '$date', v: { $sum: '$total' } } },
  ]);
  const dayMap = new Map(perDay.map((d) => [d._id, d.v]));
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = daysAgo(i);
    last7.push({ date: d, total: round2(dayMap.get(d) || 0) });
  }

  const topDue = (await Customer.find({ balance: { $gt: 0 } })
    .sort({ balance: -1 }).limit(5).lean())
    .map((c) => ({ id: c._id, name: c.name, phone: c.phone || '', balance: round2(c.balance) }));

  return {
    todaySales: round2(todaySales),
    monthSales: round2(monthSales),
    totalDue: round2(dueRow ? dueRow.v : 0),
    stockCount: round2(stockRow ? stockRow.v : 0),
    customerCount,
    last7Days: last7,
    recentInvoices: await listInvoices({ limit: 8 }),
    activeOffers: (await listOffers({ activeOnly: true })).slice(0, 5),
    topDueCustomers: topDue,
  };
}

/** किसी भी date range / filter पर रिपोर्ट — Reports पेज के लिए */
export async function rangeReport(filters = {}) {
  const invoices = await listInvoices(filters);
  const summary = summarizeInvoices(invoices);

  // दिन-वार तोड़
  const byDate = new Map();
  for (const i of invoices) {
    if (!byDate.has(i.date)) byDate.set(i.date, { date: i.date, sale: 0, purchase: 0, gst: 0, due: 0 });
    const row = byDate.get(i.date);
    if (i.type === 'sale') row.sale += i.total;
    else row.purchase += i.total;
    row.gst += i.gst;
    row.due += i.due > 0 ? i.due : 0;
  }

  return {
    filters,
    count: invoices.length,
    summary: {
      saleCount: summary.saleCount,
      saleTotal: round2(summary.saleTotal),
      purchaseCount: summary.purchaseCount,
      purchaseTotal: round2(summary.purchaseTotal),
      gstTotal: round2(summary.gstTotal),
      dueTotal: round2(summary.dueTotal),
    },
    byDate: [...byDate.values()]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((r) => ({
        date: r.date,
        sale: round2(r.sale),
        purchase: round2(r.purchase),
        gst: round2(r.gst),
        due: round2(r.due),
      })),
    invoices,
  };
}

const CSV_COLUMNS = [
  ['Bill No', (i) => i.id],
  ['Barcode', (i) => i.barcode],
  ['Date', (i) => i.date],
  ['Type', (i) => i.type],
  ['GST Mode', (i) => i.gstMode],
  ['Customer', (i) => i.customerName],
  ['Phone', (i) => i.customerPhone],
  ['Metal Value', (i) => i.subtotal],
  ['Making', (i) => i.making],
  ['Discount', (i) => i.discount],
  ['GST %', (i) => i.gstPct],
  ['GST Amount', (i) => i.gst],
  ['Total', (i) => i.total],
  ['Paid', (i) => i.paid],
  ['Due', (i) => i.due],
];

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function invoicesCsv(filters = {}) {
  const invoices = await listInvoices(filters);
  const lines = [CSV_COLUMNS.map((c) => csvCell(c[0])).join(',')];
  for (const inv of invoices) {
    lines.push(CSV_COLUMNS.map((c) => csvCell(c[1](inv))).join(','));
  }
  // Excel में हिंदी/₹ ठीक दिखे इसलिए BOM
  return '﻿' + lines.join('\n');
}

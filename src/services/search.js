import { Customer, Invoice } from '../models/index.js';
import { escapeRegex, round2, billNoOf } from '../lib/helpers.js';

/**
 * ऊपर वाले एक ही खाने से खोज — ग्राहक (नाम / फ़ोन / पता) और बिल (नंबर / barcode / नाम).
 * दुकान पर सबसे ज़्यादा यही चाहिए: "रमेश" लिखो और उसका खाता सामने आ जाए.
 */
export async function quickSearch(query = '', limit = 8) {
  const q = String(query || '').trim();
  if (!q) return { q, customers: [], invoices: [] };

  const rx = { $regex: escapeRegex(q), $options: 'i' };
  const digits = q.replace(/\D/g, '');

  const rows = await Customer.find({ $or: [{ name: rx }, { phone: rx }, { address: rx }] })
    .collation({ locale: 'en', strength: 1 })
    .sort({ name: 1 })
    .limit(limit)
    .lean();

  // हर ग्राहक के कितने बिल और आख़िरी बिल कब — सूची में यही सबसे काम का है
  const ids = rows.map((c) => c._id);
  const stats = ids.length
    ? await Invoice.aggregate([
      { $match: { customerId: { $in: ids } } },
      { $group: { _id: '$customerId', bills: { $sum: 1 }, lastDate: { $max: '$date' } } },
    ])
    : [];
  const statMap = new Map(stats.map((s) => [s._id, s]));

  const customers = rows.map((c) => {
    const s = statMap.get(c._id);
    return {
      id: c._id,
      name: c.name,
      phone: c.phone || '',
      address: c.address || '',
      balance: round2(c.balance || 0),
      bills: s ? s.bills : 0,
      lastBillDate: s ? s.lastDate : null,
    };
  });

  const or = [{ customerName: rx }, { billNo: q.toUpperCase() }, { _id: rx }];
  if (digits) or.push({ barcode: { $regex: escapeRegex(digits) } });
  const invRows = await Invoice.find({ $or: or })
    .sort({ date: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  const invoices = invRows.map((d) => ({
    id: d._id,
    billNo: billNoOf(d),
    date: d.date,
    type: d.type,
    gstMode: d.gstMode,
    customerId: d.customerId,
    customerName: d.customerName,
    total: round2(d.total),
    due: round2(d.due),
  }));

  return { q, customers, invoices };
}

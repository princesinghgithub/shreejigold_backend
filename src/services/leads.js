import { Lead, Product } from '../models/index.js';
import { uid } from '../lib/helpers.js';
import { notFound } from '../lib/errors.js';

export const LEAD_STATUSES = ['new', 'contacted', 'converted', 'closed'];

// इतनी देर में उसी नंबर से उसी design की दोबारा enquiry आए तो नई lead नहीं बनती —
// पुरानी में ही नया संदेश जुड़ जाता है (बटन दो बार दबाने पर दो lead न दिखें)
const REPEAT_WINDOW_MS = 30 * 60 * 1000;

function toLead(d) {
  if (!d) return null;
  return {
    id: d._id,
    name: d.name || '',
    phone: d.phone || '',
    message: d.message || '',
    source: d.source || 'website',
    productId: d.productId || null,
    productName: d.productName || '',
    status: d.status || 'new',
    notes: d.notes || '',
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

/** Website से आई enquiry सेव करें (phone पहले से 10 अंकों में साफ़ किया हुआ) */
export async function createLead(input) {
  const now = new Date().toISOString();
  const productId = input.productId ? String(input.productId) : null;

  // design admin catalog का हो तो नाम वहीं से; website के पुराने (static) designs का नाम साथ आता है
  let productName = String(input.productName || '').slice(0, 150);
  if (productId) {
    const p = await Product.findById(productId, { name: 1 }).lean();
    if (p) productName = p.name;
  }

  const since = new Date(Date.now() - REPEAT_WINDOW_MS).toISOString();
  const repeat = await Lead.findOne({
    phone: input.phone, productId, status: 'new', createdAt: { $gte: since },
  }).lean();
  if (repeat) {
    const d = await Lead.findOneAndUpdate(
      { _id: repeat._id },
      { $set: { name: input.name, message: input.message || repeat.message, updatedAt: now } },
      { returnDocument: 'after' },
    ).lean();
    return toLead(d);
  }

  const doc = {
    _id: uid('lead'),
    name: input.name,
    phone: input.phone,
    message: input.message || '',
    source: input.source || 'website',
    productId,
    productName,
    status: 'new',
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
  await Lead.create(doc);
  return toLead(doc);
}

export async function listLeads({ status } = {}) {
  const filter = LEAD_STATUSES.includes(status) ? { status } : {};
  const [rows, grouped] = await Promise.all([
    Lead.find(filter).sort({ createdAt: -1 }).limit(500).lean(),
    Lead.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const counts = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0]));
  for (const g of grouped) if (g._id in counts) counts[g._id] = g.n;
  counts.total = LEAD_STATUSES.reduce((s, k) => s + counts[k], 0);
  return { leads: rows.map(toLead), counts };
}

export async function updateLead(id, input) {
  const set = { updatedAt: new Date().toISOString() };
  if (input.status !== undefined) set.status = input.status;
  if (input.notes !== undefined) set.notes = input.notes;
  const d = await Lead.findOneAndUpdate({ _id: id }, { $set: set }, { returnDocument: 'after' }).lean();
  if (!d) throw notFound('Lead नहीं मिली');
  return toLead(d);
}

export async function deleteLead(id) {
  const res = await Lead.deleteOne({ _id: id });
  if (res.deletedCount === 0) throw notFound('Lead नहीं मिली');
  return { id, deleted: true };
}

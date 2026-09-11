import { Offer } from '../models/index.js';
import { uid, num, todayStr } from '../lib/helpers.js';
import { notFound } from '../lib/errors.js';

function toOffer(d) {
  if (!d) return null;
  return {
    id: d._id,
    title: d.title,
    discountPercent: num(d.discountPercent),
    startDate: d.startDate || '',
    endDate: d.endDate || '',
    description: d.description || '',
    createdAt: d.createdAt,
  };
}

export async function listOffers({ activeOnly } = {}) {
  const rows = (await Offer.find({}).sort({ startDate: -1 }).lean()).map(toOffer);
  if (!activeOnly) return rows;
  const t = todayStr();
  return rows.filter((o) => (!o.startDate || o.startDate <= t) && (!o.endDate || o.endDate >= t));
}

export async function getOffer(id) {
  const d = await Offer.findById(id).lean();
  if (!d) throw notFound('Offer नहीं मिला');
  return toOffer(d);
}

export async function createOffer(input, session = null) {
  const doc = {
    _id: input.id || uid('off'),
    title: String(input.title).trim(),
    discountPercent: num(input.discountPercent),
    startDate: input.startDate || '',
    endDate: input.endDate || '',
    description: input.description || '',
    createdAt: input.createdAt || new Date().toISOString(),
  };
  await Offer.create([doc], { session });
  return toOffer(doc);
}

export async function updateOffer(id, input) {
  const set = {};
  if (input.title !== undefined) set.title = input.title.trim();
  if (input.discountPercent !== undefined) set.discountPercent = num(input.discountPercent);
  if (input.startDate !== undefined) set.startDate = input.startDate;
  if (input.endDate !== undefined) set.endDate = input.endDate;
  if (input.description !== undefined) set.description = input.description;

  const d = await Offer.findOneAndUpdate({ _id: id }, { $set: set }, { returnDocument: 'after' }).lean();
  if (!d) throw notFound('Offer नहीं मिला');
  return toOffer(d);
}

export async function deleteOffer(id) {
  const res = await Offer.deleteOne({ _id: id });
  if (res.deletedCount === 0) throw notFound('Offer नहीं मिला');
  return { id, deleted: true };
}

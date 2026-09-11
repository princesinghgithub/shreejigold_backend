import { Stock } from '../models/index.js';
import { uid, num, round2, escapeRegex } from '../lib/helpers.js';
import { notFound } from '../lib/errors.js';

function toStock(d) {
  if (!d) return null;
  return {
    id: d._id,
    name: d.name,
    category: d.category,
    purity: d.purity || '',
    weight: round2(d.weight || 0),
    qty: round2(d.qty || 0),
    createdAt: d.createdAt,
  };
}

// नाम/धातु का छोटे-अक्षर वाला रूप भी सेव रखते हैं, ताकि बिल बनने पर
// "इसी नाम का item" ढूंढना index से हो — हर बार पूरी सूची छाने बिना
const lower = (s) => String(s || '').toLowerCase();

export async function listStock({ category, search } = {}) {
  const filter = {};
  if (category) filter.categoryLower = lower(category);
  if (search) filter.name = { $regex: escapeRegex(search), $options: 'i' };
  const rows = await Stock.find(filter)
    .collation({ locale: 'en', strength: 1 })
    .sort({ category: 1, name: 1 })
    .lean();
  return rows.map(toStock);
}

export async function getStockItem(id) {
  const d = await Stock.findById(id).lean();
  if (!d) throw notFound('Stock item नहीं मिला');
  return toStock(d);
}

export async function createStockItem(input, session = null) {
  const id = input.id || uid('stk');
  const name = String(input.name).trim();
  const category = input.category || 'Gold';
  const doc = {
    _id: id,
    name,
    category,
    nameLower: lower(name),
    categoryLower: lower(category),
    purity: input.purity || '',
    weight: round2(num(input.weight)),
    qty: round2(num(input.qty)),
    createdAt: input.createdAt || new Date().toISOString(),
  };
  await Stock.create([doc], { session });
  return toStock(doc);
}

export async function updateStockItem(id, input) {
  const set = {};
  if (input.name !== undefined) { set.name = input.name.trim(); set.nameLower = lower(set.name); }
  if (input.category !== undefined) { set.category = input.category; set.categoryLower = lower(input.category); }
  if (input.purity !== undefined) set.purity = input.purity;
  if (input.weight !== undefined) set.weight = round2(num(input.weight));
  if (input.qty !== undefined) set.qty = round2(num(input.qty));

  const d = await Stock.findOneAndUpdate({ _id: id }, { $set: set }, { returnDocument: 'after' }).lean();
  if (!d) throw notFound('Stock item नहीं मिला');
  return toStock(d);
}

export async function deleteStockItem(id) {
  const res = await Stock.deleteOne({ _id: id });
  if (res.deletedCount === 0) throw notFound('Stock item नहीं मिला');
  return { id, deleted: true };
}

/**
 * बिल बनने पर stock अपने आप घटे/बढ़े — नाम + धातु से मिलता item हो तो
 * qty और वजन adjust; न मिले और खरीद बिल हो तो नया item बन जाए.
 * direction = -1 भेजने पर वही असर उलट जाता है (बिल delete करते समय).
 */
export async function applyInvoiceToStock(items, type, direction = 1, session = null) {
  const sign = (type === 'sale' ? -1 : 1) * direction;

  for (const it of items) {
    const w = num(it.weight);
    const found = await Stock.findOne(
      { nameLower: lower(it.name), categoryLower: lower(it.metal) },
      null,
      { session },
    ).lean();
    if (found) {
      await Stock.updateOne(
        { _id: found._id },
        {
          $set: {
            qty: round2(num(found.qty) + sign),
            weight: round2(Math.max(0, num(found.weight) + sign * w)),
          },
        },
        { session },
      );
    } else if (sign > 0) {
      await createStockItem(
        { name: it.name, category: it.metal, purity: num(it.purity) + '%', weight: w, qty: 1 },
        session,
      );
    }
  }
}

import { Customer, Invoice } from '../models/index.js';
import { uid, num, round2, todayStr, escapeRegex } from '../lib/helpers.js';
import { notFound } from '../lib/errors.js';

/**
 * उधारी खाता (ledger) ग्राहक के दस्तावेज़ के अंदर ही रखा है — अलग collection में नहीं.
 * वजह: खाता हमेशा उसी ग्राहक के साथ पढ़ा जाता है, एक दुकान में entries सैकड़ों में
 * रहती हैं (लाखों में नहीं), और एक ही जगह लिखने से बकाया कभी अधूरा नहीं दिखता.
 */

// DB दस्तावेज़ -> फ्रंटएंड shape
function toCustomer(d) {
  if (!d) return null;
  return {
    id: d._id,
    name: d.name,
    phone: d.phone || '',
    address: d.address || '',
    pan: d.pan || '',
    balance: round2(d.balance || 0),
    ledger: (d.ledger || []).map((l) => ({
      id: l.id,
      date: l.date,
      note: l.note || '',
      amount: round2(l.amount),
      invoiceId: l.invoiceId || undefined,
    })),
    createdAt: d.createdAt,
  };
}

const byDate = (a, b) => (a.date === b.date
  ? String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
  : String(a.date).localeCompare(String(b.date)));

/** बकाया हमेशा खाते के जोड़ से — कभी हाथ से नहीं लिखा जाता */
export function sumLedger(ledger) {
  return round2((ledger || []).reduce((s, l) => s + num(l.amount), 0));
}

export async function listCustomers({ search } = {}) {
  const rx = search ? { $regex: escapeRegex(search), $options: 'i' } : null;
  const filter = rx ? { $or: [{ name: rx }, { phone: rx }, { address: rx }] } : {};
  const rows = await Customer.find(filter).collation({ locale: 'en', strength: 1 }).sort({ name: 1 }).lean();
  return rows.map(toCustomer);
}

export async function getCustomer(id) {
  const d = await Customer.findById(id).lean();
  if (!d) throw notFound('ग्राहक नहीं मिला');
  return toCustomer(d);
}

export async function createCustomer(input, session = null) {
  const id = input.id || uid('cust');
  const now = new Date().toISOString();

  const ledger = [];
  const opening = num(input.openingBalance ?? input.balance, 0);
  if (opening !== 0) {
    // restore में यह entry बाकी entries से पहले दिखनी चाहिए, इसलिए तारीख भी पहले की
    const openingDate = input.openingDate
      || (input.ledger || []).reduce((min, l) => (l.date && l.date < min ? l.date : min), todayStr());
    ledger.push({
      id: uid('led'), date: openingDate,
      note: 'पुराना बकाया (Opening Balance)', amount: round2(opening),
      invoiceId: null, createdAt: now,
    });
  }
  // restore/import में आई पुरानी entries
  for (const l of input.ledger || []) {
    ledger.push({
      id: l.id || uid('led'), date: l.date, note: l.note || '',
      amount: round2(num(l.amount)), invoiceId: l.invoiceId || null, createdAt: now,
    });
  }
  ledger.sort(byDate);

  const doc = {
    _id: id,
    name: String(input.name).trim(),
    phone: input.phone || '',
    address: input.address || '',
    pan: input.pan ? String(input.pan).trim().toUpperCase() : '',
    ledger,
    balance: sumLedger(ledger),
    createdAt: input.createdAt || now,
  };
  await Customer.create([doc], { session });
  return toCustomer(doc);
}

export async function updateCustomer(id, input) {
  const set = {};
  if (input.name !== undefined) set.name = input.name.trim();
  if (input.phone !== undefined) set.phone = input.phone;
  if (input.address !== undefined) set.address = input.address;
  if (input.pan !== undefined) set.pan = String(input.pan).trim().toUpperCase();

  const d = await Customer.findOneAndUpdate({ _id: id }, { $set: set }, { returnDocument: 'after' }).lean();
  if (!d) throw notFound('ग्राहक नहीं मिला');
  return toCustomer(d);
}

export async function deleteCustomer(id) {
  const res = await Customer.deleteOne({ _id: id });
  if (res.deletedCount === 0) throw notFound('ग्राहक नहीं मिला');
  // बिल बने रहते हैं, बस उनका ग्राहक हट जाता है
  await Invoice.updateMany({ customerId: id }, { $set: { customerId: null } });
  return { id, deleted: true };
}

/**
 * खाते में entry जोड़ें और बकाया उसी साँस में ठीक कर दें.
 * amount धनात्मक = बकाया बढ़ा, ऋणात्मक = पैसा जमा हुआ.
 */
export async function addLedgerEntry(customerId, input, session = null) {
  const now = new Date().toISOString();
  const entry = {
    id: uid('led'),
    date: input.date || todayStr(),
    note: input.note || '',
    amount: round2(num(input.amount)),
    invoiceId: input.invoiceId || null,
    createdAt: now,
  };
  const res = await Customer.updateOne(
    { _id: customerId },
    { $push: { ledger: entry }, $inc: { balance: entry.amount } },
    { session },
  );
  if (res.matchedCount === 0) throw notFound('ग्राहक नहीं मिला');
  // $inc में दशमलव जुड़ते-जुड़ते बहक सकता है — जोड़ से दोबारा मिला देते हैं
  return recalcBalance(customerId, session);
}

export async function deleteLedgerEntry(customerId, entryId, session = null) {
  const res = await Customer.updateOne(
    { _id: customerId },
    { $pull: { ledger: { id: entryId } } },
    { session },
  );
  if (res.matchedCount === 0) throw notFound('ग्राहक नहीं मिला');
  if (res.modifiedCount === 0) throw notFound('Entry नहीं मिली');
  return recalcBalance(customerId, session);
}

/** किसी बिल से जुड़ी सारी entries हटाएं (बिल delete होने पर) */
export async function removeInvoiceEntries(invoiceId, session = null) {
  const affected = await Customer.find({ 'ledger.invoiceId': invoiceId }, { _id: 1 }, { session }).lean();
  for (const d of affected) {
    await Customer.updateOne({ _id: d._id }, { $pull: { ledger: { invoiceId } } }, { session });
    await recalcBalance(d._id, session);
  }
  return affected.length;
}

/** बकाया दोबारा जोड़कर लिखें */
export async function recalcBalance(customerId, session = null) {
  const d = await Customer.findById(customerId, null, { session }).lean();
  if (!d) throw notFound('ग्राहक नहीं मिला');
  const balance = sumLedger(d.ledger);
  await Customer.updateOne({ _id: customerId }, { $set: { balance } }, { session });
  return toCustomer({ ...d, balance });
}

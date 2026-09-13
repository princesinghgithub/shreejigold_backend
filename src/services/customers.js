import { Customer, Invoice } from '../models/index.js';
import { tx } from '../db/index.js';
import { uid, num, round2, todayStr, escapeRegex } from '../lib/helpers.js';
import { notFound, conflict, badRequest } from '../lib/errors.js';

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

/** "+91 98270-01122" → "9827001122" — मिलान हमेशा आख़िरी 10 अंकों से */
export const normPhone = (p) => String(p || '').replace(/\D/g, '').slice(-10);

/**
 * यही ग्राहक पहले से है क्या? — नंबर सबसे पक्का सुराग है. नंबर न दिया हो तो उसी नाम
 * का अकेला ग्राहक. एक ही नाम के दो ग्राहक हों तो कुछ नहीं लौटाते — दुकानदार खुद चुने,
 * वरना दो अलग लोगों का हिसाब आपस में मिल जाएगा.
 */
export async function findExistingCustomer({ name, phone } = {}, session = null) {
  const ph = normPhone(phone);
  if (ph) {
    const byPhone = await Customer.findOne({ phone: { $regex: escapeRegex(ph) + '$' } }, null, { session }).lean();
    if (byPhone) return byPhone;
  }
  const nm = String(name || '').trim();
  if (!nm) return null;
  const sameName = await Customer
    .find({ name: { $regex: '^' + escapeRegex(nm) + '$', $options: 'i' } }, null, { session })
    .limit(2)
    .lean();
  if (sameName.length !== 1) return null;
  // नाम वही है: या तो नंबर दिया ही नहीं, या उस खाते में अब तक नंबर नहीं था
  if (!ph || !normPhone(sameName[0].phone)) return sameName[0];
  return null;
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

/**
 * ऐप से नया ग्राहक जोड़ते समय — वही ग्राहक पहले से हो तो रोक देते हैं, ताकि एक ही
 * आदमी के दो खाते और दो उधारी न बनें. जान-बूझकर बनाना हो तो allowDuplicate: true.
 * (restore/import सीधे createCustomer इस्तेमाल करता है — वहाँ रोक नहीं लगती)
 */
export async function createCustomerChecked(input) {
  const existing = await findExistingCustomer({ name: input.name, phone: input.phone });
  if (existing) {
    throw conflict(
      `यह ग्राहक पहले से है — ${existing.name}${existing.phone ? ` (${existing.phone})` : ''}। `
      + 'उसी खाते में जोड़ें, नया खाता न बनाएं।',
    );
  }
  return createCustomer(input);
}

/** एक ही नंबर या एक ही नाम वाले खाते — Customer List में "मिलाएं" के लिए */
export async function findDuplicates() {
  const rows = await Customer.find({}, { name: 1, phone: 1, address: 1, balance: 1 }).lean();
  const groups = new Map();
  for (const c of rows) {
    const ph = normPhone(c.phone);
    const nm = String(c.name || '').trim().toLowerCase();
    const key = ph ? 'phone:' + ph : (nm ? 'name:' + nm : '');
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      id: c._id, name: c.name, phone: c.phone || '', address: c.address || '', balance: round2(c.balance || 0),
    });
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({ by: key.startsWith('phone:') ? 'phone' : 'name', value: key.split(':')[1], customers: list }));
}

/**
 * दो खाते मिलाकर एक — पुराने (from) के सारे बिल और उधारी entries रहने वाले खाते में
 * चली जाती हैं, बकाया फिर से जोड़ से बनता है, और दोहरा खाता हट जाता है.
 */
export async function mergeCustomers(targetId, fromId) {
  if (!fromId || String(targetId) === String(fromId)) throw badRequest('मिलाने के लिए दो अलग खाते चुनें');
  return tx(async (session) => {
    const target = await Customer.findById(targetId, null, { session }).lean();
    const source = await Customer.findById(fromId, null, { session }).lean();
    if (!target || !source) throw notFound('ग्राहक नहीं मिला');

    // बिल नए खाते पर — बिल पर छपा नाम भी वही जो अब रहेगा
    await Invoice.updateMany(
      { customerId: fromId },
      { $set: { customerId: targetId, customerName: target.name } },
      { session },
    );

    const ledger = [...(target.ledger || []), ...(source.ledger || [])].sort(byDate);
    await Customer.updateOne({ _id: targetId }, {
      $set: {
        ledger,
        balance: sumLedger(ledger),
        phone: target.phone || source.phone || '',
        address: target.address || source.address || '',
        pan: target.pan || source.pan || '',
      },
    }, { session });
    await Customer.deleteOne({ _id: fromId }, { session });

    const merged = await Customer.findById(targetId, null, { session }).lean();
    return toCustomer(merged);
  });
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

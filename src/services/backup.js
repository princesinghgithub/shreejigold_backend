import { tx, setMeta, META, DEFAULT_RATES, DEFAULT_SETTINGS } from '../db/index.js';
import { Customer, Stock, Invoice, Offer, Backup } from '../models/index.js';
import { getRates, getSettings } from './shop.js';
import { listCustomers, createCustomer } from './customers.js';
import { listStock, createStockItem } from './stock.js';
import { listInvoices, insertRawInvoice, syncCounters } from './invoices.js';
import { listOffers, createOffer } from './offers.js';
import { num, round2, uid } from '../lib/helpers.js';
import { config } from '../config.js';

/**
 * पूरा डेटा उसी shape में जो फ्रंटएंड इस्तेमाल करता है
 * ({ rates, customers, stock, invoices, offers, settings }) — इसलिए ऐप के Backup
 * पेज से बनी पुरानी .json फाइल भी यहाँ सीधे restore हो जाती है.
 */
export async function exportAll() {
  const [rates, customers, stock, invoices, offers, settings] = await Promise.all([
    getRates(), listCustomers(), listStock(), listInvoices(), listOffers(), getSettings(),
  ]);
  return { rates, customers, stock, invoices, offers, settings };
}

/** सारे collections खाली करें */
async function wipeData(session = null) {
  for (const Model of [Customer, Stock, Invoice, Offer]) {
    await Model.deleteMany({}, { session });
  }
}

/**
 * backup .json से restore. मौजूदा डेटा हट जाता है.
 * invoices जैसे आए वैसे ही डलते हैं — stock/ledger दोबारा नहीं गिने जाते,
 * क्योंकि backup में वो असर पहले से शामिल है.
 */
export async function importAll(data) {
  await wipeData();
  await setMeta(META.RATES, { ...DEFAULT_RATES, ...(data.rates || {}) });
  await setMeta(META.SETTINGS, { ...DEFAULT_SETTINGS, ...(data.settings || {}) });

  // बैलेंस vs खाते का मेल: पुराने backup में balance सीधे लिखा होता था और खाते में
  // उसकी entry नहीं होती. जितना अंतर बचे उसे "पुराना बकाया" entry बना देते हैं,
  // ताकि restore के बाद ग्राहक की बकाया रकम बिलकुल वही रहे जो backup में थी.
  for (const c of data.customers || []) {
    const ledgerSum = (c.ledger || []).reduce((s, l) => s + num(l.amount), 0);
    await createCustomer({ ...c, openingBalance: round2(num(c.balance) - ledgerSum) });
  }
  for (const s of data.stock || []) await createStockItem(s);
  for (const inv of data.invoices || []) await insertRawInvoice(inv);
  // backup के बिल नंबर से आगे गिनती चले — अगला बिल किसी पुराने नंबर पर न छपे
  await syncCounters();
  for (const o of data.offers || []) await createOffer(o);

  return summary();
}

export async function clearAll() {
  await wipeData();
  await setMeta(META.RATES, DEFAULT_RATES);
  await setMeta(META.SETTINGS, DEFAULT_SETTINGS);
  return summary();
}

export async function summary() {
  const [customers, stock, invoices, offers] = await Promise.all([
    Customer.countDocuments(),
    Stock.countDocuments(),
    Invoice.countDocuments(),
    Offer.countDocuments(),
  ]);
  const custs = await listCustomers();
  const ledgerEntries = custs.reduce((s, c) => s + c.ledger.length, 0);
  return { ok: true, counts: { customers, stock, invoices, offers, ledgerEntries } };
}

// ---------------- अपने आप बनने वाले backup ----------------
//
// Vercel पर डिस्क नहीं होती (फाइल लिखो तो अगले ही पल गायब), इसलिए रोज़ का backup
// उसी डेटाबेस के एक अलग collection में एक दस्तावेज़ बनकर रहता है. यह Atlas के
// अपने backup की जगह नहीं लेता, पर "गलती से सब मिटा दिया" वाली स्थिति से बचा लेता है.

export async function createSnapshot(label = 'manual') {
  const data = await exportAll();
  const doc = {
    _id: uid('bak'),
    label,
    createdAt: new Date().toISOString(),
    counts: (await summary()).counts,
    data,
  };
  await Backup.create(doc);

  // सिर्फ आख़िरी कुछ रखें
  const old = await Backup.find({}, { _id: 1 })
    .sort({ createdAt: -1 }).skip(config.backupKeep).lean();
  if (old.length) await Backup.deleteMany({ _id: { $in: old.map((o) => o._id) } });

  return { id: doc._id, label, createdAt: doc.createdAt, counts: doc.counts, pruned: old.length };
}

export async function listSnapshots() {
  const rows = await Backup.find({}, { data: 0 }).sort({ createdAt: -1 }).lean();
  return rows.map((r) => ({ id: r._id, label: r.label, createdAt: r.createdAt, counts: r.counts }));
}

export async function getSnapshot(id) {
  const d = await Backup.findById(id).lean();
  if (!d) return null;
  return d.data;
}

/** आज की कॉपी अभी तक नहीं बनी तो बना दें (रोज़ का cron यही चलाता है) */
export async function snapshotIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  const already = await Backup.exists({ createdAt: { $regex: '^' + today } });
  if (already) return { skipped: true, reason: 'आज की कॉपी पहले से है' };
  return createSnapshot('auto');
}

export { tx };

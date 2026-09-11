import { tx } from '../db/index.js';
import { Customer, Invoice } from '../models/index.js';
import { uid, genBarcode, todayStr, num, round2, escapeRegex } from '../lib/helpers.js';
import { notFound, badRequest } from '../lib/errors.js';
import { computeItemValue, summarizeBill } from '../lib/calc.js';
import { getRates, getSettings } from './shop.js';
import { applyInvoiceToStock } from './stock.js';
import { addLedgerEntry, removeInvoiceEntries, createCustomer } from './customers.js';

function toInvoice(d) {
  if (!d) return null;
  const { _id, ...rest } = d;
  return { id: _id, ...rest };
}

/** एक barcode जो पहले से किसी बिल पर न हो */
async function uniqueBarcode(session = null) {
  for (let i = 0; i < 20; i++) {
    const code = genBarcode();
    const hit = await Invoice.exists({ barcode: code }).session(session);
    if (!hit) return code;
  }
  return String(Date.now()).slice(-12);
}

export async function listInvoices(filters = {}) {
  const { from, to, type, gstMode, customerId, search, limit, offset } = filters;
  const q = {};
  if (from || to) {
    q.date = {};
    if (from) q.date.$gte = from;
    if (to) q.date.$lte = to;
  }
  if (type) q.type = type;
  if (gstMode) q.gstMode = gstMode;
  if (customerId) q.customerId = customerId;
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    q.$or = [{ customerName: rx }, { barcode: rx }, { _id: rx }];
  }

  let query = Invoice.find(q).sort({ date: -1, createdAt: -1 });
  if (limit) query = query.skip(Number(offset) || 0).limit(Number(limit));
  const rows = await query.lean();
  return rows.map(toInvoice);
}

export async function getInvoice(id) {
  const d = await Invoice.findById(id).lean();
  if (!d) throw notFound('बिल नहीं मिला');
  return toInvoice(d);
}

export async function getInvoiceByBarcode(barcode) {
  const d = await Invoice.findOne({ barcode }).lean();
  if (!d) throw notFound('इस barcode का बिल नहीं मिला');
  return toInvoice(d);
}

/**
 * बिल बनाएं. हिसाब सर्वर खुद लगाता है (भाव DB से) ताकि client का भेजा हुआ
 * total भरोसे पर न लेना पड़े. साथ में stock adjust + ग्राहक के खाते में entry.
 * तीनों काम एक transaction में — बीच में कुछ गड़बड़ हो तो कुछ भी अधूरा नहीं बचता.
 */
export async function createInvoice(input) {
  const items = (input.items || []).filter((it) => it && it.name && num(it.weight) > 0);
  if (!items.length) throw badRequest('कम से कम एक Item ज़रूरी है (नाम और वजन के साथ)');

  const rates = await getRates();
  const settings = await getSettings();
  const gstMode = input.gstMode === 'nongst' ? 'nongst' : 'gst';
  const gstPct = gstMode === 'nongst' ? 0 : num(input.gstPct, settings.gst);
  const exchange = {
    weight: num(input.exchange?.weight),
    purity: num(input.exchange?.purity),
    deduct: num(input.exchange?.deduct),
    rate: num(input.exchange?.rate),
  };

  // इनपुट जैसा है वैसा (making = दर), हिसाब इसी पर लगता है
  const normalized = items.map((it) => ({
    name: String(it.name).trim(),
    metal: it.metal === 'Silver' ? 'Silver' : 'Gold',
    weight: num(it.weight),
    purity: num(it.purity),
    makingType: ['perg', 'pct', 'flat'].includes(it.makingType) ? it.makingType : 'flat',
    making: num(it.making),
  }));

  // भाव 0 हो तो धातु का मूल्य ₹0 बनता — ऐसा बिल न बने
  const noRate = normalized.find((it) => !(num(it.metal === 'Silver' ? rates.silver : rates.gold) > 0));
  if (noRate) {
    throw badRequest(`पहले "आज का Rate" में ${noRate.metal === 'Silver' ? 'चांदी' : 'सोने'} का भाव डालें`);
  }

  // बिल में सेव होने वाला रूप — जिसमें making निकली हुई रकम है.
  // पैसों को यहीं गोल कर देते हैं, वरना 53127.99999999999 जैसी रकम सेव हो जाती है.
  const itemsWithValues = normalized.map((it) => {
    const c = computeItemValue(it, rates);
    return { ...it, metalVal: round2(c.metalVal), making: round2(c.making), itemTotal: round2(c.itemTotal) };
  });

  const sums = summarizeBill(
    normalized,
    rates,
    exchange,
    input.discountType === 'pct' ? 'pct' : 'flat',
    num(input.discountValue),
    gstPct,
    num(input.paid),
  );

  const id = input.id || uid('inv');
  const now = new Date().toISOString();

  return tx(async (session) => {
    // ग्राहक: मौजूदा id, या नाम दिया हो तो नया ग्राहक बना दें
    let customer = null;
    if (input.customerId) {
      customer = await Customer.findById(input.customerId, null, { session }).lean();
      if (!customer) throw notFound('ग्राहक नहीं मिला');
    } else if (input.customerName && input.customerName.trim()) {
      const created = await createCustomer({
        name: input.customerName.trim(),
        phone: input.customerPhone || '',
      }, session);
      customer = await Customer.findById(created.id, null, { session }).lean();
    }

    const inv = {
      _id: id,
      type: input.type === 'purchase' ? 'purchase' : 'sale',
      gstMode,
      barcode: input.barcode || await uniqueBarcode(session),
      date: input.date || todayStr(),
      customerId: customer ? customer._id : null,
      customerName: customer ? customer.name : 'Walk-in Customer',
      customerPhone: customer ? customer.phone : input.customerPhone || '',
      items: itemsWithValues,
      exchange: { ...exchange, value: round2(sums.exchangeVal) },
      subtotal: round2(sums.subtotal),
      making: round2(sums.makingTotal),
      discount: round2(sums.discount),
      gstPct: sums.gstPct,
      gst: round2(sums.gstAmt),
      total: round2(sums.total),
      paid: round2(sums.paid),
      due: round2(sums.due),
      createdAt: now,
    };

    await Invoice.create([inv], { session });
    await applyInvoiceToStock(inv.items, inv.type, 1, session);

    if (customer && inv.due !== 0) {
      await addLedgerEntry(customer._id, {
        date: inv.date,
        note: (inv.type === 'sale' ? 'बिक्री बिल' : 'खरीद बिल') + ' #' + id.slice(-5),
        amount: inv.due,
        invoiceId: id,
      }, session);
    }

    return toInvoice(inv);
  });
}

/** भुगतान दर्ज करें — paid बढ़ेगा, due घटेगा, खाते में जमा entry जाएगी */
export async function recordPayment(id, amount, note) {
  const amt = round2(num(amount));
  if (amt <= 0) throw badRequest('राशि 0 से ज़्यादा होनी चाहिए');
  const inv = await getInvoice(id);

  return tx(async (session) => {
    const paid = round2(inv.paid + amt);
    const due = round2(inv.total - paid);
    await Invoice.updateOne({ _id: id }, { $set: { paid, due } }, { session });

    if (inv.customerId) {
      await addLedgerEntry(inv.customerId, {
        date: todayStr(),
        note: note || 'भुगतान मिला — बिल #' + id.slice(-5),
        amount: -amt,
        invoiceId: id,
      }, session);
    }
    return { ...inv, paid, due };
  });
}

/** बिल हटाएं — stock वापस पहले जैसा और ग्राहक की entry भी हटे */
export async function deleteInvoice(id) {
  const inv = await getInvoice(id);
  return tx(async (session) => {
    await applyInvoiceToStock(inv.items, inv.type, -1, session);
    await removeInvoiceEntries(id, session);
    await Invoice.deleteOne({ _id: id }, { session });
    return { id, deleted: true };
  });
}

/** restore/import के लिए — जैसा दिया है वैसा ही बिल डालें, कोई side effect नहीं */
export async function insertRawInvoice(inv, session = null) {
  const doc = {
    _id: inv.id || uid('inv'),
    type: inv.type === 'purchase' ? 'purchase' : 'sale',
    gstMode: inv.gstMode === 'nongst' ? 'nongst' : 'gst',
    barcode: inv.barcode || genBarcode(),
    date: inv.date || todayStr(),
    customerId: inv.customerId || null,
    customerName: inv.customerName || 'Walk-in Customer',
    customerPhone: inv.customerPhone || '',
    items: inv.items || [],
    exchange: inv.exchange || {},
    subtotal: num(inv.subtotal),
    making: num(inv.making),
    discount: num(inv.discount),
    gstPct: num(inv.gstPct),
    gst: num(inv.gst),
    total: num(inv.total),
    paid: num(inv.paid),
    due: num(inv.due),
    createdAt: inv.createdAt || new Date().toISOString(),
  };
  await Invoice.replaceOne({ _id: doc._id }, doc, { upsert: true, session });
}

/** "prince patel" -> "p***** p****" */
const maskName = (name) => String(name || '')
  .split(/\s+/)
  .filter(Boolean)
  .map((w) => { const ch = [...w]; return ch[0] + '*'.repeat(Math.max(0, ch.length - 1)); })
  .join(' ');

/**
 * बिल की जाँच — बिल पर छपे QR / barcode से, बिना login. इसलिए सिर्फ उतना जितना
 * "बिल असली है" बताने को चाहिए: ग्राहक का नाम छिपा हुआ, फ़ोन-पता और बकाया रकम नहीं.
 */
export async function publicBill(code) {
  if (!/^\d{12}$/.test(String(code || ''))) return null;
  const d = await Invoice.findOne({ barcode: String(code) }).lean();
  if (!d) return null;
  const settings = await getSettings();
  return {
    shop: {
      name: settings.shopName,
      nameHi: settings.shopNameHindi,
      phone: settings.shopPhone,
      address: settings.shopAddress,
    },
    bill: {
      billNo: String(d._id).slice(-6).toUpperCase(),
      barcode: d.barcode,
      date: d.date,
      type: d.type,
      gstMode: d.gstMode,
      customer: maskName(d.customerName),
      items: (d.items || []).map((it) => ({
        name: it.name, metal: it.metal, weight: num(it.weight), purity: num(it.purity),
      })),
      total: round2(d.total),
      fullyPaid: num(d.due) <= 0,
    },
  };
}

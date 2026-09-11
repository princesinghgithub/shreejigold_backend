import { tx } from '../db/index.js';
import { Counter, Customer, Invoice } from '../models/index.js';
import { uid, genBarcode, todayStr, num, round2, escapeRegex, fyOf, billNoOf } from '../lib/helpers.js';
import { notFound, badRequest } from '../lib/errors.js';
import { computeItemValue, summarizeBill } from '../lib/calc.js';
import { PAYMENT_MODES } from '../lib/schemas.js';
import { getRates, getSettings } from './shop.js';
import { applyInvoiceToStock } from './stock.js';
import { addLedgerEntry, removeInvoiceEntries, createCustomer } from './customers.js';

const MODE_LABELS = {
  cash: 'नकद', upi: 'UPI', neft: 'NEFT/RTGS', netbanking: 'Net Banking', card: 'Card', cheque: 'Cheque',
};
const cleanMode = (m) => (PAYMENT_MODES.includes(m) ? m : 'cash');

// बिल नंबर की series: GST बिक्री "257", Estimate "E-12", खरीद "P-5"
const SERIES_PREFIX = { INV: '', EST: 'E-', PUR: 'P-' };

function seriesOf(type, gstMode) {
  if (type === 'purchase') return 'PUR';
  return gstMode === 'nongst' ? 'EST' : 'INV';
}

/** series + financial year में अगला नंबर. transaction के अंदर — बिल न बने तो गिनती भी वापस */
async function nextBillNo(series, date, session = null) {
  const fy = fyOf(date);
  const c = await Counter.findOneAndUpdate(
    { _id: `${series}:${fy}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', session },
  ).lean();
  return { series, fy, seq: c.seq, billNo: SERIES_PREFIX[series] + c.seq };
}

/** restore के बाद गिनती को backup के सबसे बड़े नंबर तक ले आएं (कभी पीछे नहीं) */
export async function syncCounters() {
  const rows = await Invoice.aggregate([
    { $match: { seq: { $type: 'number' } } },
    { $group: { _id: { series: '$series', fy: '$fy' }, max: { $max: '$seq' } } },
  ]);
  for (const r of rows) {
    await Counter.updateOne(
      { _id: `${r._id.series}:${r._id.fy}` },
      { $max: { seq: r.max } },
      { upsert: true },
    );
  }
}

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
  const { from, to, type, gstMode, customerId, billNo, search, limit, offset } = filters;
  const q = {};
  if (from || to) {
    q.date = {};
    if (from) q.date.$gte = from;
    if (to) q.date.$lte = to;
  }
  if (type) q.type = type;
  if (gstMode) q.gstMode = gstMode;
  if (customerId) q.customerId = customerId;
  if (billNo) q.billNo = String(billNo).trim().toUpperCase();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    q.$or = [
      { customerName: rx }, { barcode: rx }, { _id: rx },
      { billNo: String(search).trim().toUpperCase() },
    ];
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
 * total भरोसे पर न लेना पड़े. साथ में बिल नंबर + stock adjust + ग्राहक के खाते में entry.
 * सब एक transaction में — बीच में कुछ गड़बड़ हो तो कुछ भी अधूरा नहीं बचता.
 */
export async function createInvoice(input) {
  const items = (input.items || []).filter((it) => it && it.name && num(it.weight) > 0);
  if (!items.length) throw badRequest('कम से कम एक Item ज़रूरी है (नाम और वजन के साथ)');

  const rates = await getRates();
  const settings = await getSettings();
  const type = input.type === 'purchase' ? 'purchase' : 'sale';
  const gstMode = input.gstMode === 'nongst' ? 'nongst' : 'gst';
  const gstPct = gstMode === 'nongst' ? 0 : num(input.gstPct, settings.gst);
  const date = input.date || todayStr();
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
    huid: String(it.huid || '').trim().toUpperCase(),
    grossWeight: num(it.grossWeight),
    weight: num(it.weight),
    purity: num(it.purity),
    makingType: ['perg', 'pct', 'flat'].includes(it.makingType) ? it.makingType : 'flat',
    making: num(it.making),
    hallmark: Math.max(0, num(it.hallmark)),
  }));

  // भाव 0 हो तो धातु का मूल्य ₹0 बनता — ऐसा बिल न बने
  const noRate = normalized.find((it) => !(num(it.metal === 'Silver' ? rates.silver : rates.gold) > 0));
  if (noRate) {
    throw badRequest(`पहले "आज का Rate" में ${noRate.metal === 'Silver' ? 'चांदी' : 'सोने'} का भाव डालें`);
  }

  // बिल में सेव होने वाला रूप — making निकली हुई रकम, और जो दर डाली थी वो makingRate में.
  // पैसों को यहीं गोल कर देते हैं, वरना 53127.99999999999 जैसी रकम सेव हो जाती है.
  const itemsWithValues = normalized.map((it) => {
    const c = computeItemValue(it, rates);
    return {
      ...it,
      grossWeight: it.grossWeight > 0 ? it.grossWeight : it.weight,
      rate: round2(c.rate),
      makingRate: it.making,
      making: round2(c.making),
      hallmark: round2(c.hallmark),
      metalVal: round2(c.metalVal),
      itemTotal: round2(c.itemTotal),
    };
  });

  // भुगतान तरीके-वार आया हो तो paid उसी का जोड़; पुराना तरीका (सिर्फ paid) भी चलता है
  const payments = Array.isArray(input.payments)
    ? input.payments
      .map((p) => ({ mode: cleanMode(p.mode), amount: round2(num(p.amount)), date, note: '' }))
      .filter((p) => p.amount > 0)
    : null;
  const paid = payments ? round2(payments.reduce((s, p) => s + p.amount, 0)) : num(input.paid);

  const sums = summarizeBill(
    normalized,
    rates,
    exchange,
    input.discountType === 'pct' ? 'pct' : 'flat',
    num(input.discountValue),
    gstPct,
    paid,
  );

  const pan = String(input.customerPan || '').trim().toUpperCase();
  const address = String(input.customerAddress || '').trim();
  const id = input.id || uid('inv');
  const now = new Date().toISOString();

  return tx(async (session) => {
    // ग्राहक: मौजूदा id, या नाम दिया हो तो नया ग्राहक बना दें
    let customer = null;
    if (input.customerId) {
      customer = await Customer.findById(input.customerId, null, { session }).lean();
      if (!customer) throw notFound('ग्राहक नहीं मिला');
      // ग्राहक के record में PAN / पता खाली हो तो इसी बिल वाला भर दें
      const patch = {};
      if (pan && !customer.pan) patch.pan = pan;
      if (address && !customer.address) patch.address = address;
      if (Object.keys(patch).length) {
        await Customer.updateOne({ _id: customer._id }, { $set: patch }, { session });
        customer = { ...customer, ...patch };
      }
    } else if (input.customerName && input.customerName.trim()) {
      const created = await createCustomer({
        name: input.customerName.trim(),
        phone: input.customerPhone || '',
        address,
        pan,
      }, session);
      customer = await Customer.findById(created.id, null, { session }).lean();
    }

    const no = await nextBillNo(seriesOf(type, gstMode), date, session);

    const inv = {
      _id: id,
      type,
      gstMode,
      barcode: input.barcode || await uniqueBarcode(session),
      ...no,
      date,
      customerId: customer ? customer._id : null,
      customerName: customer ? customer.name : 'Walk-in Customer',
      customerPhone: customer ? customer.phone : input.customerPhone || '',
      customerAddress: address || (customer && customer.address) || '',
      customerPan: pan || (customer && customer.pan) || '',
      items: itemsWithValues,
      exchange: { ...exchange, value: round2(sums.exchangeVal) },
      subtotal: round2(sums.subtotal),
      making: round2(sums.makingTotal),
      hallmark: round2(sums.hallmarkTotal),
      discount: round2(sums.discount),
      gstPct: sums.gstPct,
      gst: round2(sums.gstAmt),
      roundOff: round2(sums.roundOff),
      total: round2(sums.total),
      paid: round2(sums.paid),
      due: round2(sums.due),
      payments: payments || [],
      createdAt: now,
    };

    await Invoice.create([inv], { session });
    await applyInvoiceToStock(inv.items, inv.type, 1, session);

    if (customer && inv.due !== 0) {
      await addLedgerEntry(customer._id, {
        date: inv.date,
        note: (inv.type === 'sale' ? 'बिक्री बिल' : 'खरीद बिल') + ' #' + inv.billNo,
        amount: inv.due,
        invoiceId: id,
      }, session);
    }

    return toInvoice(inv);
  });
}

/** भुगतान दर्ज करें — paid बढ़ेगा, due घटेगा, बिल में तरीका (नकद/UPI/...) और खाते में जमा entry */
export async function recordPayment(id, amount, note, mode) {
  const amt = round2(num(amount));
  if (amt <= 0) throw badRequest('राशि 0 से ज़्यादा होनी चाहिए');
  const inv = await getInvoice(id);
  const entry = { mode: cleanMode(mode), amount: amt, date: todayStr(), note: String(note || '').trim() };

  return tx(async (session) => {
    const paid = round2(inv.paid + amt);
    const due = round2(inv.total - paid);
    await Invoice.updateOne({ _id: id }, { $set: { paid, due }, $push: { payments: entry } }, { session });

    if (inv.customerId) {
      await addLedgerEntry(inv.customerId, {
        date: entry.date,
        note: entry.note || `भुगतान मिला (${MODE_LABELS[entry.mode]}) — बिल #${billNoOf(inv)}`,
        amount: -amt,
        invoiceId: id,
      }, session);
    }
    return { ...inv, paid, due, payments: [...(inv.payments || []), entry] };
  });
}

/** बिल हटाएं — stock वापस पहले जैसा और ग्राहक की entry भी हटे. बिल नंबर की गिनती पीछे नहीं जाती */
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
    customerAddress: inv.customerAddress || '',
    customerPan: inv.customerPan || '',
    items: inv.items || [],
    exchange: inv.exchange || {},
    subtotal: num(inv.subtotal),
    making: num(inv.making),
    hallmark: num(inv.hallmark),
    discount: num(inv.discount),
    gstPct: num(inv.gstPct),
    gst: num(inv.gst),
    roundOff: num(inv.roundOff),
    total: num(inv.total),
    paid: num(inv.paid),
    due: num(inv.due),
    payments: Array.isArray(inv.payments) ? inv.payments : [],
    createdAt: inv.createdAt || new Date().toISOString(),
  };
  if (typeof inv.seq === 'number' && SERIES_PREFIX[inv.series] !== undefined && inv.fy) {
    Object.assign(doc, {
      series: inv.series, fy: inv.fy, seq: inv.seq, billNo: inv.billNo || SERIES_PREFIX[inv.series] + inv.seq,
    });
  } else if (inv.billNo) {
    doc.billNo = inv.billNo;
  }
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
 * "बिल असली है" बताने को चाहिए: ग्राहक का नाम छिपा हुआ, फ़ोन-पता-PAN और बकाया रकम नहीं.
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
      gstin: settings.gstin || '',
    },
    bill: {
      billNo: billNoOf(d),
      barcode: d.barcode,
      date: d.date,
      type: d.type,
      gstMode: d.gstMode,
      customer: maskName(d.customerName),
      items: (d.items || []).map((it) => ({
        name: it.name, metal: it.metal, huid: it.huid || '', weight: num(it.weight), purity: num(it.purity),
      })),
      total: round2(d.total),
      fullyPaid: num(d.due) <= 0,
    },
  };
}

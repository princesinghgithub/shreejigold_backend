import { setMeta, META } from '../db/index.js';
import { daysAgo } from '../lib/helpers.js';
import { importAll } from './backup.js';

/**
 * फ्रंटएंड के src/lib/seed.js जैसा ही demo data.
 * बिल यहाँ सीधे createInvoice से नहीं बनाए — पहले पूरा object बनाकर
 * importAll से डालते हैं, ताकि stock/ledger दो बार न गिने जाएं.
 */
export function buildDemoData() {
  const rates = { gold: 7250, silver: 92, updatedAt: new Date().toISOString() };
  const settings = {
    gst: 3,
    shopName: 'Soni Ji Jewellers',
    shopAddress: 'खाताखेड़ी, मौगंज, मध्य प्रदेश',
    shopPhone: '9876543210',
  };

  const customers = [
    { id: 'cust_demo1', name: 'Rakesh Patel', phone: '9827001122', address: 'गांधी चौक, मौगंज', balance: 0, ledger: [{ id: 'led_demo1', date: daysAgo(20), note: 'पुराना बकाया (Opening Balance)', amount: 3000 }] },
    { id: 'cust_demo2', name: 'Sunita Devi', phone: '9891234567', address: 'स्टेशन रोड, मौगंज', balance: 0, ledger: [] },
    { id: 'cust_demo3', name: 'Mahesh Sahu', phone: '9800112233', address: 'बस स्टैंड के पास, मौगंज', balance: 0, ledger: [{ id: 'led_demo2', date: daysAgo(5), note: 'एडवांस जमा', amount: -1500 }] },
    { id: 'cust_demo4', name: 'Priya Vishwakarma', phone: '9756123489', address: 'मुख्य बाज़ार, मौगंज', balance: 0, ledger: [] },
  ];

  const stock = [
    { id: 'stk_demo1', name: 'चूड़ी सेट', category: 'Gold', purity: '22K', weight: 180, qty: 6 },
    { id: 'stk_demo2', name: 'अंगूठी', category: 'Gold', purity: '22K', weight: 42, qty: 9 },
    { id: 'stk_demo3', name: 'मंगलसूत्र', category: 'Gold', purity: '22K', weight: 65, qty: 4 },
    { id: 'stk_demo4', name: 'कान की बाली', category: 'Gold', purity: '18K', weight: 38, qty: 7 },
    { id: 'stk_demo5', name: 'चांदी पायल', category: 'Silver', purity: '92.5%', weight: 420, qty: 10 },
    { id: 'stk_demo6', name: 'चांदी की थाली', category: 'Silver', purity: '92.5%', weight: 850, qty: 3 },
    { id: 'stk_demo7', name: 'हार सेट', category: 'Gold', purity: '22K', weight: 95, qty: 2 },
  ];

  const offers = [
    { id: 'off_demo1', title: 'दीपावली Making Charge छूट', discountPercent: 15, startDate: daysAgo(3), endDate: daysAgo(-20), description: 'सभी सोने के गहनों पर Making Charge में 15% की छूट' },
    { id: 'off_demo2', title: 'चांदी के बर्तन पर Offer', discountPercent: 8, startDate: daysAgo(10), endDate: daysAgo(-5), description: 'चांदी के बर्तनों की खरीद पर 8% छूट' },
  ];

  const invoices = [];
  let seq = 0;

  function mkInvoice(type, dayOffset, custIdx, itemDefs, paidRatio, gstMode = 'gst') {
    seq += 1;
    const cust = customers[custIdx];
    const items = itemDefs.map((d) => {
      const rate = d.metal === 'Gold' ? rates.gold : rates.silver;
      const metalVal = d.weight * (d.purity / 100) * rate;
      const making =
        d.makingType === 'perg' ? d.making * d.weight
          : d.makingType === 'pct' ? metalVal * (d.making / 100)
            : d.making;
      return { ...d, metalVal, making, itemTotal: metalVal + making };
    });
    const subtotal = items.reduce((s, i) => s + i.metalVal, 0);
    const making = items.reduce((s, i) => s + i.making, 0);
    const gross = subtotal + making;
    const discount = Math.round(gross * 0.02);
    const afterDisc = gross - discount;
    const gstPct = gstMode === 'nongst' ? 0 : settings.gst;
    const gst = afterDisc * (gstPct / 100);
    const total = Math.round(afterDisc + gst);
    const paid = Math.round(total * paidRatio);
    const due = total - paid;
    const id = 'inv_demo' + seq;
    const inv = {
      id,
      type,
      gstMode,
      barcode: String(100000000000 + seq),
      date: daysAgo(dayOffset),
      customerId: cust ? cust.id : null,
      customerName: cust ? cust.name : 'Walk-in Customer',
      customerPhone: cust ? cust.phone : '',
      items,
      exchange: { weight: 0, purity: 0, deduct: 0, rate: 0, value: 0 },
      subtotal, making, discount, gstPct, gst, total, paid, due,
      createdAt: new Date().toISOString(),
    };
    invoices.push(inv);
    if (cust && due !== 0) {
      cust.ledger.push({
        id: 'led_' + id,
        date: inv.date,
        note: (type === 'sale' ? 'बिक्री बिल' : 'खरीद बिल') + ' #' + id.slice(-5),
        amount: due,
        invoiceId: id,
      });
    }
  }

  mkInvoice('sale', 6, 0, [{ name: 'अंगूठी', metal: 'Gold', weight: 8, purity: 91.6, makingType: 'perg', making: 350 }], 1);
  mkInvoice('sale', 5, 3, [{ name: 'मंगलसूत्र', metal: 'Gold', weight: 14, purity: 91.6, makingType: 'perg', making: 400 }], 0.6);
  mkInvoice('sale', 3, 1, [{ name: 'चांदी पायल', metal: 'Silver', weight: 120, purity: 92.5, makingType: 'flat', making: 600 }], 1);
  mkInvoice('purchase', 9, 2, [{ name: 'पुरानी अंगूठी', metal: 'Gold', weight: 6, purity: 75, makingType: 'flat', making: 0 }], 1);
  mkInvoice('sale', 2, 0, [{ name: 'हार सेट', metal: 'Gold', weight: 22, purity: 91.6, makingType: 'pct', making: 12 }], 0.7);
  mkInvoice('sale', 1, 3, [{ name: 'कान की बाली', metal: 'Gold', weight: 9, purity: 75, makingType: 'perg', making: 300 }], 1);
  mkInvoice('sale', 0, 1, [{ name: 'चांदी की थाली', metal: 'Silver', weight: 250, purity: 92.5, makingType: 'flat', making: 900 }], 1);
  mkInvoice('sale', 0, 0, [
    { name: 'अंगूठी', metal: 'Gold', weight: 6, purity: 91.6, makingType: 'perg', making: 350 },
    { name: 'चांदी पायल', metal: 'Silver', weight: 80, purity: 92.5, makingType: 'flat', making: 300 },
  ], 0.5);
  mkInvoice('sale', 4, 2, [{ name: 'अंगूठी (Estimate)', metal: 'Gold', weight: 5, purity: 91.6, makingType: 'perg', making: 300 }], 1, 'nongst');

  // बिल बनने के बाद हर ग्राहक की balance उसकी ledger से मिला दें, ताकि
  // यह demo फाइल restore करने पर भी बिलकुल वही बकाया दिखे.
  for (const c of customers) {
    c.balance = Math.round(c.ledger.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  }

  return { rates, settings, customers, stock, invoices, offers };
}

/** मौजूदा डेटा हटाकर demo data भर दें */
export async function seedDemoData() {
  const data = buildDemoData();
  const result = await importAll(data);
  await setMeta(META.RATES, data.rates);
  return result;
}

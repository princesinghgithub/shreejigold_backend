// टेस्ट के लिए असली MongoDB — replica set, ताकि transactions भी सच में जाँचे जाएं
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
process.env.MONGODB_URI = mongo.getUri();
process.env.MONGODB_DB = 'shreejigold_test';
process.env.LOG_REQUESTS = 'false';
process.env.JWT_SECRET = 'smoke-test-secret';
process.env.AUTO_BACKUP = 'false';
process.env.CRON_SECRET = 'test-cron-secret';
process.env.WEB_DIR = './__no_web__';
process.env.MAIL_TRANSPORT = 'json'; // असली email नहीं जाता — mailer.js के outbox में जमा होता है
process.env.ALLOW_SETUP = 'true'; // टेस्ट का खाता /auth/setup से बनता है (असली ऐप में यह बंद रहता है)

const { createApp } = await import('../src/app.js');
const app = createApp();
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const base = 'http://127.0.0.1:' + server.address().port;

let token = null;
let pass = 0;
let fail = 0;

async function call(method, path, body, opts = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token && !opts.noAuth ? { authorization: 'Bearer ' + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '  ' + String(JSON.stringify(extra)).slice(0, 400)); }
}

let r;

// आज की तारीख (IST) और उसका financial year — बिल नंबर की गिनती इसी से
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const FY = (() => {
  const y = Number(TODAY.slice(0, 4));
  const s = Number(TODAY.slice(5, 7)) >= 4 ? y : y - 1;
  return `${s}-${String((s + 1) % 100).padStart(2, '0')}`;
})();

console.log('\n-- health & auth --');
r = await call('GET', '/api/health'); check('health', r.status === 200 && r.data.ok, r);
r = await call('GET', '/api/auth/status'); check('status isSetup=false', r.data.isSetup === false, r);
r = await call('GET', '/api/shop/rates'); check('protected route blocked', r.status === 401, r);
r = await call('POST', '/api/auth/login', { userId: 'x', password: 'x' }); check('login before setup -> 400', r.status === 400, r);
r = await call('POST', '/api/auth/setup', { userId: 'ab', password: 'soniji123', question: 'q', answer: 'a' });
check('short userId rejected', r.status === 400 && r.data.error.includes('यूज़र ID'), r);
r = await call('POST', '/api/auth/setup', { userId: 'chhote lal', password: 'soniji123', question: 'q', answer: 'a' });
check('userId with space rejected', r.status === 400 && r.data.error.includes('जगह'), r);
r = await call('POST', '/api/auth/setup', { userId: 'chhotelal', password: '123', question: 'q', answer: 'a' });
check('short password rejected', r.status === 400, r);
r = await call('POST', '/api/auth/setup', { userId: 'chhotelal', password: 'soniji123', answer: 'a' });
check('setup without question rejected', r.status === 400, r);
r = await call('POST', '/api/auth/setup', {
  userId: 'ChhoteLal', password: 'soniji123',
  question: 'आपका गाँव कौन सा है?', answer: 'Khatkhari',
});
check('setup ok', r.status === 201 && r.data.token && r.data.userId === 'ChhoteLal', r);
token = r.data.token;
r = await call('GET', '/api/auth/me'); check('me carries userId', r.status === 200 && r.data.user.sub === 'chhotelal', r);
r = await call('GET', '/api/auth/status'); check('status now setup + has question', r.data.isSetup && r.data.hasSecurityQuestion, r);
r = await call('POST', '/api/auth/setup', { userId: 'aur', password: 'again123', question: 'q', answer: 'a' }, { noAuth: true });
check('double setup rejected', r.status === 400, r);
r = await call('POST', '/api/auth/login', { userId: 'chhotelal', password: 'wrong' }, { noAuth: true });
check('wrong password -> 401', r.status === 401, r);
r = await call('POST', '/api/auth/login', { userId: 'koiaur', password: 'soniji123' }, { noAuth: true });
check('wrong userId -> 401', r.status === 401, r);
check('error does not reveal which field', r.data.error === 'यूज़र ID या पासवर्ड गलत है', r.data);
r = await call('POST', '/api/auth/login', { userId: 'CHHOTELAL', password: 'soniji123' }, { noAuth: true });
check('login is case-insensitive on userId', r.status === 200 && r.data.token, r);
token = r.data.token;
{
  const good = token;
  token = 'garbage.token.here';
  r = await call('GET', '/api/shop/rates'); check('bad token -> 401', r.status === 401, r);
  token = good;
}

console.log('\n-- पासवर्ड भूल गए --');
r = await call('GET', '/api/auth/forgot?userId=galat', undefined, { noAuth: true });
check('unknown userId -> 404', r.status === 404, r);
r = await call('GET', '/api/auth/forgot?userId=chhotelal', undefined, { noAuth: true });
check('question returned without login', r.status === 200 && r.data.question.includes('गाँव'), r);
r = await call('POST', '/api/auth/forgot', { userId: 'chhotelal', answer: 'galat', newPassword: 'naya1234' }, { noAuth: true });
check('wrong answer -> 401', r.status === 401, r);
r = await call('POST', '/api/auth/login', { userId: 'chhotelal', password: 'soniji123' }, { noAuth: true });
check('password unchanged after wrong answer', r.status === 200, r);
r = await call('POST', '/api/auth/forgot', { userId: 'chhotelal', answer: ' KHATKHARI ', newPassword: 'naya1234' }, { noAuth: true });
check('right answer resets password', r.status === 200 && r.data.reset, r);
r = await call('POST', '/api/auth/login', { userId: 'chhotelal', password: 'naya1234' }, { noAuth: true });
check('new password works', r.status === 200, r);
token = r.data.token;
r = await call('POST', '/api/auth/login', { userId: 'chhotelal', password: 'soniji123' }, { noAuth: true });
check('old password dead', r.status === 401, r);
console.log('\n-- shop settings & rates --');
r = await call('GET', '/api/shop/settings'); check('default settings gst=3', r.data.gst === 3, r);
r = await call('PUT', '/api/shop/settings', { shopName: 'Soni Ji Jewellers', shopPhone: '9876543210', gst: 3 });
check('update settings', r.data.shopPhone === '9876543210', r);
r = await call('PUT', '/api/shop/rates', { gold: 7250, silver: 92 });
check('update rates', r.data.gold === 7250 && Boolean(r.data.updatedAt), r);

console.log('\n-- customers & ledger --');
r = await call('POST', '/api/customers', { name: 'Rakesh Patel', phone: '9827001122', openingBalance: 3000 });
check('create customer w/ opening balance', r.status === 201 && r.data.balance === 3000 && r.data.ledger.length === 1, r);
const custId = r.data.id;
r = await call('POST', '/api/customers', {}); check('customer without name -> 400', r.status === 400, r);
r = await call('POST', '/api/customers/' + custId + '/ledger', { amount: -1000, note: 'bhugtan' });
check('ledger payment lowers balance', r.data.balance === 2000, r);
r = await call('GET', '/api/customers?search=rakesh'); check('customer search', r.data.length === 1, r);
r = await call('GET', '/api/customers?search=' + encodeURIComponent('+91(')); check('search with + ( does not crash', r.status === 200 && Array.isArray(r.data), r);
r = await call('PUT', '/api/customers/' + custId, { address: 'Gandhi Chowk' }); check('update customer', r.data.address === 'Gandhi Chowk', r);
r = await call('GET', '/api/customers/nope'); check('missing customer -> 404', r.status === 404, r);

console.log('\n-- stock --');
r = await call('POST', '/api/stock', { name: 'Angoothi', category: 'Gold', purity: '22K', weight: 42, qty: 9 });
check('create stock', r.status === 201, r);
const stkId = r.data.id;
r = await call('GET', '/api/stock?category=gold'); check('stock filter by category', r.data.length === 1, r);
r = await call('PUT', '/api/stock/' + stkId, { qty: 10 });
check('partial update keeps other fields', r.data.qty === 10 && r.data.weight === 42 && r.data.purity === '22K', r);

console.log('\n-- invoices --');
r = await call('POST', '/api/invoices', {
  type: 'sale',
  customerId: custId,
  items: [{ name: 'Angoothi', metal: 'Gold', weight: 8, purity: 91.6, makingType: 'perg', making: 350 }],
  paid: 30000,
});
// metalVal = 8*0.916*7250 = 53128 ; making = 2800 ; gross 55928 ; gst 3% = 1677.84 ; 57605.84 → पूरे रुपये 57606 (Round Off +0.16)
check('create invoice totals', r.status === 201 && r.data.total === 57606 && r.data.roundOff === 0.16 && r.data.due === 27606, r);
check('पहला GST बिल नंबर 1 (इस financial year में)', r.data.billNo === '1' && r.data.series === 'INV' && r.data.fy === FY && r.data.seq === 1, r.data);
const invId = r.data.id;
const barcode = r.data.barcode;
check('invoice barcode 12 digits', /^\d{12}$/.test(barcode), barcode);
r = await call('GET', '/api/stock/' + stkId); check('sale reduced stock', r.data.qty === 9 && r.data.weight === 34, r);
r = await call('GET', '/api/customers/' + custId); check('due added to ledger', r.data.balance === 29606, r);
r = await call('GET', '/api/invoices/barcode/' + barcode); check('lookup by barcode', r.data.id === invId, r);
r = await call('GET', '/api/public/bills/' + barcode, undefined, { noAuth: true });
check('बिल जाँच (QR) बिना login: दुकान, items, कुल', r.status === 200 && r.data.bill.total === 57606 && r.data.bill.billNo === '1' && r.data.bill.items.length === 1 && r.data.shop.nameHi && r.data.bill.fullyPaid === false, r);
check('बिल जाँच में ग्राहक का फ़ोन / पूरा नाम / बकाया नहीं', !JSON.stringify(r.data.bill).includes('9827001122') && r.data.bill.customer.startsWith('R') && !r.data.bill.customer.includes('Rakesh') && !('due' in r.data.bill), r.data.bill);
r = await call('GET', '/api/public/bills/123456789012', undefined, { noAuth: true }); check('नकली बिल नंबर -> 404', r.status === 404, r);
r = await call('GET', '/api/public/bills/abc', undefined, { noAuth: true }); check('गलत बिल नंबर -> 404', r.status === 404, r);
r = await call('POST', '/api/invoices/' + invId + '/payment', { amount: 5000 });
check('record payment', r.data.paid === 35000 && r.data.due === 22606 && r.data.payments.length === 1 && r.data.payments[0].mode === 'cash', r);
r = await call('GET', '/api/customers/' + custId); check('payment lowered balance', r.data.balance === 24606, r);
r = await call('POST', '/api/invoices/' + invId + '/payment', { amount: -5 }); check('negative payment -> 400', r.status === 400, r);
r = await call('POST', '/api/invoices', { type: 'sale', items: [] }); check('invoice without items -> 400', r.status === 400, r);
r = await call('POST', '/api/invoices', { type: 'sale', items: [{ name: 'Galti', metal: 'Gold', weight: 8, purity: 916, makingType: 'flat', making: 0 }] });
check('purity 916% (91.6 की जगह गलती) -> 400 साफ़ संदेश', r.status === 400 && r.data.details[0].message.includes('Purity'), r);
r = await call('POST', '/api/invoices', { type: 'sale', items: [{ name: 'Haar', metal: 'Gold', weight: 5, purity: 91.6, makingType: 'flat', making: 0 }], exchange: { weight: 2, purity: 750, deduct: 5, rate: 7000 } });
check('पुराने सोने की purity 750% -> 400', r.status === 400, r);
r = await call('POST', '/api/invoices', {
  type: 'sale',
  gstMode: 'nongst',
  customerName: 'Walk-in Test',
  items: [{ name: 'Chandi Payal', metal: 'Silver', weight: 100, purity: 92.5, makingType: 'flat', making: 600 }],
  paid: 0,
});
// 100*0.925*92 = 8510 + 600 = 9110, no gst
check('nongst invoice + auto customer', r.status === 201 && r.data.gst === 0 && r.data.total === 9110 && r.data.billNo === 'E-1', r);
r = await call('GET', '/api/invoices?type=sale'); check('list invoices', r.data.length === 2, r);
r = await call('GET', '/api/invoices?search=walk'); check('invoice search', r.data.length === 1, r);

console.log('\n-- exchange (purana sona) --');
r = await call('POST', '/api/invoices', {
  type: 'sale',
  gstMode: 'nongst',
  items: [{ name: 'Haar', metal: 'Gold', weight: 10, purity: 91.6, makingType: 'flat', making: 1000 }],
  exchange: { weight: 5, purity: 75, deduct: 10, rate: 7250 },
  paid: 0,
});
// metal 66410 + 1000 = 67410 ; exchange = 5*0.75*0.9*7250 = 24468.75 ; 42941.25 → 42941
check('exchange deducted from total', r.data.total === 42941 && r.data.roundOff === -0.25 && r.data.exchange.value === 24468.75 && r.data.billNo === 'E-2', r);
const inv3 = r.data.id;

console.log('\n-- reports --');
r = await call('GET', '/api/shop/dashboard');
check('dashboard', r.data.last7Days.length === 7 && r.data.customerCount >= 1 && r.data.recentInvoices.length === 3, r);
r = await call('GET', '/api/reports/daily'); check('daily report', r.data.summary.saleCount === 3, r);
r = await call('GET', '/api/reports/monthly'); check('monthly report', r.data.count === 3, r);
r = await call('GET', '/api/reports/export.csv');
check('csv export', typeof r.data === 'string' && r.data.includes('Bill No') && r.data.split('\n').length === 4, String(r.data).slice(0, 120));

console.log('\n-- offers --');
r = await call('POST', '/api/offers', { title: 'Diwali Chhoot', discountPercent: 15, startDate: '2020-01-01', endDate: '2099-01-01' });
check('create offer', r.status === 201, r);
r = await call('GET', '/api/offers?active=1'); check('active offers', r.data.length === 1, r);

console.log('\n-- invoice delete rolls back stock + ledger --');
r = await call('DELETE', '/api/invoices/' + invId); check('delete invoice', r.data.deleted, r);
r = await call('GET', '/api/stock/' + stkId); check('stock restored', r.data.qty === 10 && r.data.weight === 42, r);
r = await call('GET', '/api/customers/' + custId); check('ledger rolled back to 2000', r.data.balance === 2000, r);

console.log('\n-- बिल की पूरी जानकारी: HUID, Gross/Net, Hallmark, भुगतान के तरीके, PAN --');
r = await call('POST', '/api/invoices', {
  type: 'sale',
  customerId: custId,
  customerAddress: 'Shanti Nagar',
  customerPan: 'abcde1234f',
  items: [{ name: 'Har', metal: 'Gold', huid: 'vgxvxh', grossWeight: 9.5, weight: 9.08, purity: 91.6, makingType: 'pct', making: 13, hallmark: 100 }],
  payments: [{ mode: 'cash', amount: 50000 }, { mode: 'upi', amount: 20000 }, { mode: 'card', amount: 0 }],
});
// metal 9.08*0.916*7250 = 60300.28 ; making 13% = 7839.04 ; hallmark 100 ; gst 3% ; 70286.50 → 70286 (Round Off −0.50)
{
  const d = r.data;
  const it = d.items && d.items[0];
  check('बिल बना', r.status === 201, r);
  check('HUID बड़े अक्षरों में, gross/net, भाव, making दर, hallmark', it && it.huid === 'VGXVXH' && it.grossWeight === 9.5 && it.weight === 9.08 && it.rate === 6641 && it.makingRate === 13 && it.hallmark === 100 && it.itemTotal === 68239.32, it);
  check('hallmark GST से पहले जुड़ा, कुल पूरे रुपये में', d.hallmark === 100 && d.total === 70286 && d.roundOff === -0.5, d);
  check('भुगतान तरीके-वार, paid = जोड़, ₹0 वाला छोड़ा', d.paid === 70000 && d.due === 286 && d.payments.length === 2 && d.payments[1].mode === 'upi', d.payments);
  check('ग्राहक का पता और PAN बिल पर', d.customerAddress === 'Shanti Nagar' && d.customerPan === 'ABCDE1234F', d);
  check('बिल हटने के बाद भी नंबर दोबारा नहीं — अगला 2', d.billNo === '2', d.billNo);
}
const detailId = r.data.id;
const detailBarcode = r.data.barcode;
r = await call('POST', '/api/invoices/' + detailId + '/payment', { amount: 286, mode: 'upi' });
check('बाकी UPI से जमा', r.data.due === 0 && r.data.payments.length === 3 && r.data.payments[2].mode === 'upi', r.data);
r = await call('POST', '/api/invoices/' + detailId + '/payment', { amount: 10, mode: 'bitcoin' });
check('अनजान भुगतान तरीका -> 400', r.status === 400, r);
r = await call('GET', '/api/invoices?billNo=2'); check('बिल नंबर से खोज', r.data.length === 1 && r.data[0].id === detailId, r.data);
r = await call('GET', '/api/invoices?search=e-1'); check('search में बिल नंबर (E-1)', r.data.some((i) => i.billNo === 'E-1'), r.data);
r = await call('GET', '/api/public/bills/' + detailBarcode, undefined, { noAuth: true });
check('बिल जाँच में बिल नंबर और HUID, PAN नहीं', r.data.bill.billNo === '2' && r.data.bill.items[0].huid === 'VGXVXH' && !JSON.stringify(r.data).includes('ABCDE1234F'), r.data);
{
  const bad = (patch) => call('POST', '/api/invoices', { type: 'sale', items: [{ name: 'X', metal: 'Gold', weight: 5, purity: 91.6, ...patch }] });
  r = await bad({ huid: 'AB12' }); check('HUID 6 अक्षर का नहीं -> 400', r.status === 400 && JSON.stringify(r.data).includes('HUID'), r);
  r = await bad({ grossWeight: 4 }); check('Gross < Net -> 400', r.status === 400 && JSON.stringify(r.data).includes('Gross'), r);
  r = await bad({ hallmark: -5 }); check('Hallmark charge ऋणात्मक -> 400', r.status === 400, r);
}
r = await call('POST', '/api/invoices', { type: 'sale', customerPan: 'XYZ', items: [{ name: 'X', metal: 'Gold', weight: 5, purity: 91.6 }] });
check('गलत PAN -> 400', r.status === 400 && JSON.stringify(r.data).includes('PAN'), r);
r = await call('POST', '/api/invoices', { type: 'purchase', items: [{ name: 'Purani', metal: 'Gold', weight: 2, purity: 75 }] });
check('खरीद की अलग series P-1', r.status === 201 && r.data.billNo === 'P-1', r.data);
const purchaseId = r.data.id;
// आगे backup वाले टेस्ट की गिनती पहले जैसी रहे
r = await call('DELETE', '/api/invoices/' + detailId); check('detail बिल हटा', r.data.deleted, r);
r = await call('DELETE', '/api/invoices/' + purchaseId); check('खरीद बिल हटा', r.data.deleted, r);
r = await call('GET', '/api/customers/' + custId); check('खाता फिर 2000', r.data.balance === 2000, r);

console.log('\n-- ऊपर के खाने से खोज (ग्राहक + बिल) --');
r = await call('GET', '/api/search?q=rakesh');
check('नाम से ग्राहक — बकाया और बिल की गिनती के साथ', r.status === 200 && r.data.customers.length === 1 && r.data.customers[0].id === custId && r.data.customers[0].balance === 2000 && typeof r.data.customers[0].bills === 'number', r.data.customers);
r = await call('GET', '/api/search?q=9827001122');
check('फ़ोन नंबर से ग्राहक', r.data.customers.length === 1 && r.data.customers[0].id === custId, r.data.customers);
r = await call('GET', '/api/search?q=E-1');
check('छपे बिल नंबर से बिल', r.data.invoices.some((i) => i.billNo === 'E-1'), r.data.invoices);
r = await call('GET', '/api/search?q=walk');
check('नाम से बिल भी मिलते हैं', r.data.invoices.some((i) => i.customerName.includes('Walk-in')), r.data.invoices);
r = await call('GET', '/api/search?q=' + encodeURIComponent('+91('));
check('अजीब अक्षरों से खोज नहीं टूटती', r.status === 200 && Array.isArray(r.data.customers), r.data);
r = await call('GET', '/api/search?q=');
check('खाली खोज -> खाली जवाब', r.status === 200 && r.data.customers.length === 0 && r.data.invoices.length === 0, r.data);
r = await call('GET', '/api/search?q=rakesh', undefined, { noAuth: true });
check('बिना लॉगिन खोज -> 401', r.status === 401, r);

console.log('\n-- GST: प्रतिशत में या सीधे रुपयों में --');
r = await call('POST', '/api/invoices', {
  type: 'sale', gstMode: 'gst', gstType: 'flat', gstValue: 1500,
  items: [{ name: 'Kada', metal: 'Gold', weight: 8, purity: 91.6, makingType: 'flat', making: 2800 }],
});
// धातु 53128 + मजदूरी 2800 = 55928 ; GST सीधा ₹1500 ; कुल 57428 (1500/55928 = 2.68%)
check('GST रुपयों में — वही रकम लगी और प्रतिशत उसी से निकला', r.status === 201 && r.data.gstType === 'flat' && r.data.gstValue === 1500 && r.data.gst === 1500 && r.data.total === 57428 && r.data.gstPct === 2.68, r.data);
const flatGstId = r.data.id;
r = await call('POST', '/api/invoices', {
  type: 'sale', gstMode: 'gst', gstPct: 3,
  items: [{ name: 'Kada', metal: 'Gold', weight: 8, purity: 91.6, makingType: 'flat', making: 2800 }],
});
check('प्रतिशत वाला पुराना तरीका वैसे का वैसा', r.data.gstType === 'pct' && r.data.gstPct === 3 && r.data.gst === 1677.84 && r.data.total === 57606, r.data);
const pctGstId = r.data.id;
r = await call('POST', '/api/invoices', {
  type: 'sale', gstMode: 'nongst', gstType: 'flat', gstValue: 900,
  items: [{ name: 'Chandi', metal: 'Silver', weight: 10, purity: 92.5, makingType: 'flat', making: 100 }],
});
check('बिना GST बिल में रुपयों वाला GST भी नहीं लगता', r.data.gst === 0 && r.data.gstType === 'pct' && r.data.gstPct === 0, r.data);
const noGstId = r.data.id;
r = await call('DELETE', '/api/invoices/' + flatGstId); check('GST वाले जाँच-बिल हटे (1/3)', r.data.deleted, r);
r = await call('DELETE', '/api/invoices/' + pctGstId); check('GST वाले जाँच-बिल हटे (2/3)', r.data.deleted, r);
r = await call('DELETE', '/api/invoices/' + noGstId); check('GST वाले जाँच-बिल हटे (3/3)', r.data.deleted, r);

console.log('\n-- पुराना ग्राहक दोबारा: नया खाता न बने --');
r = await call('POST', '/api/invoices', {
  type: 'sale', customerName: 'rakesh patel', customerPhone: '+91 98270-01122',
  items: [{ name: 'Chain', metal: 'Gold', weight: 1, purity: 91.6, makingType: 'flat', making: 0 }],
});
const againId = r.data.id;
check('वही नाम-नंबर पर बिल — पुराना ही खाता (नाम/नंबर का रूप बदला हो तब भी)', r.data.customerId === custId, r.data.customerId);
r = await call('GET', '/api/customers');
check('कोई दूसरा खाता नहीं बना', r.data.filter((c) => c.name.toLowerCase().includes('rakesh')).length === 1, r.data.map((c) => c.name));
r = await call('GET', '/api/customers/' + custId);
check('नए बिल का बकाया उसी पुराने खाते में जुड़ा', r.data.balance > 2000 && r.data.ledger.some((l) => l.invoiceId === againId), r.data.balance);
r = await call('DELETE', '/api/invoices/' + againId);
check('जाँच-बिल हटा, खाता फिर 2000', r.data.deleted, r);
r = await call('GET', '/api/customers/' + custId); check('बकाया वापस 2000', r.data.balance === 2000, r.data.balance);

r = await call('POST', '/api/customers', { name: 'Rakesh Patel', phone: '9827001122' });
check('वही ग्राहक दोबारा जोड़ने पर -> 409 साफ़ संदेश', r.status === 409 && r.data.error.includes('पहले से है'), r);
r = await call('POST', '/api/customers', { name: 'Rakesh Patel', phone: '9827001122', allowDuplicate: true });
check('सचमुच अलग आदमी हो तो allowDuplicate से बनता है', r.status === 201, r);
const dupId = r.data.id;
r = await call('POST', '/api/customers/' + dupId + '/ledger', { amount: 500, note: 'दोहरे खाते का बकाया' });
check('दोहरे खाते में 500 बकाया', r.data.balance === 500, r);
r = await call('GET', '/api/customers/duplicates');
check('दोहरे खाते पकड़े गए (एक ही नंबर)', r.status === 200 && r.data.some((g) => g.by === 'phone' && g.customers.length === 2), r.data);
r = await call('POST', '/api/customers/' + custId + '/merge', { from: dupId });
check('मिलाने पर बकाया जुड़ गया (2000 + 500)', r.status === 200 && r.data.balance === 2500, r.data);
r = await call('GET', '/api/customers/' + dupId); check('दोहरा खाता हट गया', r.status === 404, r);
r = await call('GET', '/api/customers/duplicates'); check('अब कोई दोहरा खाता नहीं', r.data.length === 0, r.data);
r = await call('POST', '/api/customers/' + custId + '/merge', { from: custId });
check('अपने आप में मिलाना -> 400', r.status === 400, r);
r = await call('POST', '/api/customers/' + custId + '/ledger', { amount: -500, note: 'जाँच वापस' });
check('खाता फिर 2000 पर', r.data.balance === 2000, r);

console.log('\n-- backup / restore --');
r = await call('GET', '/api/backup');
const snapshot = r.data;
check('export shape', ['rates', 'customers', 'stock', 'invoices', 'offers', 'settings'].every((k) => k in snapshot), Object.keys(snapshot));
check('export has balance', snapshot.customers.find((c) => c.id === custId).balance === 2000, snapshot.customers);
r = await call('DELETE', '/api/backup/all'); check('clear all', r.data.counts.invoices === 0 && r.data.counts.customers === 0, r);
r = await call('POST', '/api/backup/restore', snapshot);
check('restore counts', r.data.counts.customers === 2 && r.data.counts.invoices === 2 && r.data.counts.stock >= 1, r);
r = await call('GET', '/api/customers/' + custId); check('restore kept balance', r.data.balance === 2000, r);
r = await call('GET', '/api/invoices/' + inv3); check('restore kept invoice total', r.data.total === 42941 && r.data.billNo === 'E-2', r);
r = await call('GET', '/api/shop/rates'); check('restore kept rates', r.data.gold === 7250, r);
// बीच में बने-हटे बिल भी नंबर ले चुके हैं, इसलिए पक्का अंक नहीं जाँचते —
// बस यह कि गिनती पीछे नहीं गई और अगला नंबर उससे एक आगे है
r = await call('POST', '/api/invoices', { type: 'sale', items: [{ name: 'Nath', metal: 'Gold', weight: 1, purity: 91.6 }] });
const noAfterRestore = Number(r.data.billNo);
r = await call('POST', '/api/invoices', { type: 'sale', items: [{ name: 'Nath', metal: 'Gold', weight: 1, purity: 91.6 }] });
check('restore के बाद भी गिनती आगे से चली (पीछे नहीं गई)', noAfterRestore > 1 && Number(r.data.billNo) === noAfterRestore + 1, `${noAfterRestore} → ${r.data.billNo}`);

console.log('\n-- frontend-style backup (balance without ledger) --');
r = await call('POST', '/api/backup/restore', {
  rates: { gold: 7000, silver: 90 },
  settings: { gst: 3, shopName: 'Test' },
  customers: [
    { id: 'c1', name: 'Legacy Cust', phone: '99', address: '', balance: 5000, ledger: [] },
    { id: 'c2', name: 'Mixed', phone: '88', address: '', balance: 4500, ledger: [{ date: '2025-01-01', note: 'bill', amount: 1500 }] },
  ],
  stock: [],
  invoices: [],
  offers: [],
});
check('legacy restore ok', r.status === 200, r);
r = await call('GET', '/api/customers/c1'); check('balance-only customer preserved', r.data.balance === 5000, r);
r = await call('GET', '/api/customers/c2'); check('mixed customer preserved', r.data.balance === 4500, r);

console.log('\n-- backup के बिल नंबर से आगे गिनती --');
r = await call('POST', '/api/backup/restore', {
  rates: { gold: 7000, silver: 90 }, settings: { gst: 3 }, customers: [], stock: [], offers: [],
  invoices: [{ id: 'inv_old50', type: 'sale', gstMode: 'gst', barcode: '555555555555', date: TODAY, series: 'INV', fy: FY, seq: 50, billNo: '50', items: [], total: 0, paid: 0, due: 0 }],
});
check('backup restore', r.status === 200 && r.data.counts.invoices === 1, r);
r = await call('POST', '/api/invoices', { type: 'sale', items: [{ name: 'Nath', metal: 'Gold', weight: 1, purity: 91.6 }] });
check('backup में 50 तक के बिल — अगला 51', r.data.billNo === '51', r.data);

console.log('\n-- seed demo --');
r = await call('POST', '/api/backup/seed-demo');
check('seed demo', r.data.counts.invoices === 9 && r.data.counts.customers === 4 && r.data.counts.stock === 7, r);
r = await call('GET', '/api/customers/cust_demo1');
const demoBalance = r.data.balance;
check('seeded customer has ledger-backed balance', demoBalance > 0 && r.data.ledger.length >= 2, r.data);

console.log('\n-- backup round-trip is lossless --');
r = await call('GET', '/api/backup');
const snap2 = r.data;
r = await call('POST', '/api/backup/restore', snap2);
check('re-restore counts unchanged', r.data.counts.invoices === 9 && r.data.counts.customers === 4, r);
r = await call('GET', '/api/customers/cust_demo1');
check('round-trip kept balance exactly', r.data.balance === demoBalance, { got: r.data.balance, want: demoBalance });
r = await call('GET', '/api/backup');
check('round-trip kept ledger count', r.data.customers.every((c, i) => c.ledger.length === snap2.customers[i].ledger.length), r.data.customers.map((c) => c.ledger.length));

console.log('\n-- password / userId / question बदलना --');
r = await call('POST', '/api/auth/change-password', { oldPassword: 'wrong', newPassword: 'newpass1' });
check('wrong old password -> 401', r.status === 401, r);
r = await call('POST', '/api/auth/change-password', { oldPassword: 'naya1234', newPassword: 'newpass1' });
check('change password', r.data.changed, r);
r = await call('POST', '/api/auth/login', { userId: 'chhotelal', password: 'newpass1' }, { noAuth: true });
check('login with new password', r.status === 200, r);
token = r.data.token;
r = await call('POST', '/api/auth/change-userid', { password: 'wrong', newUserId: 'malik' });
check('userId change needs password', r.status === 401, r);
r = await call('POST', '/api/auth/change-userid', { password: 'newpass1', newUserId: 'Malik' });
check('userId changed', r.status === 200 && r.data.userId === 'Malik' && r.data.token, r);
token = r.data.token;
r = await call('POST', '/api/auth/login', { userId: 'malik', password: 'newpass1' }, { noAuth: true });
check('login with new userId', r.status === 200, r);
r = await call('POST', '/api/auth/login', { userId: 'chhotelal', password: 'newpass1' }, { noAuth: true });
check('old userId dead', r.status === 401, r);
r = await call('POST', '/api/auth/security-question', { password: 'newpass1', question: 'मेरी पहली अंगूठी?', answer: 'सोने की' });
check('security question updated', r.data.set, r);
r = await call('GET', '/api/auth/forgot?userId=malik', undefined, { noAuth: true });
check('new question served', r.data.question === 'मेरी पहली अंगूठी?', r);

console.log('\n-- अपने आप बनने वाली कॉपियाँ (डेटाबेस के अंदर) --');
r = await call('GET', '/api/backup/snapshots');
const beforeSnaps = r.data.length;
check('कॉपियों की सूची', Array.isArray(r.data), r);
r = await call('POST', '/api/backup/snapshots?label=test');
check('कॉपी बनी', r.status === 201 && r.data.id && r.data.counts.invoices === 9, r);
const snapId = r.data.id;
r = await call('GET', '/api/backup/snapshots');
check('सूची में जुड़ी', r.data.length === beforeSnaps + 1, r.data.length);
r = await call('GET', '/api/backup/snapshots/' + snapId);
check('कॉपी में पूरा डेटा', r.data.customers.length === 4 && r.data.invoices.length === 9, Object.keys(r.data));
r = await call('GET', '/api/backup/snapshots/koi_galat_id');
check('गलत id -> 404', r.status === 404, r);

console.log('\n-- कॉपी से वापस लाना --');
r = await call('DELETE', '/api/backup/all');
check('सब मिटा', r.data.counts.invoices === 0, r);
r = await call('POST', '/api/backup/snapshots/' + snapId + '/restore');
check('कॉपी से वापस आया', r.data.counts.invoices === 9 && r.data.counts.customers === 4, r);

console.log('\n-- रोज़ का cron backup --');
r = await call('GET', '/api/cron/backup', undefined, { noAuth: true });
check('बिना key -> 401', r.status === 401, r);
r = await call('GET', '/api/cron/backup?key=galat', undefined, { noAuth: true });
check('गलत key -> 401', r.status === 401, r);
r = await call('GET', '/api/cron/backup?key=test-cron-secret', undefined, { noAuth: true });
check('सही key पर चला', r.status === 200 && (r.data.id || r.data.skipped), r);
r = await call('GET', '/api/cron/backup?key=test-cron-secret', undefined, { noAuth: true });
check('उसी दिन दोबारा नहीं बनती', r.data.skipped === true, r);

console.log('\n-- पासवर्ड भूले — email पर OTP --');
r = await call('POST', '/api/auth/forgot/otp', { userId: 'malik' }, { noAuth: true });
check('बिना email वाले ID पर OTP मना', r.status === 400, r);
r = await call('POST', '/api/auth/change-userid', { password: 'newpass1', newUserId: 'malik@example.com' });
check('userId अब email', r.status === 200, r);
token = r.data.token;
r = await call('POST', '/api/auth/forgot/otp', { userId: 'galat@example.com' }, { noAuth: true });
check('गलत ID पर OTP -> 404', r.status === 404, r);
r = await call('POST', '/api/auth/forgot/otp', { userId: 'MALIK@example.com' }, { noAuth: true });
check('OTP भेजा, email छिपा हुआ', r.status === 200 && r.data.sent && r.data.to === 'ma***@example.com', r);
{
  const { outbox } = await import('../src/services/mailer.js');
  const mail = outbox[outbox.length - 1];
  const otp = ((mail && mail.text.match(/\b\d{6}\b/)) || [])[0];
  check('mail सही पते पर, OTP के साथ', mail && mail.to === 'malik@example.com' && otp, mail);
  r = await call('POST', '/api/auth/forgot/otp', { userId: 'malik@example.com' }, { noAuth: true });
  check('1 मिनट में दोबारा OTP मना', r.status === 400, r);
  r = await call('POST', '/api/auth/forgot/otp/verify', { userId: 'malik@example.com', otp: otp === '000000' ? '111111' : '000000', newPassword: 'otppass1' }, { noAuth: true });
  check('गलत OTP -> 401', r.status === 401, r);
  r = await call('POST', '/api/auth/login', { userId: 'malik@example.com', password: 'otppass1' }, { noAuth: true });
  check('गलत OTP पर पासवर्ड नहीं बदला', r.status === 401, r);
  r = await call('POST', '/api/auth/forgot/otp/verify', { userId: 'malik@example.com', otp, newPassword: 'otppass1' }, { noAuth: true });
  check('सही OTP से नया पासवर्ड', r.status === 200 && r.data.reset, r);
  r = await call('POST', '/api/auth/login', { userId: 'malik@example.com', password: 'otppass1' }, { noAuth: true });
  check('नए पासवर्ड से लॉगिन', r.status === 200, r);
  r = await call('POST', '/api/auth/forgot/otp/verify', { userId: 'malik@example.com', otp, newPassword: 'again123' }, { noAuth: true });
  check('वही OTP दोबारा नहीं चलता', r.status === 400, r);
}

console.log('\n-- website catalog --');
{
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
  r = await call('POST', '/api/catalog', { name: 'Test Ring', type: 'Rings', metal: '22K Gold', price: 25000, imageData: tinyPng, isNew: true });
  check('design बना (फोटो के साथ)', r.status === 201 && r.data.id && r.data.image.startsWith('/api/public/products/') && r.data.isNew === true && r.data.wearer === 'Women', r);
  const prdId = r.data.id;
  const imgPath = r.data.image;
  r = await call('POST', '/api/catalog', { name: 'Hidden Chain', active: false });
  check('छिपा design बना', r.status === 201 && r.data.active === false, r);
  const hiddenId = r.data.id;
  r = await call('POST', '/api/catalog', { name: 'Bad Photo', imageData: 'data:text/html;base64,PGgxPg==' });
  check('गलत फोटो -> 400', r.status === 400, r);
  r = await call('POST', '/api/catalog', { price: 100 });
  check('बिना नाम -> 400', r.status === 400, r);
  r = await call('GET', '/api/catalog', undefined, { noAuth: true });
  check('admin catalog बिना login बंद', r.status === 401, r);
  r = await call('GET', '/api/catalog');
  check('admin को सारे designs (छिपे भी)', r.status === 200 && r.data.length === 2, r.data);
  r = await call('GET', '/api/public/catalog', undefined, { noAuth: true });
  check('public catalog: सिर्फ दिखने वाले', r.status === 200 && r.data.products.length === 1 && r.data.products[0].id === prdId && r.data.products[0].price === 25000, r.data);
  check('public catalog में दुकान का भाव', r.data.rates.k24 === 7250 && r.data.rates.k22 === 6641, r.data.rates);
  let res = await fetch(base + imgPath);
  check('फोटो मिलती है', res.status === 200 && res.headers.get('content-type') === 'image/png', res.status);
  r = await call('PUT', '/api/catalog/' + prdId, { price: 26000, removeImage: true });
  check('design बदला, फोटो हटाई', r.status === 200 && r.data.price === 26000 && r.data.image === '' && r.data.name === 'Test Ring', r);
  res = await fetch(base + imgPath);
  check('हटाई फोटो -> 404', res.status === 404, res.status);
  r = await call('PUT', '/api/catalog/prd_nahi', { price: 1 });
  check('गलत design -> 404', r.status === 404, r);

  res = await fetch(base + '/api/public/catalog', { headers: { origin: 'https://shreejigold.shop' } });
  check('website के domain से public API खुली (CORS)', res.headers.get('access-control-allow-origin') === 'https://shreejigold.shop', res.headers.get('access-control-allow-origin'));
  res = await fetch(base + '/api/shop/rates', { headers: { origin: 'https://evil.example' } });
  check('admin API बाहरी domain के लिए बंद (CORS)', !res.headers.get('access-control-allow-origin'), res.headers.get('access-control-allow-origin'));

  console.log('\n-- website leads --');
  r = await call('POST', '/api/public/leads', { name: 'Sita', phone: '98765 43210', source: 'enquiry', productId: prdId, message: 'Rate?' }, { noAuth: true });
  check('design से lead आई', r.status === 201 && r.data.ok, r);
  r = await call('POST', '/api/public/leads', { name: 'Sita Devi', phone: '9876543210', source: 'enquiry', productId: prdId, message: 'Kab aayein?' }, { noAuth: true });
  check('उसी नंबर+design की दोबारा enquiry', r.status === 201, r);
  r = await call('POST', '/api/public/leads', { name: 'Ram', phone: '+91 91234-56789', source: 'widget', message: 'Hi' }, { noAuth: true });
  check('widget से lead (+91 के साथ नंबर)', r.status === 201, r);
  r = await call('POST', '/api/public/leads', { name: 'X', phone: '12345' }, { noAuth: true });
  check('गलत मोबाइल -> 400 साफ़ संदेश', r.status === 400 && r.data.details[0].message.includes('mobile'), r);
  r = await call('POST', '/api/public/leads', { name: 'Bot', phone: '9876500000', website: 'spam.example' }, { noAuth: true });
  check('bot (छिपा खाना भरा) चुपचाप अनदेखा', r.status === 201, r);
  r = await call('GET', '/api/leads', undefined, { noAuth: true });
  check('leads बिना login बंद', r.status === 401, r);
  r = await call('GET', '/api/leads');
  check('admin को 2 leads (दोहराई नहीं, bot नहीं)', r.status === 200 && r.data.leads.length === 2 && r.data.counts.new === 2 && r.data.counts.total === 2, r.data);
  const sita = r.data.leads.find((l) => l.phone === '9876543210');
  check('lead: नाम, साफ़ नंबर, design, नया संदेश', sita && sita.name === 'Sita Devi' && sita.productName === 'Test Ring' && sita.message === 'Kab aayein?' && sita.source === 'enquiry', sita);
  check('widget lead का नंबर 10 अंकों में', r.data.leads.some((l) => l.phone === '9123456789' && l.source === 'widget'), r.data.leads);
  r = await call('PUT', '/api/leads/' + sita.id, { status: 'contacted', notes: 'शाम को दुकान आएगी' });
  check('lead status + note', r.status === 200 && r.data.status === 'contacted' && r.data.notes === 'शाम को दुकान आएगी', r);
  r = await call('PUT', '/api/leads/' + sita.id, { status: 'galat' });
  check('गलत status -> 400', r.status === 400, r);
  r = await call('GET', '/api/leads?status=new');
  check('status से filter', r.data.leads.length === 1 && r.data.counts.contacted === 1, r.data);
  r = await call('DELETE', '/api/leads/' + sita.id);
  check('lead हटाई', r.data.deleted, r);
  r = await call('DELETE', '/api/catalog/' + hiddenId);
  check('design हटाया', r.data.deleted, r);

  console.log('\n-- website के पुराने designs --');
  r = await call('POST', '/api/catalog/import-defaults');
  const totalDefaults = r.data.total;
  check('पुराने designs catalog में आए', r.status === 200 && totalDefaults >= 90 && r.data.added === totalDefaults, r.data);
  r = await call('PUT', '/api/catalog/SG0002', { price: 45000 });
  check('पुराने design पर कीमत डाली', r.status === 200 && r.data.price === 45000, r);
  r = await call('DELETE', '/api/catalog/SG0001');
  check('पुराना design भी हट जाता है', r.data.deleted, r);
  r = await call('POST', '/api/catalog/import-defaults');
  check('दोबारा: सिर्फ हटाया हुआ वापस आया', r.data.added === 1 && r.data.alreadyThere === totalDefaults - 1, r.data);
  r = await call('GET', '/api/catalog/');
  check('दोबारा import ने admin की कीमत नहीं मिटाई', r.data.find((p) => p.id === 'SG0002')?.price === 45000, r.data.find((p) => p.id === 'SG0002'));
  r = await call('GET', '/api/public/catalog', undefined, { noAuth: true });
  check('website पर पुराने + नया design, नया सबसे ऊपर', r.data.products.length === totalDefaults + 1 && r.data.products[0].id === prdId, r.data.products.slice(0, 2));
}

console.log('\n-- दुकान के users (staff / admin) --');
{
  const ownerToken = token;
  r = await call('POST', '/api/users', { name: 'Ramesh', userId: 'Ramesh', password: 'staff123', role: 'staff' });
  check('मालिक ने staff user बनाया', r.status === 201 && r.data.userId === 'Ramesh' && r.data.role === 'staff' && !('passHash' in r.data), r);
  const staffId = r.data.id;
  r = await call('POST', '/api/users', { userId: 'ramesh', password: 'other123' });
  check('वही यूज़र ID दोबारा -> 409', r.status === 409, r);
  r = await call('POST', '/api/users', { userId: 'malik@example.com', password: 'other123' });
  check('मालिक वाला यूज़र ID -> 409', r.status === 409, r);
  r = await call('POST', '/api/users', { userId: 'ab', password: 'other123' });
  check('छोटा यूज़र ID -> 400', r.status === 400, r);
  r = await call('POST', '/api/users', { userId: 'naya user', password: 'other123' });
  check('यूज़र ID में space -> 400', r.status === 400, r);

  r = await call('POST', '/api/auth/login', { userId: 'RAMESH', password: 'staff123' }, { noAuth: true });
  check('staff लॉगिन', r.status === 200 && r.data.role === 'staff' && r.data.token, r);
  token = r.data.token;
  r = await call('GET', '/api/auth/me');
  check('staff: me में role staff', r.data.user.role === 'staff' && r.data.user.sub === 'ramesh', r);
  r = await call('GET', '/api/shop/rates'); check('staff rates / बिलिंग का डेटा देख सकता', r.status === 200, r);
  r = await call('GET', '/api/backup'); check('staff ऐप का डेटा लोड कर सकता', r.status === 200, r.status);
  r = await call('GET', '/api/users'); check('staff users नहीं देख सकता -> 403', r.status === 403, r);
  r = await call('POST', '/api/users', { userId: 'hacker', password: 'hack1234' }); check('staff user नहीं बना सकता -> 403', r.status === 403, r);
  r = await call('DELETE', '/api/backup/all'); check('staff सारा डेटा नहीं मिटा सकता -> 403', r.status === 403, r);
  r = await call('PUT', '/api/shop/settings', { shopName: 'X' }); check('staff दुकान की settings नहीं बदल सकता -> 403', r.status === 403, r);
  r = await call('POST', '/api/auth/change-userid', { password: 'staff123', newUserId: 'hacker' });
  check('staff मालिक का यूज़र ID नहीं बदल सकता -> 403', r.status === 403, r);
  r = await call('POST', '/api/auth/change-password', { oldPassword: 'staff123', newPassword: 'staff456' });
  check('staff अपना पासवर्ड बदले — नया token मिले', r.status === 200 && r.data.changed && r.data.token, r);
  const oldStaffToken = token;
  token = r.data.token;
  r = await call('GET', '/api/shop/rates'); check('नए token से चलता', r.status === 200, r);
  token = oldStaffToken;
  r = await call('GET', '/api/shop/rates'); check('पासवर्ड बदलते ही पुराना token बेकार -> 401', r.status === 401, r);

  token = ownerToken;
  r = await call('PUT', '/api/users/' + staffId, { active: false });
  check('मालिक ने staff बंद किया', r.status === 200 && r.data.active === false, r);
  r = await call('POST', '/api/auth/login', { userId: 'ramesh', password: 'staff456' }, { noAuth: true });
  check('बंद staff लॉगिन नहीं कर सकता', r.status === 401 && r.data.error.includes('बंद'), r);
  r = await call('PUT', '/api/users/' + staffId, { active: true, password: 'reset789', role: 'admin', name: 'Ramesh Soni' });
  check('मालिक ने चालू किया + पासवर्ड reset + Admin बनाया', r.status === 200 && r.data.active && r.data.role === 'admin' && r.data.name === 'Ramesh Soni', r);
  r = await call('POST', '/api/auth/login', { userId: 'ramesh', password: 'reset789' }, { noAuth: true });
  check('नए पासवर्ड से लॉगिन (Admin)', r.status === 200 && r.data.role === 'admin', r);
  token = r.data.token;
  r = await call('GET', '/api/users');
  check('Admin users देख सकता (मालिक + 1 user)', r.status === 200 && r.data.users.length === 1 && r.data.owner && r.data.owner.role === 'owner', r.data);
  r = await call('PUT', '/api/users/' + staffId, { active: false });
  check('Admin अपना ही खाता बंद नहीं कर सकता -> 400', r.status === 400, r);
  r = await call('DELETE', '/api/users/' + staffId);
  check('Admin अपना ही खाता नहीं हटा सकता -> 400', r.status === 400, r);

  token = ownerToken;
  r = await call('DELETE', '/api/users/' + staffId);
  check('मालिक ने user हटाया', r.data.deleted, r);
  r = await call('POST', '/api/auth/login', { userId: 'ramesh', password: 'reset789' }, { noAuth: true });
  check('हटाया हुआ user लॉगिन नहीं कर सकता', r.status === 401, r);
  r = await call('GET', '/api/auth/me'); check('मालिक का लॉगिन चलता रहा', r.status === 200 && r.data.user.role === 'owner', r);
}

console.log('\n-- login rate limit --');
{
  let limited = false;
  for (let i = 0; i < 30; i++) {
    const res = await call('POST', '/api/auth/login', { userId: 'malik', password: 'nope' }, { noAuth: true });
    if (res.status === 429) { limited = true; break; }
  }
  check('brute force blocked with 429', limited, 'never hit 429');
}

console.log('\n-- 404 --');
r = await call('GET', '/api/nope'); check('unknown route 404', r.status === 404, r);

console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ====');
server.close();
await mongo.stop();
process.exit(fail ? 1 : 0);

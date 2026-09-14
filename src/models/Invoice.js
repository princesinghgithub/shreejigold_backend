import mongoose from 'mongoose';

const { Schema } = mongoose;

// बिल की एक लाइन. metalVal / making / itemTotal बिल बनते समय ही जम जाते हैं —
// भाव बाद में बदलें तो भी पुराना बिल वैसा ही दिखे.
// strict: false — पुराने backup की किसी लाइन में और field हों तो वो भी बचे रहें.
const invoiceItemSchema = new Schema({
  name: String,
  metal: { type: String, enum: ['Gold', 'Silver'] },
  huid: { type: String, default: '' }, // BIS hallmark का 6 अक्षर वाला HUID
  grossWeight: Number, // ग्राम — नग/धागे समेत
  weight: Number,      // ग्राम — net, इसी पर भाव लगता है
  purity: Number,      // % (91.6 = 22K)
  rate: Number,        // उस दिन का लगा भाव ₹/g (purity समेत)
  makingType: { type: String, enum: ['perg', 'pct', 'flat'] },
  makingRate: Number,  // जो दर डाली थी (11% / ₹350 प्रति ग्राम / सीधी रकम)
  making: Number,      // निकली हुई रकम (दर नहीं)
  hallmark: Number,    // hallmark charge ₹
  metalVal: Number,
  itemTotal: Number,
}, { _id: false, id: false, strict: false });

// बिल का भुगतान — किस तरीके से कितना (नकद / UPI / NEFT / ...)
const paymentSchema = new Schema({
  mode: { type: String, default: 'cash' },
  amount: Number,
  date: String,
  note: { type: String, default: '' },
}, { _id: false, id: false });

// पुराना सोना बदले में
const exchangeSchema = new Schema({
  name: { type: String, default: '' },   // जैसे "पुरानी चूड़ी"
  weight: Number,
  purity: Number,
  deduct: Number,      // % कटौती
  rate: Number,
  value: Number,
}, { _id: false, id: false, strict: false });

const invoiceSchema = new Schema({
  _id: { type: String, required: true },          // inv_xxx
  type: { type: String, enum: ['sale', 'purchase'], default: 'sale' },
  gstMode: { type: String, enum: ['gst', 'nongst'], default: 'gst' },
  barcode: { type: String, required: true },
  // बिल नंबर: series (INV = GST बिक्री, EST = Estimate, PUR = खरीद) + financial year में लगातार गिनती.
  // billNo छपने वाला रूप — "257", "E-12", "P-5". पुराने बिलों में ये नहीं होते.
  series: String,
  fy: String,                                     // "2026-27"
  seq: Number,
  billNo: String,
  date: { type: String, required: true },         // YYYY-MM-DD
  customerId: { type: String, ref: 'Customer', default: null },
  // ग्राहक बाद में बदले/हटे तो भी बिल पर उस दिन का नाम-फ़ोन रहे
  customerName: { type: String, default: 'Walk-in Customer' },
  customerPhone: { type: String, default: '' },
  customerAddress: { type: String, default: '' },
  customerPan: { type: String, default: '' },     // ₹2 लाख से ऊपर के बिल पर
  items: { type: [invoiceItemSchema], default: [] },
  // हर पुराना गहना अलग लाइन में; exchange उन्हीं का जोड़ (पुराने बिलों में सिर्फ exchange है)
  exchangeItems: { type: [exchangeSchema], default: [] },
  exchange: { type: exchangeSchema, default: () => ({}) },
  subtotal: { type: Number, default: 0 },
  making: { type: Number, default: 0 },
  hallmark: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  // 'pct' = प्रतिशत से, 'flat' = रकम सीधे रुपयों में डाली गई (बिल पर वही दिखता है)
  gstType: { type: String, enum: ['pct', 'flat'], default: 'pct' },
  gstValue: { type: Number, default: 0 },   // जो डाला गया था (3 या 1500)
  gstPct: { type: Number, default: 0 },     // हमेशा असली प्रतिशत — रिपोर्ट के लिए
  gst: { type: Number, default: 0 },
  roundOff: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  due: { type: Number, default: 0 },
  payments: { type: [paymentSchema], default: [] },
  createdAt: String,
}, { collection: 'invoices', versionKey: false, id: false, minimize: false });

invoiceSchema.index({ date: -1 });
invoiceSchema.index({ customerId: 1 });
invoiceSchema.index({ barcode: 1 }, { unique: true });
invoiceSchema.index({ billNo: 1 });
// एक साल की एक series में एक नंबर एक ही बार
invoiceSchema.index(
  { series: 1, fy: 1, seq: 1 },
  { unique: true, partialFilterExpression: { seq: { $type: 'number' } } },
);

export const Invoice = mongoose.model('Invoice', invoiceSchema);

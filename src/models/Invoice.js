import mongoose from 'mongoose';

const { Schema } = mongoose;

// बिल की एक लाइन. metalVal / making / itemTotal बिल बनते समय ही जम जाते हैं —
// भाव बाद में बदलें तो भी पुराना बिल वैसा ही दिखे.
// strict: false — पुराने backup की किसी लाइन में और field हों तो वो भी बचे रहें.
const invoiceItemSchema = new Schema({
  name: String,
  metal: { type: String, enum: ['Gold', 'Silver'] },
  weight: Number,      // ग्राम
  purity: Number,      // % (91.6 = 22K)
  makingType: { type: String, enum: ['perg', 'pct', 'flat'] },
  making: Number,      // निकली हुई रकम (दर नहीं)
  metalVal: Number,
  itemTotal: Number,
}, { _id: false, id: false, strict: false });

// पुराना सोना बदले में
const exchangeSchema = new Schema({
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
  date: { type: String, required: true },         // YYYY-MM-DD
  customerId: { type: String, ref: 'Customer', default: null },
  // ग्राहक बाद में बदले/हटे तो भी बिल पर उस दिन का नाम-फ़ोन रहे
  customerName: { type: String, default: 'Walk-in Customer' },
  customerPhone: { type: String, default: '' },
  items: { type: [invoiceItemSchema], default: [] },
  exchange: { type: exchangeSchema, default: () => ({}) },
  subtotal: { type: Number, default: 0 },
  making: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  gstPct: { type: Number, default: 0 },
  gst: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  due: { type: Number, default: 0 },
  createdAt: String,
}, { collection: 'invoices', versionKey: false, id: false, minimize: false });

invoiceSchema.index({ date: -1 });
invoiceSchema.index({ customerId: 1 });
invoiceSchema.index({ barcode: 1 }, { unique: true });

export const Invoice = mongoose.model('Invoice', invoiceSchema);

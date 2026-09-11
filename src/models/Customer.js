import mongoose from 'mongoose';

const { Schema } = mongoose;

// उधारी खाते की एक entry — ग्राहक के दस्तावेज़ के अंदर ही रहती है.
// amount: + = उधारी चढ़ी, − = पैसा जमा हुआ
const ledgerEntrySchema = new Schema({
  id: { type: String, required: true },       // led_xxx
  date: String,                               // YYYY-MM-DD
  note: { type: String, default: '' },
  amount: { type: Number, default: 0 },
  invoiceId: { type: String, default: null }, // किसी बिल से बनी हो तो
  createdAt: String,
}, { _id: false, id: false });

const customerSchema = new Schema({
  _id: { type: String, required: true },      // cust_xxx
  name: String,
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  ledger: { type: [ledgerEntrySchema], default: [] },
  // हमेशा ledger का जोड़ — हाथ से नहीं लिखते (services/customers.js → recalcBalance)
  balance: { type: Number, default: 0 },
  createdAt: String,                          // ISO string, फ्रंटएंड जैसा
}, { collection: 'customers', versionKey: false, id: false });

customerSchema.index({ name: 1 });
customerSchema.index({ phone: 1 });

export const Customer = mongoose.model('Customer', customerSchema);

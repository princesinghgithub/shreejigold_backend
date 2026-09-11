import mongoose from 'mongoose';

const stockSchema = new mongoose.Schema({
  _id: { type: String, required: true },       // stk_xxx
  name: String,
  category: { type: String, default: 'Gold' }, // Gold / Silver
  // छोटे अक्षरों वाला रूप — बिल बनने पर "इसी नाम+धातु का item" index से ढूंढने के लिए
  nameLower: String,
  categoryLower: String,
  purity: { type: String, default: '' },       // "22K", "92.5%"
  weight: { type: Number, default: 0 },        // ग्राम
  qty: { type: Number, default: 0 },
  createdAt: String,
}, { collection: 'stock', versionKey: false, id: false });

stockSchema.index({ category: 1, name: 1 });
stockSchema.index({ nameLower: 1, categoryLower: 1 });

export const Stock = mongoose.model('Stock', stockSchema);

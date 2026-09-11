import mongoose from 'mongoose';

const { Schema } = mongoose;

// बिल नंबर का गिनती-खाता — हर series और financial year का अलग ("INV:2026-27" → 257).
// GST नियम: tax invoice का नंबर लगातार हो और साल भर में दोहराया न जाए. बिल हटे तब भी
// गिनती पीछे नहीं जाती, ताकि वही नंबर दूसरे बिल पर न छपे.
const counterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
}, { collection: 'counters', versionKey: false, id: false });

export const Counter = mongoose.model('Counter', counterSchema);

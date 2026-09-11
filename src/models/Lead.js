import mongoose from 'mongoose';

/** Website से आई enquiry — किसने, कब, किस design के लिए, और दुकान ने आगे क्या किया */
const leadSchema = new mongoose.Schema({
  _id: { type: String, required: true },          // lead_xxx
  name: String,
  phone: String,                                  // 10 अंक, बिना +91
  message: { type: String, default: '' },
  source: { type: String, default: 'website' },   // enquiry (design से) / widget (WhatsApp बटन)
  productId: { type: String, default: null },
  productName: { type: String, default: '' },
  // new = नई, contacted = बात हुई, converted = बिक्री हुई, closed = बंद
  status: { type: String, enum: ['new', 'contacted', 'converted', 'closed'], default: 'new' },
  notes: { type: String, default: '' },           // दुकान की अपनी टिप्पणी
  createdAt: String,
  updatedAt: String,
}, { collection: 'leads', versionKey: false, id: false });

leadSchema.index({ status: 1, createdAt: -1 });
leadSchema.index({ phone: 1, createdAt: -1 });

export const Lead = mongoose.model('Lead', leadSchema);

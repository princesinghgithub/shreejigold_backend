import mongoose from 'mongoose';

const offerSchema = new mongoose.Schema({
  _id: { type: String, required: true },       // off_xxx
  title: String,
  discountPercent: { type: Number, default: 0 },
  startDate: { type: String, default: '' },    // YYYY-MM-DD, खाली = कोई सीमा नहीं
  endDate: { type: String, default: '' },
  description: { type: String, default: '' },
  createdAt: String,
}, { collection: 'offers', versionKey: false, id: false });

offerSchema.index({ startDate: -1 });

export const Offer = mongoose.model('Offer', offerSchema);

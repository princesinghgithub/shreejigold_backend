import mongoose from 'mongoose';

/**
 * Website पर दिखने वाला design. दुकान के stock (Stock model) से अलग है —
 * यहाँ फोटो, कीमत और website के filter वाली जानकारी रहती है.
 */
const productSchema = new mongoose.Schema({
  _id: { type: String, required: true },         // prd_xxx
  name: String,
  type: { type: String, default: '' },           // Rings, Earrings… (website के filter)
  metal: { type: String, default: '' },          // 22K Gold, Diamond…
  wearer: { type: String, default: 'Women' },    // Women / Men / Kids
  occasion: { type: String, default: '' },       // Daily Wear, Wedding…
  price: { type: Number, default: 0 },           // 0 = website पर "आज का रेट पूछें"
  weight: { type: Number, default: 0 },          // ग्राम, सिर्फ जानकारी के लिए
  description: { type: String, default: '' },
  imageUrl: { type: String, default: '' },       // बाहर की फोटो का link
  // अपलोड की हुई फोटो ProductImage में रहती है; यह नंबर हर नई फोटो पर बदलता है
  // ताकि browser पुरानी फोटो cache से न दिखाए
  imageVersion: { type: Number, default: 0 },
  newIn: { type: Boolean, default: false },      // "NEW IN" (isNew नाम Mongoose में मना है)
  bestseller: { type: Boolean, default: false }, // "OUR PICK"
  active: { type: Boolean, default: true },      // false = website पर छिपा
  order: { type: Number, default: 0 },
  createdAt: String,
  updatedAt: String,
}, { collection: 'products', versionKey: false, id: false });

productSchema.index({ active: 1, order: 1, createdAt: -1 });

export const Product = mongoose.model('Product', productSchema);

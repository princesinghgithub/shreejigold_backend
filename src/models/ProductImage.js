import mongoose from 'mongoose';

/** अपलोड की हुई design की फोटो — अलग रखी है ताकि catalog की सूची हल्की रहे */
const productImageSchema = new mongoose.Schema({
  _id: { type: String, required: true },          // वही जो Product का _id
  contentType: { type: String, required: true },  // image/jpeg, image/png, image/webp
  data: { type: Buffer, required: true },
}, { collection: 'product_images', versionKey: false, id: false });

export const ProductImage = mongoose.model('ProductImage', productImageSchema);

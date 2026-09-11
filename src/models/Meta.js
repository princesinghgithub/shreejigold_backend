import mongoose from 'mongoose';

/**
 * key/value जगह — सोने-चांदी का भाव, दुकान की settings, लॉगिन खाता.
 * _id ही key है (META in db/index.js), value कुछ भी हो सकता है.
 */
const metaSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  value: { type: mongoose.Schema.Types.Mixed, default: null },
}, { collection: 'meta', versionKey: false, id: false, minimize: false });

export const Meta = mongoose.model('Meta', metaSchema);

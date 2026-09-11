import mongoose from 'mongoose';

/**
 * अपने आप बनने वाली कॉपी — पूरा डेटा एक दस्तावेज़ में.
 * Vercel पर डिस्क नहीं होती, इसलिए कॉपी डेटाबेस के अंदर ही रहती है.
 */
const backupSchema = new mongoose.Schema({
  _id: { type: String, required: true },       // bak_xxx
  label: { type: String, default: 'manual' },  // manual / auto / ...
  createdAt: { type: String, required: true },
  counts: { type: mongoose.Schema.Types.Mixed, default: {} },
  data: { type: mongoose.Schema.Types.Mixed, default: {} }, // exportAll() वाला shape
}, { collection: 'backups', versionKey: false, id: false, minimize: false });

backupSchema.index({ createdAt: -1 });

export const Backup = mongoose.model('Backup', backupSchema);

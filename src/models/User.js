import mongoose from 'mongoose';

/**
 * दुकान के बाकी users (staff / admin). मालिक का खाता अलग है (meta → account) —
 * वह हमेशा रहता है, इसलिए कोई गलती से सबको बाहर नहीं कर सकता.
 */
const userSchema = new mongoose.Schema({
  _id: { type: String, required: true },          // usr_xxx
  userId: { type: String, required: true },       // छोटे अक्षरों में — लॉगिन इसी से
  userIdDisplay: String,                          // जैसा लिखा गया था
  name: { type: String, default: '' },
  passHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'staff'], default: 'staff' },
  active: { type: Boolean, default: true },
  // पासवर्ड / यूज़र ID बदलने या खाता बंद करने पर बढ़ता है — पुराने लॉगिन (token) उसी पल बेकार
  tokenVersion: { type: Number, default: 0 },
  lastLoginAt: { type: String, default: null },
  // Google Authenticator (सिर्फ admin के लिए) — services/twofa.js. मालिक का meta → account.totp में.
  // { enabled, secret, pendingSecret, lastStep, backupCodes: [sha256], enabledAt }
  totp: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: String,
  updatedAt: String,
}, { collection: 'users', versionKey: false, id: false });

userSchema.index({ userId: 1 }, { unique: true });

export const User = mongoose.model('User', userSchema);

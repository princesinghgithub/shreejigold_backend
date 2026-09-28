import mongoose from 'mongoose';

/**
 * पासवर्ड सही होने के बाद, Authenticator कोड से पहले का 5 मिनट का "आधा लॉगिन".
 * JWT की जगह DB में इसलिए कि गलत कोड की गिनती रखनी है और यह एक ही बार चले —
 * Vercel के हर डिब्बे की अपनी memory होती है, इसलिए memory में नहीं रख सकते.
 * expiresAt बीतते ही MongoDB इसे खुद हटा देता है (TTL index).
 */
const loginChallengeSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  kind: { type: String, enum: ['owner', 'user'], required: true },
  subjectId: { type: String, default: null }, // user का _id (मालिक के लिए null)
  tv: { type: Number, default: 0 },           // उस समय का tokenVersion — बीच में पासवर्ड बदला तो रद्द
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
}, { collection: 'login_challenges', versionKey: false, id: false });

loginChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LoginChallenge = mongoose.model('LoginChallenge', loginChallengeSchema);

// फ्रंटएंड (src/lib/format.js) जैसे ही id / barcode / date helpers —
// ताकि backend और localStorage दोनों का data एक जैसा दिखे.

export function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function genBarcode() {
  let code = '';
  for (let i = 0; i < 12; i++) code += Math.floor(Math.random() * 10);
  return code;
}

// दुकान भारत में है और सर्वर (Vercel) UTC पर चलता है. UTC की तारीख लेते तो रात 12 से
// सुबह 5:30 तक बने बिल पिछले दिन में चले जाते — इसलिए तारीख हमेशा IST से.
export function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function daysAgo(n) {
  const d = new Date(todayStr() + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** खोज का text regex में सादा text बने — "+91" या "(" से query न टूटे */
export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "2026-09-11" → "2026-27" (अप्रैल से मार्च) */
export function fyOf(date) {
  const y = Number(String(date).slice(0, 4));
  const m = Number(String(date).slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** बिल पर छपा नंबर — पुराने बिलों में billNo नहीं, तब id के आखिरी 6 अक्षर */
export function billNoOf(inv) {
  return inv.billNo || String(inv.id || inv._id || '').slice(-6).toUpperCase();
}

export function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

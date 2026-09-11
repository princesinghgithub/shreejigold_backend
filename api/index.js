// Vercel Functions की entry — हर request यहीं आती है.
// Express ऐप को ज्यों का त्यों handler की तरह इस्तेमाल कर लेते हैं.
// ऐप एक ही बार बनता है और गर्म डिब्बे में दोबारा इस्तेमाल होता है
// (DB कनेक्शन भी — src/db/index.js देखें).
import { createApp } from '../src/app.js';

const app = createApp();

export default function handler(req, res) {
  return app(req, res);
}

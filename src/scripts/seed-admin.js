// ऐप का लॉगिन खाता बनाने/बदलने के लिए:  npm run seed:admin
// यूज़र ID और पासवर्ड .env से आते हैं (ADMIN_USER_ID, ADMIN_PASSWORD). .env git में नहीं
// जाती, इसलिए पासवर्ड कोड में नहीं लिखा. ग्राहक, बिल, स्टॉक — कोई डेटा नहीं मिटता.
import { seedAccount } from '../services/auth.js';
import { connectDB, closeDb } from '../db/index.js';

const userId = process.env.ADMIN_USER_ID;
const password = process.env.ADMIN_PASSWORD;
if (!userId || !password) {
  console.error('.env में ADMIN_USER_ID और ADMIN_PASSWORD डालें, फिर दोबारा चलाएं');
  process.exit(1);
}

await connectDB();
try {
  const r = await seedAccount(userId, password);
  console.log((r.created ? 'खाता बन गया ✔' : 'खाता अपडेट हो गया ✔') + '  यूज़र ID: ' + r.userId);
  if (!r.hasSecurityQuestion) {
    console.log('ऐप में लॉगिन करके सुरक्षा सवाल सेट कर लें — पासवर्ड भूलने पर वही काम आएगा');
  }
} catch (e) {
  console.error('खाता नहीं बन सका: ' + e.message);
  process.exitCode = 1;
}
await closeDb();

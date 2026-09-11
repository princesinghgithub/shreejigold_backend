// यूज़र ID या पासवर्ड भूल जाने पर (डेटा नहीं मिटेगा):  npm run reset-password
// इसके बाद ऐप खोलकर नया यूज़र ID, पासवर्ड और सुरक्षा सवाल सेट करना होगा.
import { resetAccount } from '../services/auth.js';
import { connectDB, closeDb } from '../db/index.js';

await connectDB();

await resetAccount();
console.log('खाता हटा दिया गया ✔  अब ऐप खोलकर नया यूज़र ID और पासवर्ड बनाएं।');
console.log('ग्राहक, बिल, स्टॉक — कोई डेटा नहीं मिटा।');
await closeDb();

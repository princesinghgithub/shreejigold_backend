// फ़ोन खो गया और backup codes भी नहीं मिल रहे — Google Authenticator हटाने के लिए:
//   npm run reset-2fa                 मालिक का
//   npm run reset-2fa -- <यूज़र ID>    किसी Admin का (वैसे यह अंदर "Users / Staff" पेज से भी होता है)
// अगले लॉगिन पर नया QR आएगा — नए फ़ोन से scan करें. उस खाते के बाकी सब लॉगिन भी बंद हो जाते हैं.
// ग्राहक, बिल, स्टॉक — कोई डेटा नहीं मिटता.
import { getAccount, norm } from '../services/auth.js';
import { ownerSubject, userSubject, reset } from '../services/twofa.js';
import { connectDB, closeDb, setMeta, META } from '../db/index.js';
import { User } from '../models/index.js';

const userId = process.argv[2];

await connectDB();
try {
  if (!userId) {
    const acc = await getAccount();
    if (!acc) throw new Error('मालिक का खाता नहीं मिला — पहले npm run seed:admin चलाएं');
    await reset(ownerSubject);
    // फ़ोन पर खुला लॉगिन भी बंद
    await setMeta(META.ACCOUNT, { ...(await getAccount()), tv: (acc.tv || 0) + 1 });
    console.log(`मालिक (${acc.userIdDisplay}) का Google Authenticator हटा दिया ✔`);
  } else {
    const u = await User.findOne({ userId: norm(userId) }).lean();
    if (!u) throw new Error(`"${userId}" यूज़र ID नहीं मिला`);
    await reset(userSubject(u._id));
    await User.updateOne({ _id: u._id }, { $inc: { tokenVersion: 1 } });
    console.log(`${u.userIdDisplay} का Google Authenticator हटा दिया ✔`);
  }
  console.log('अगले लॉगिन पर नया QR आएगा — नए फ़ोन से scan करें।');
} catch (e) {
  console.error('नहीं हो सका: ' + e.message);
  process.exitCode = 1;
}
await closeDb();

// ऐप का लॉगिन खाता (मालिक) बनाने/बदलने के लिए:
//   npm run seed:admin -- <यूज़र ID>    पासवर्ड टर्मिनल में पूछा जाएगा (टाइप करते समय दिखेगा नहीं)
//   npm run seed:admin                 पुराना तरीका — यूज़र ID और पासवर्ड .env से (ADMIN_USER_ID, ADMIN_PASSWORD)
// ग्राहक, बिल, स्टॉक — कोई डेटा नहीं मिटता. पासवर्ड बदलते ही मालिक के पुराने सब लॉगिन बंद हो जाते हैं.
// यूज़र ID बदलकर किसी दूसरे व्यक्ति को मालिक बनाया तो पुराना Google Authenticator भी हट जाता है —
// नया मालिक अगले लॉगिन पर अपने फ़ोन से QR scan करेगा.
import readline from 'node:readline';
import { seedAccount, getAccount, norm, MIN_PASSWORD } from '../services/auth.js';
import { ownerSubject, reset } from '../services/twofa.js';
import { connectDB, closeDb } from '../db/index.js';

// एक ही readline पूरी script के लिए — हर सवाल पर नया बनाएं तो पहला वाला आगे की लाइनें भी खा जाता है
let rl;
const pending = [];
const waiting = [];

function askHidden(question) {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
    rl._writeToOutput = () => {}; // टाइप किए अक्षर स्क्रीन पर न दिखें
    rl.on('line', (line) => (waiting.length ? waiting.shift()(line) : pending.push(line)));
  }
  process.stdout.write(question);
  return new Promise((resolve) => {
    const done = (line) => { process.stdout.write('\n'); resolve(line); };
    if (pending.length) done(pending.shift());
    else waiting.push(done);
  });
}

async function readPassword() {
  const pw = (await askHidden('नया पासवर्ड: ')).trim();
  if (pw.length < MIN_PASSWORD) throw new Error(`पासवर्ड कम से कम ${MIN_PASSWORD} अक्षर का रखें`);
  const again = (await askHidden('दोबारा डालें: ')).trim();
  if (pw !== again) throw new Error('दोनों पासवर्ड एक जैसे नहीं हैं');
  return pw;
}

const argUserId = process.argv[2];
const userId = argUserId || process.env.ADMIN_USER_ID;
if (!userId) {
  console.error('यूज़र ID दें:  npm run seed:admin -- <यूज़र ID>   (या .env में ADMIN_USER_ID और ADMIN_PASSWORD)');
  process.exit(1);
}
if (!argUserId && !process.env.ADMIN_PASSWORD) {
  console.error('.env में ADMIN_PASSWORD नहीं है — या चलाएं:  npm run seed:admin -- <यूज़र ID>');
  process.exit(1);
}

try {
  const password = argUserId ? await readPassword() : process.env.ADMIN_PASSWORD;
  rl?.close();

  await connectDB();
  const before = await getAccount();
  const r = await seedAccount(userId, password);
  console.log((r.created ? 'खाता बन गया ✔' : 'खाता अपडेट हो गया ✔') + '  यूज़र ID: ' + r.userId);

  if (before && before.userId !== norm(userId) && before.totp) {
    await reset(ownerSubject);
    console.log('पुराने मालिक का Google Authenticator हटा दिया — अगले लॉगिन पर नए फ़ोन से QR scan करें');
  }
  if (!r.hasSecurityQuestion) {
    console.log('ऐप में लॉगिन करके सुरक्षा सवाल सेट कर लें — पासवर्ड भूलने पर वही काम आएगा');
  }
} catch (e) {
  rl?.close();
  console.error('खाता नहीं बन सका: ' + e.message);
  process.exitCode = 1;
}
await closeDb();

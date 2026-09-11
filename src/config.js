import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

function bool(v, fallback) {
  if (v === undefined) return fallback;
  return v === '1' || String(v).toLowerCase() === 'true';
}

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'soniji-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // MongoDB Atlas का पता. .env में MONGODB_URI ज़रूर डालें.
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
  // खाली छोड़ें तो URI में लिखा database नाम ही चलेगा (…mongodb.net/shreeji_gold)
  mongoDb: process.env.MONGODB_DB || '',
  // serverless में हर डिब्बे को थोड़े ही कनेक्शन चाहिए
  mongoPoolSize: Number(process.env.MONGODB_POOL || 5),
  // रोज़ का अपने आप backup चलाने के लिए गुप्त key (Vercel Cron इसे भेजेगा)
  cronSecret: process.env.CRON_SECRET || '',
  // बना हुआ फ्रंटएंड — मिला तो सर्वर खुद ऐप भी खोल देगा (एक ही पता, कोई CORS नहीं)
  webDir: path.resolve(ROOT, process.env.WEB_DIR || '../soni-ji-react/dist'),
  // दुकान के अपने नेटवर्क (192.168.x, 10.x) से आने वाले पते अपने आप allow —
  // वरना मोबाइल से खोलने पर हर बार CORS_ORIGIN बदलना पड़ता
  corsAllowLan: bool(process.env.CORS_ALLOW_LAN, true),
  logRequests: bool(process.env.LOG_REQUESTS, true),
  isProd: process.env.NODE_ENV === 'production',
  // रोज़ाना .db फाइल की कॉपी बनती रहे, और कितनी पुरानी कॉपियाँ रखें
  autoBackup: bool(process.env.AUTO_BACKUP, true),
  backupKeep: Number(process.env.BACKUP_KEEP || 30),
  // लॉगिन पर कितनी गलत कोशिशें, कितने मिनट में
  loginMaxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS || 20),
  loginWindowMinutes: Number(process.env.LOGIN_WINDOW_MINUTES || 15),
  // पासवर्ड भूलने पर OTP वाला email. BREVO_API_KEY हो तो Brevo, वरना SMTP (Gmail).
  mail: {
    brevoApiKey: (process.env.BREVO_API_KEY || '').trim(),
    // Brevo में यह email "Senders" में verify होना चाहिए
    fromEmail: process.env.MAIL_FROM_EMAIL || process.env.SMTP_USER || '',
    fromName: process.env.MAIL_FROM_NAME || 'Shreeji Gold',
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER || '',
    // Gmail का "App Password" (16 अक्षर — बीच की जगहें अपने आप हट जाती हैं)
    pass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
    transport: process.env.MAIL_TRANSPORT || '',
  },
};

if (config.isProd && config.mongoUri.includes('127.0.0.1')) {
  throw new Error('MONGODB_URI .env में सेट करना ज़रूरी है (production में localhost नहीं चलेगा)');
}

if (config.isProd && config.jwtSecret === 'soniji-dev-secret-change-me') {
  throw new Error('JWT_SECRET .env में सेट करना ज़रूरी है (production में default secret नहीं चलेगा)');
}

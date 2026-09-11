import mongoose from 'mongoose';
import { config } from '../config.js';
import * as models from '../models/index.js';

const { Meta } = models;

/**
 * MongoDB कनेक्शन (Mongoose). हर collection का model src/models/ में है.
 *
 * Vercel जैसी serverless जगह पर हर request एक नए डिब्बे में चलती है, पर डिब्बा
 * कुछ देर गर्म रहता है. इसलिए कनेक्शन global में रखते हैं — वरना हर बिल पर नया
 * कनेक्शन बनता और Atlas का कनेक्शन कोटा जल्दी भर जाता.
 */
const globalForMongo = globalThis;

async function connect() {
  await mongoose.connect(config.mongoUri, {
    // नाम न दिया हो तो URI में लिखा database काम आता है
    dbName: config.mongoDb || undefined,
    maxPoolSize: config.mongoPoolSize,
    serverSelectionTimeoutMS: 10000,
    // index नीचे खुद बनाते हैं, ताकि पहली request से पहले तैयार रहें
    // (खासकर barcode वाला unique index)
    autoIndex: false,
  });
  await Promise.all(Object.values(models).map((m) => m.createIndexes()));
  return mongoose.connection;
}

/** कनेक्शन बनाएं, या पहले से बना हुआ लौटा दें */
export function connectDB() {
  if (!globalForMongo.__soniji_mongo) {
    globalForMongo.__soniji_mongo = connect().catch((err) => {
      // न जुड़ पाए तो अगली request फिर से कोशिश करे
      globalForMongo.__soniji_mongo = null;
      throw err;
    });
  }
  return globalForMongo.__soniji_mongo;
}

/** सर्वर बंद करते समय */
export async function closeDb() {
  const pending = globalForMongo.__soniji_mongo;
  if (!pending) return;
  globalForMongo.__soniji_mongo = null;
  try {
    await pending;
    await mongoose.disconnect();
  } catch { /* बंद ही करना था */ }
}

// ---------------- meta (key/value) ----------------

export async function getMeta(key, fallback = null) {
  const row = await Meta.findById(key).lean();
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  await Meta.updateOne({ _id: key }, { $set: { value } }, { upsert: true });
  return value;
}

export async function deleteMeta(key) {
  await Meta.deleteOne({ _id: key });
}

/**
 * कई लिखाइयाँ एक साथ — या सब हों या कोई नहीं.
 * Atlas (replica set) पर असली transaction चलता है. सादे mongod पर transaction
 * नहीं होता, तो वहाँ बिना transaction के चला लेते हैं ताकि dev में भी काम चले.
 */
export async function tx(fn) {
  await connectDB();
  const session = await mongoose.startSession();
  try {
    let out;
    await session.withTransaction(async () => { out = await fn(session); });
    return out;
  } catch (err) {
    const msg = String(err?.message || '');
    const unsupported = err?.code === 20 || /Transaction|replica set|not supported/i.test(msg);
    if (!unsupported) throw err;
    return fn(null);
  } finally {
    await session.endSession();
  }
}

export const META = {
  RATES: 'rates',
  SETTINGS: 'settings',
  PASSWORD: 'password_hash', // पुराना — सिर्फ migration के लिए
  ACCOUNT: 'account',        // यूज़र ID + पासवर्ड hash + सुरक्षा सवाल
  RESET: 'password_reset',   // पासवर्ड भूलने पर भेजा गया OTP (hash) + समय-सीमा
};

export const DEFAULT_SETTINGS = {
  gst: 3,
  shopName: 'Shreeji Gold',
  shopNameHindi: 'श्री जी आभूषण भण्डार',
  logoUrl: '/shreeji.png',
  nameSuffix: '',
  blessing: '॥ श्री हरि कृपा ॥',
  tagline: 'शुद्ध सोने एवं चांदी के आभूषणों के निर्माता एवं विक्रेता',
  propName: 'प्रो. धीरेन्द्र सोनी',
  shopAddress: 'शाहपुर रोड, शांति नगर, खतखरी, तिवारी होटल के बगल में',
  shopPhone: '9131154535',
  shopPhone2: '7049749596',
  gstin: '23KNFPS7175N1Z2',
  jurisdiction: 'Mauganj',
  categories: 'GOLD | DIAMOND | SILVER | GEMS | GOLD LOAN',
  hsn: '7113',
  hallmarkLabel: 'Hallmark',
  footerNote: 'जेवर टूटने की कोई भी गारंटी नहीं होगी।',
  billTemplate: 'slip',
  // दुकान की website — भरा हो तो बिल पर QR छपता है, जिसे स्कैन करके ग्राहक बिल जाँच सके
  websiteUrl: '',
  // दुकान का UPI — भरा हो तो हर बिल पर "UPI से भुगतान" वाला QR छपता है
  upiId: 'dhirendrasoni1292@okicici',
  upiName: 'Dhirendra Soni',
};

export const DEFAULT_RATES = { gold: 0, silver: 0, updatedAt: null };

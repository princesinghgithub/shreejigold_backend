import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getMeta, setMeta, deleteMeta, META } from '../db/index.js';
import { User } from '../models/index.js';
import { config } from '../config.js';
import { badRequest, conflict, unauthorized, notFound } from '../lib/errors.js';
import { sendMail } from './mailer.js';

export const MIN_USERID = 3;
export const MIN_PASSWORD = 4; // फ्रंटएंड जैसा ही नियम

export const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * मालिक का खाता: { userId, userIdDisplay, passHash, question, answerHash }
 * (दुकान के बाकी users — staff / admin — users collection में हैं, services/users.js)
 * पुराना version सिर्फ पासवर्ड रखता था — उसे पढ़ते ही नए रूप में बदल देते हैं,
 * ताकि किसी का चालू पासवर्ड बेकार न हो जाए.
 */
export async function getAccount() {
  const acc = await getMeta(META.ACCOUNT);
  if (acc) return acc;

  const oldHash = await getMeta(META.PASSWORD);
  if (oldHash) {
    const migrated = {
      userId: 'admin',
      userIdDisplay: 'admin',
      passHash: oldHash,
      question: '',
      answerHash: '',
      createdAt: new Date().toISOString(),
      migrated: true,
    };
    await setMeta(META.ACCOUNT, migrated);
    await deleteMeta(META.PASSWORD);
    return migrated;
  }
  return null;
}

export async function isSetupDone() {
  return Boolean(await getAccount());
}

function signToken(acc) {
  return jwt.sign({ sub: acc.userId, name: acc.userIdDisplay, role: 'owner' }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

// staff / admin का token — tv (tokenVersion) बदलते ही पुराना token बेकार
function signUserToken(u) {
  return jwt.sign(
    { sub: u.userId, name: u.name || u.userIdDisplay, role: u.role, uid: u._id, tv: u.tokenVersion || 0 },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );
}

export function checkUserId(userId) {
  const id = String(userId || '').trim();
  if (id.length < MIN_USERID) throw badRequest(`यूज़र ID कम से कम ${MIN_USERID} अक्षर का रखें`);
  if (/\s/.test(id)) throw badRequest('यूज़र ID में जगह (space) नहीं होनी चाहिए');
  return id;
}

export function checkPassword(password) {
  const pw = String(password || '').trim();
  if (pw.length < MIN_PASSWORD) throw badRequest(`पासवर्ड कम से कम ${MIN_PASSWORD} अक्षर का रखें`);
  return pw;
}

/**
 * पासवर्ड भूलने वाले रास्ते (सुरक्षा सवाल / OTP) सिर्फ मालिक के खाते के लिए हैं.
 * staff का यूज़र ID डाला हो तो साफ़ बताएं कि उनका पासवर्ड मालिक / Admin बदलेंगे.
 */
async function notOwnerError(userId) {
  const isStaff = await User.exists({ userId: norm(userId) });
  return isStaff
    ? badRequest('Staff का पासवर्ड मालिक या Admin ही बदल सकते हैं — उनसे "Users / Staff" पेज से नया पासवर्ड बनवाएं')
    : notFound('यह यूज़र ID नहीं मिला');
}

/** पहली बार — यूज़र ID, पासवर्ड और सुरक्षा सवाल एक साथ */
export async function setup({ userId, password, question, answer }) {
  if (await isSetupDone()) throw badRequest('खाता पहले से बना है — लॉगिन करें');
  const id = checkUserId(userId);
  const pw = checkPassword(password);
  const q = String(question || '').trim();
  const a = String(answer || '').trim();
  if (!q) throw badRequest('सुरक्षा सवाल चुनें — पासवर्ड भूलने पर यही काम आएगा');
  if (!a) throw badRequest('सुरक्षा सवाल का जवाब लिखें');

  const acc = {
    userId: norm(id),
    userIdDisplay: id,
    passHash: bcrypt.hashSync(pw, 10),
    question: q,
    answerHash: bcrypt.hashSync(norm(a), 10),
    createdAt: new Date().toISOString(),
  };
  await setMeta(META.ACCOUNT, acc);
  return { token: signToken(acc), userId: acc.userIdDisplay, role: 'owner', firstTime: true };
}

/** मालिक या दुकान का कोई user (staff / admin) — दोनों यहीं से लॉगिन करते हैं */
export async function login(userId, password) {
  const acc = await getAccount();
  const id = norm(userId);
  const pw = String(password || '').trim();

  if (acc && id === acc.userId) {
    // कौन सा गलत है यह नहीं बताते, वरना यूज़र ID अंदाज़ना आसान हो जाता है
    if (!bcrypt.compareSync(pw, acc.passHash)) throw unauthorized('यूज़र ID या पासवर्ड गलत है');
    return { token: signToken(acc), userId: acc.userIdDisplay, role: 'owner', firstTime: false };
  }

  const u = await User.findOne({ userId: id }).lean();
  if (u && bcrypt.compareSync(pw, u.passHash)) {
    if (u.active === false) throw unauthorized('यह खाता बंद कर दिया गया है — मालिक या Admin से बात करें');
    await User.updateOne({ _id: u._id }, { $set: { lastLoginAt: new Date().toISOString() } });
    return { token: signUserToken(u), userId: u.userIdDisplay, name: u.name, role: u.role, firstTime: false };
  }

  if (!acc) throw badRequest('अभी कोई खाता नहीं है — पहले /api/auth/setup से बनाएं');
  throw unauthorized('यूज़र ID या पासवर्ड गलत है');
}

/**
 * token वाले user की ताज़ा जानकारी — हर protected request पर (middleware/auth.js).
 * staff बंद / हटाया गया हो, या उसका पासवर्ड / यूज़र ID बदला हो, तो पुराना token यहीं रुकता है.
 */
export async function currentUser(payload) {
  if (!payload || payload.role === 'owner') {
    const acc = await getAccount();
    if (!acc || !payload || acc.userId !== payload.sub) throw unauthorized('दोबारा लॉगिन करें');
    return { sub: acc.userId, name: acc.userIdDisplay, role: 'owner' };
  }
  const u = payload.uid ? await User.findById(payload.uid).lean() : null;
  if (!u || u.active === false || (u.tokenVersion || 0) !== (payload.tv || 0)) {
    throw unauthorized('दोबारा लॉगिन करें — आपका खाता बदला या बंद किया गया है');
  }
  return { sub: u.userId, name: u.name || u.userIdDisplay, role: u.role, uid: u._id };
}

/** पासवर्ड भूलने का पहला कदम — इस यूज़र ID का सुरक्षा सवाल */
export async function getQuestion(userId) {
  const acc = await getAccount();
  if (!acc || norm(userId) !== acc.userId) throw await notOwnerError(userId);
  if (!acc.question) {
    throw badRequest('इस खाते पर सुरक्षा सवाल सेट नहीं है — लॉगिन करके सेट करें, या npm run reset-password चलाएं');
  }
  return { userId: acc.userIdDisplay, question: acc.question };
}

/** सही जवाब देने पर नया पासवर्ड. डेटा कुछ नहीं मिटता. */
export async function resetWithAnswer(userId, answer, newPassword) {
  const acc = await getAccount();
  if (!acc || norm(userId) !== acc.userId) throw await notOwnerError(userId);
  if (!acc.question) throw badRequest('इस खाते पर सुरक्षा सवाल सेट नहीं है');
  if (!bcrypt.compareSync(norm(answer), acc.answerHash)) throw unauthorized('जवाब गलत है');

  const pw = checkPassword(newPassword);
  await setMeta(META.ACCOUNT, { ...acc, passHash: bcrypt.hashSync(pw, 10) });
  return { reset: true };
}

/**
 * अपना पासवर्ड बदलना. user = लॉगिन वाला (req.user).
 * staff / admin का पासवर्ड बदलते ही उनके बाकी लॉगिन बंद होते हैं — इसलिए नया token लौटाते हैं.
 */
export async function changePassword(oldPassword, newPassword, user = null) {
  if (user && user.role !== 'owner') {
    const u = await User.findById(user.uid).lean();
    if (!u) throw notFound('खाता नहीं मिला');
    if (!bcrypt.compareSync(String(oldPassword || '').trim(), u.passHash)) {
      throw unauthorized('पुराना पासवर्ड गलत है');
    }
    const pw = checkPassword(newPassword);
    const saved = await User.findOneAndUpdate(
      { _id: u._id },
      { $set: { passHash: bcrypt.hashSync(pw, 10), updatedAt: new Date().toISOString() }, $inc: { tokenVersion: 1 } },
      { returnDocument: 'after' },
    ).lean();
    return { changed: true, token: signUserToken(saved) };
  }

  const acc = await getAccount();
  if (!acc) throw badRequest('अभी कोई खाता नहीं है');
  if (!bcrypt.compareSync(String(oldPassword || '').trim(), acc.passHash)) {
    throw unauthorized('पुराना पासवर्ड गलत है');
  }
  const pw = checkPassword(newPassword);
  await setMeta(META.ACCOUNT, { ...acc, passHash: bcrypt.hashSync(pw, 10) });
  return { changed: true };
}

export async function changeUserId(password, newUserId) {
  const acc = await getAccount();
  if (!acc) throw badRequest('अभी कोई खाता नहीं है');
  if (!bcrypt.compareSync(String(password || '').trim(), acc.passHash)) {
    throw unauthorized('पासवर्ड गलत है');
  }
  const id = checkUserId(newUserId);
  if (norm(id) !== acc.userId && await User.exists({ userId: norm(id) })) {
    throw conflict('यह यूज़र ID दुकान के किसी user का है — कोई दूसरा चुनें');
  }
  const next = { ...acc, userId: norm(id), userIdDisplay: id };
  await setMeta(META.ACCOUNT, next);
  // यूज़र ID टोकन में भी है, इसलिए नया टोकन वापस भेजते हैं
  return { userId: next.userIdDisplay, token: signToken(next) };
}

export async function setSecurityQuestion(password, question, answer) {
  const acc = await getAccount();
  if (!acc) throw badRequest('अभी कोई खाता नहीं है');
  if (!bcrypt.compareSync(String(password || '').trim(), acc.passHash)) {
    throw unauthorized('पासवर्ड गलत है');
  }
  const q = String(question || '').trim();
  const a = String(answer || '').trim();
  if (!q) throw badRequest('सवाल लिखें');
  if (!a) throw badRequest('जवाब लिखें');
  await setMeta(META.ACCOUNT, {
    ...acc, question: q, answerHash: bcrypt.hashSync(norm(a), 10), migrated: false,
  });
  return { set: true };
}

// ---------------- पासवर्ड भूले — email पर OTP ----------------

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 60;

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));

/** "princepatel6503@gmail.com" -> "pr*************@gmail.com" */
function maskEmail(email) {
  const [name, domain] = email.split('@');
  return name.slice(0, 2) + '*'.repeat(Math.max(1, name.length - 2)) + '@' + domain;
}

/**
 * यूज़र ID ही email हो तो उसी पते पर 6 अंकों का OTP भेजें.
 * DB में OTP का सिर्फ hash रहता है — 10 मिनट चलता है, 1 मिनट से पहले दोबारा नहीं भेजा जाता.
 */
export async function sendResetOtp(userId) {
  const acc = await getAccount();
  if (!acc || norm(userId) !== acc.userId) throw await notOwnerError(userId);
  if (!isEmail(acc.userId)) {
    throw badRequest('इस यूज़र ID में email नहीं है — सुरक्षा सवाल से पासवर्ड बदलें');
  }

  const prev = await getMeta(META.RESET);
  const wait = prev ? Math.ceil((prev.sentAt + OTP_RESEND_SECONDS * 1000 - Date.now()) / 1000) : 0;
  if (wait > 0) throw badRequest(`OTP अभी भेजा है — ${wait} सेकंड बाद दोबारा मँगाएं`);

  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const now = Date.now();
  await setMeta(META.RESET, {
    otpHash: bcrypt.hashSync(otp, 10),
    sentAt: now,
    expiresAt: now + OTP_TTL_MINUTES * 60 * 1000,
    attempts: 0,
  });

  try {
    await sendMail({
      to: acc.userId,
      subject: 'Shreeji Gold — पासवर्ड बदलने का OTP',
      text: 'नमस्ते,\n\n'
        + 'Shreeji Gold बिलिंग ऐप का पासवर्ड बदलने के लिए आपका OTP है: ' + otp + '\n\n'
        + `यह ${OTP_TTL_MINUTES} मिनट तक चलेगा. यह OTP किसी को भी न बताएं.\n`
        + 'अगर आपने पासवर्ड बदलने को नहीं कहा, तो इस मेल को अनदेखा करें — कुछ नहीं बदलेगा.',
      html: '<div style="font-family:Arial,sans-serif;font-size:15px;color:#333">'
        + '<p>नमस्ते,</p>'
        + '<p>Shreeji Gold बिलिंग ऐप का पासवर्ड बदलने के लिए आपका OTP:</p>'
        + '<p style="font-size:30px;font-weight:bold;letter-spacing:6px;color:#5a1a1a">' + otp + '</p>'
        + `<p>यह ${OTP_TTL_MINUTES} मिनट तक चलेगा. यह OTP किसी को भी न बताएं.</p>`
        + '<p style="color:#888;font-size:13px">अगर आपने पासवर्ड बदलने को नहीं कहा, तो इस मेल को अनदेखा करें — कुछ नहीं बदलेगा.</p>'
        + '</div>',
    });
  } catch (err) {
    // मेल नहीं गया तो OTP भी न बचे — वरना 1 मिनट तक दोबारा मँगा भी न सकें
    await deleteMeta(META.RESET);
    throw err;
  }

  return { sent: true, to: maskEmail(acc.userId), expiresInMinutes: OTP_TTL_MINUTES };
}

/** सही OTP पर नया पासवर्ड. एक OTP एक ही बार चलता है. डेटा कुछ नहीं मिटता. */
export async function resetWithOtp(userId, otp, newPassword) {
  const acc = await getAccount();
  if (!acc || norm(userId) !== acc.userId) throw await notOwnerError(userId);

  const r = await getMeta(META.RESET);
  if (!r) throw badRequest('पहले Email पर OTP मँगाएं');
  if (Date.now() > r.expiresAt) {
    await deleteMeta(META.RESET);
    throw badRequest('OTP की समय-सीमा खत्म हो गई — नया OTP मँगाएं');
  }

  const pw = checkPassword(newPassword);
  if (!bcrypt.compareSync(String(otp || '').trim(), r.otpHash)) {
    const attempts = (r.attempts || 0) + 1;
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await deleteMeta(META.RESET);
      throw unauthorized('OTP गलत है — बहुत कोशिशें हो गईं, नया OTP मँगाएं');
    }
    await setMeta(META.RESET, { ...r, attempts });
    throw unauthorized(`OTP गलत है — ${OTP_MAX_ATTEMPTS - attempts} कोशिश बाकी`);
  }

  await deleteMeta(META.RESET);
  await setMeta(META.ACCOUNT, { ...acc, passHash: bcrypt.hashSync(pw, 10) });
  return { reset: true };
}

/**
 * पूरा खाता हटाना — सिर्फ टर्मिनल से (npm run reset-password).
 * डेटा नहीं मिटता; अगली बार ऐप खोलकर नया खाता बनाना होगा.
 */
export async function resetAccount() {
  await deleteMeta(META.ACCOUNT);
  await deleteMeta(META.PASSWORD);
  await deleteMeta(META.RESET);
  return { reset: true };
}

/**
 * टर्मिनल से खाता बनाना/बदलना (npm run seed:admin) — यूज़र ID और पासवर्ड .env से.
 * खाता पहले से हो तो उसका सुरक्षा सवाल बना रहता है, बस ID और पासवर्ड बदलते हैं.
 */
export async function seedAccount(userId, password) {
  const id = checkUserId(userId);
  const pw = checkPassword(password);
  const existing = await getAccount();
  const acc = {
    question: '',
    answerHash: '',
    ...existing,
    userId: norm(id),
    userIdDisplay: id,
    passHash: bcrypt.hashSync(pw, 10),
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  await setMeta(META.ACCOUNT, acc);
  return { userId: acc.userIdDisplay, created: !existing, hasSecurityQuestion: Boolean(acc.question) };
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    throw unauthorized('टोकन अमान्य या expire हो गया — दोबारा लॉगिन करें');
  }
}

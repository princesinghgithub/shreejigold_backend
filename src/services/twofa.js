import crypto from 'node:crypto';
import { Meta, User, LoginChallenge } from '../models/index.js';
import { META } from '../db/index.js';
import * as totp from '../lib/totp.js';
import { ApiError, badRequest } from '../lib/errors.js';

/**
 * मालिक और Admin का दूसरा ताला — Google Authenticator (6 अंकों का कोड) + backup codes.
 * Staff पर नहीं — counter पर हर बार फ़ोन निकालना मुश्किल, और उनका पासवर्ड मालिक/Admin बदल सकते हैं.
 *
 * subject = { kind: 'owner' } या { kind: 'user', id }
 * मालिक का डेटा meta → account.totp में, admin का users.totp में — दोनों का आकार एक जैसा:
 *   { enabled, secret, pendingSecret, lastStep, backupCodes: [sha256], enabledAt }
 */

export const ISSUER = 'Shreeji Gold';
const CHALLENGE_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const BACKUP_COUNT = 10;
const BACKUP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O, 1/I जैसे उलझाने वाले अक्षर नहीं

export const ownerSubject = { kind: 'owner' };
export const userSubject = (id) => ({ kind: 'user', id });

function target(subject) {
  return subject.kind === 'owner'
    ? { Model: Meta, filter: { _id: META.ACCOUNT }, path: 'value.totp' }
    : { Model: User, filter: { _id: subject.id }, path: 'totp' };
}

export async function getTotp(subject) {
  const { Model, filter } = target(subject);
  const doc = await Model.findOne(filter).lean();
  return (subject.kind === 'owner' ? doc?.value?.totp : doc?.totp) || null;
}

export const isEnabled = (t) => Boolean(t && t.enabled && t.secret);

// ---------------- backup codes ----------------

function generateBackupCodes() {
  return Array.from({ length: BACKUP_COUNT }, () => {
    let s = '';
    for (let i = 0; i < 8; i++) s += BACKUP_ALPHABET[crypto.randomInt(BACKUP_ALPHABET.length)];
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}

// codes लंबे और random हैं, इसलिए bcrypt की ज़रूरत नहीं — SHA-256 काफ़ी
const hashBackupCode = (code) => crypto.createHash('sha256')
  .update(String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''))
  .digest('hex');

// ---------------- आधा लॉगिन (challenge) ----------------

export const challengeExpired = () => new ApiError(
  401, 'समय खत्म हो गया — दोबारा लॉगिन करें', { code: 'CHALLENGE_EXPIRED' },
);

/**
 * पासवर्ड सही निकला — अब दूसरा कदम. Authenticator लगा है तो सिर्फ कोड माँगो,
 * नहीं लगा तो (पहली बार) QR दिखाओ. account = QR पर दिखने वाला नाम.
 */
export async function startChallenge(subject, { account, tv = 0 }) {
  const t = await getTotp(subject);
  const id = crypto.randomBytes(32).toString('hex');
  await LoginChallenge.create({
    _id: id,
    kind: subject.kind,
    subjectId: subject.id || null,
    tv,
    expiresAt: new Date(Date.now() + CHALLENGE_MINUTES * 60 * 1000),
  });

  if (isEnabled(t)) return { step: 'totp', challenge: id };

  // QR हर लॉगिन पर नया — कोड से पक्का होने पर ही secret बनता है, तब तक pendingSecret
  const secret = totp.generateSecret();
  const { Model, filter, path } = target(subject);
  await Model.updateOne(filter, {
    $set: { [path]: { enabled: false, secret: null, pendingSecret: secret, lastStep: 0, backupCodes: [] } },
  });
  return {
    step: 'setup',
    challenge: id,
    secret,
    otpauthUrl: totp.buildOtpAuthUrl({ secret, account, issuer: ISSUER }),
  };
}

export async function readChallenge(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) return null;
  const ch = await LoginChallenge.findById(id).lean();
  // TTL index मिनट भर देर से हटाता है, इसलिए समय खुद भी जाँचते हैं
  if (!ch || ch.expiresAt < new Date()) return null;
  return ch;
}

/** गलत कोड — कोशिश गिनो; सीमा पूरी तो challenge खत्म, फिर से पासवर्ड डालना होगा */
export async function failChallenge(ch) {
  const next = await LoginChallenge.findOneAndUpdate(
    { _id: ch._id }, { $inc: { attempts: 1 } }, { returnDocument: 'after' },
  ).lean();
  const left = MAX_ATTEMPTS - (next?.attempts ?? MAX_ATTEMPTS);
  if (left <= 0) {
    await LoginChallenge.deleteOne({ _id: ch._id });
    return new ApiError(400, 'बहुत बार गलत कोड — दोबारा लॉगिन करें', { code: 'CHALLENGE_EXPIRED' });
  }
  return badRequest(`कोड गलत है — ${left} कोशिश बाकी`);
}

/** challenge एक ही बार चले — दो request साथ आएं तो भी सिर्फ एक को token */
export async function consumeChallenge(ch) {
  const r = await LoginChallenge.deleteOne({ _id: ch._id });
  return r.deletedCount === 1;
}

// ---------------- कोड जाँचना ----------------

// atomic — एक ही 6 अंकों का कोड दोबारा नहीं चलेगा
async function consumeStep(subject, step) {
  const { Model, filter, path } = target(subject);
  const r = await Model.updateOne(
    { ...filter, [`${path}.enabled`]: true, [`${path}.lastStep`]: { $lt: step } },
    { $set: { [`${path}.lastStep`]: step } },
  );
  return r.modifiedCount === 1;
}

async function consumeBackupCode(subject, code) {
  const { Model, filter, path } = target(subject);
  const hash = hashBackupCode(code);
  const r = await Model.updateOne(
    { ...filter, [`${path}.enabled`]: true, [`${path}.backupCodes`]: hash },
    { $pull: { [`${path}.backupCodes`]: hash } },
  );
  return r.modifiedCount === 1;
}

/**
 * Authenticator का 6 अंकों का कोड या backup code (XXXX-XXXX).
 * सही हो तो { usedBackupCode, backupCodesLeft }, गलत हो तो null.
 */
export async function verifyCode(subject, code) {
  const t = await getTotp(subject);
  if (!isEnabled(t)) return null;
  const input = String(code || '').trim();

  if (/^\d{6}$/.test(input)) {
    const step = totp.verify(t.secret, input);
    if (step === null || !(await consumeStep(subject, step))) return null;
    return { usedBackupCode: false };
  }

  if (!(await consumeBackupCode(subject, input))) return null;
  const after = await getTotp(subject);
  return { usedBackupCode: true, backupCodesLeft: after?.backupCodes?.length || 0 };
}

/** पहली बार: QR scan के बाद ऐप का कोड — सही हो तो 2FA चालू और backup codes (एक ही बार दिखेंगे) */
export async function confirmSetup(subject, code) {
  const t = await getTotp(subject);
  if (isEnabled(t)) throw new ApiError(400, 'Authenticator पहले से लगा है — दोबारा लॉगिन करें', { code: 'CHALLENGE_EXPIRED' });
  if (!t?.pendingSecret) throw challengeExpired();

  const step = totp.verify(t.pendingSecret, code);
  if (step === null) return null;

  const codes = generateBackupCodes();
  const { Model, filter, path } = target(subject);
  const r = await Model.updateOne(
    { ...filter, [`${path}.pendingSecret`]: t.pendingSecret },
    {
      $set: {
        [path]: {
          enabled: true,
          secret: t.pendingSecret,
          pendingSecret: null,
          lastStep: step,
          backupCodes: codes.map(hashBackupCode),
          enabledAt: new Date().toISOString(),
        },
      },
    },
  );
  if (r.modifiedCount !== 1) throw challengeExpired();
  return codes;
}

// ---------------- लॉगिन के बाद ----------------

export async function status(subject) {
  const t = await getTotp(subject);
  return {
    enabled: isEnabled(t),
    backupCodesLeft: isEnabled(t) ? t.backupCodes?.length || 0 : 0,
    enabledAt: isEnabled(t) ? t.enabledAt || null : null,
  };
}

/** नए backup codes — पुराने सब बंद. Authenticator का ताज़ा कोड चाहिए, ताकि खुला पड़ा कंप्यूटर काफ़ी न हो */
export async function regenerateBackupCodes(subject, code) {
  const t = await getTotp(subject);
  if (!isEnabled(t)) throw badRequest('पहले Google Authenticator लगाएं');
  const step = totp.verify(t.secret, code);
  if (step === null || !(await consumeStep(subject, step))) throw badRequest('Authenticator का कोड गलत है');

  const codes = generateBackupCodes();
  const { Model, filter, path } = target(subject);
  await Model.updateOne(filter, { $set: { [`${path}.backupCodes`]: codes.map(hashBackupCode) } });
  return codes;
}

/** फ़ोन खो गया — Authenticator हटाओ, अगले लॉगिन पर नया QR */
export async function reset(subject) {
  const { Model, filter, path } = target(subject);
  await Model.updateOne(filter, { $set: { [path]: null } });
}

import crypto from 'node:crypto';

/**
 * TOTP (RFC 6238) — Google Authenticator / Microsoft Authenticator इसी नियम पर चलते हैं.
 * कोड फ़ोन का ऐप खुद बनाता है, इसलिए न SMS लगता है न email — कोई सेवा पैसे माँगे
 * या बंद हो, लॉगिन नहीं रुकता. पूरा तरीका छोटा है, इसलिए library की जगह यहीं लिखा.
 */
const PERIOD = 30; // सेकंड — हर 30 सेकंड नया कोड
const DIGITS = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // base32

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32 secret');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }
  return Buffer.from(out);
}

/** 160-bit secret — RFC 4226 का सुझाया हुआ आकार */
export const generateSecret = () => base32Encode(crypto.randomBytes(20));

export function hotp(key, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary = ((hmac[offset] & 0x7f) << 24)
    | (hmac[offset + 1] << 16)
    | (hmac[offset + 2] << 8)
    | hmac[offset + 3];
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * सही कोड हो तो उसका time-step लौटाता है, वरना null. step इसलिए ताकि एक कोड
 * दो बार न चल सके. window = 1 → फ़ोन की घड़ी 30 सेकंड आगे-पीछे हो तब भी चलेगा.
 */
export function verify(secret, code, window = 1) {
  const input = String(code || '').trim();
  if (!/^\d{6}$/.test(input)) return null;

  const key = base32Decode(secret);
  const now = Math.floor(Date.now() / 1000 / PERIOD);
  const want = Buffer.from(input);

  for (let i = -window; i <= window; i++) {
    const got = Buffer.from(hotp(key, now + i));
    if (crypto.timingSafeEqual(got, want)) return now + i;
  }
  return null;
}

/** Authenticator ऐप यही पता QR से पढ़ता है */
export function buildOtpAuthUrl({ secret, account, issuer }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(PERIOD),
  });
  // URLSearchParams जगह को '+' बनाता है; कुछ ऐप उसे "Shreeji+Gold" दिखाते हैं
  return `otpauth://totp/${label}?${params.toString().replace(/\+/g, '%20')}`;
}

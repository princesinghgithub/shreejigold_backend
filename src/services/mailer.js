import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { ApiError } from '../lib/errors.js';

/**
 * Email भेजने की एक ही जगह. कौन सा रास्ता चलेगा:
 *  1. MAIL_TRANSPORT=json — टेस्ट; असली मेल नहीं जाता, outbox में जमा होता है
 *  2. BREVO_API_KEY हो — Brevo की HTTP API. Render जैसे free server पर भी चलती है,
 *     जहाँ SMTP के port बंद रहते हैं.
 *  3. SMTP_USER + SMTP_PASS हों — Gmail / कोई भी SMTP
 */
export const outbox = [];

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

async function sendViaBrevo({ to, subject, text, html }) {
  const { mail } = config;
  if (!mail.fromEmail) {
    throw new ApiError(503, 'backend की .env में MAIL_FROM_EMAIL डालें — Brevo में verify किया हुआ sender email');
  }

  let res;
  try {
    res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: {
        'api-key': mail.brevoApiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: mail.fromName, email: mail.fromEmail },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    console.error('[mail] Brevo तक नहीं पहुँचे:', err.message);
    throw new ApiError(502, 'Email नहीं जा सका — Brevo से जुड़ नहीं पाए, थोड़ी देर बाद कोशिश करें');
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[mail] Brevo ने मना किया:', res.status, body.slice(0, 300));
    // Brevo नए सर्वर (Vercel/Render) का IP पहचानता नहीं तो रोक देता है
    if (/IP/.test(body)) {
      throw new ApiError(502, 'Email नहीं जा सका — Brevo में Security → Authorised IPs वाली रोक बंद करें');
    }
    throw new ApiError(502, 'Email नहीं जा सका — backend की .env में BREVO_API_KEY और MAIL_FROM_EMAIL (Brevo में verified sender) जाँचें');
  }
}

let smtp = null;

async function sendViaSmtp({ to, subject, text, html }) {
  const { mail } = config;
  if (!smtp) {
    smtp = nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.port === 465,
      auth: { user: mail.user, pass: mail.pass },
    });
  }
  try {
    await smtp.sendMail({ from: `${mail.fromName} <${mail.fromEmail || mail.user}>`, to, subject, text, html });
  } catch (err) {
    console.error('[mail] SMTP से नहीं गया:', err.message);
    throw new ApiError(502, 'Email नहीं जा सका — backend की .env में SMTP_USER / SMTP_PASS (Google App Password) जाँचें');
  }
}

export async function sendMail(message) {
  const { mail } = config;
  if (mail.transport === 'json') {
    outbox.push({ to: message.to, subject: message.subject, text: message.text });
    return;
  }
  if (mail.brevoApiKey) return sendViaBrevo(message);
  if (mail.user && mail.pass) return sendViaSmtp(message);
  throw new ApiError(503, 'Email भेजने की setting नहीं है — backend की .env में BREVO_API_KEY (या SMTP_USER / SMTP_PASS) डालें');
}

// Brevo वाला रास्ता — असली API नहीं बुलाते. fetch नकली रखकर देखते हैं कि सही request जाती है
// और Brevo के मना करने पर साफ़ संदेश मिलता है.
process.env.BREVO_API_KEY = 'xkeysib-test-key';
process.env.MAIL_FROM_EMAIL = 'shop@example.com';
process.env.MAIL_FROM_NAME = 'Shreeji Gold';
process.env.MAIL_TRANSPORT = '';

const calls = [];
let reply = { status: 201, body: '{"messageId":"<test@smtp-relay.mailin.fr>"}' };
globalThis.fetch = async (url, opts) => {
  calls.push({ url, opts });
  return new Response(reply.body, { status: reply.status });
};

const { sendMail } = await import('../src/services/mailer.js');

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '  ' + String(JSON.stringify(extra)).slice(0, 400)); }
}
const mail = { to: 'malik@example.com', subject: 'OTP', text: 'आपका OTP 123456', html: '<b>123456</b>' };

console.log('\n-- Brevo से email --');
await sendMail(mail);
const c = calls[0];
const body = JSON.parse(c.opts.body);
check('Brevo का पता', c.url === 'https://api.brevo.com/v3/smtp/email', c.url);
check('api-key header', c.opts.headers['api-key'] === 'xkeysib-test-key', c.opts.headers);
check('sender', body.sender.email === 'shop@example.com' && body.sender.name === 'Shreeji Gold', body.sender);
check('पाने वाला', body.to.length === 1 && body.to[0].email === 'malik@example.com', body.to);
check('subject + text + html', body.subject === 'OTP' && body.textContent.includes('123456') && body.htmlContent.includes('123456'), body);

reply = { status: 401, body: '{"code":"unauthorized","message":"Key not found"}' };
try {
  await sendMail(mail);
  check('गलत key पर error', false, 'कोई error नहीं आया');
} catch (e) {
  check('गलत key -> 502, key जाँचने को कहता है', e.status === 502 && e.message.includes('BREVO_API_KEY'), e.message);
}

reply = { status: 401, body: '{"code":"unauthorized","message":"We have detected you are using an unrecognised IP address"}' };
try {
  await sendMail(mail);
  check('अनजान IP पर error', false, 'कोई error नहीं आया');
} catch (e) {
  check('अनजान IP -> Authorised IPs बंद करने को कहता है', e.status === 502 && e.message.includes('Authorised IPs'), e.message);
}

globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
try {
  await sendMail(mail);
  check('नेटवर्क error', false, 'कोई error नहीं आया');
} catch (e) {
  check('नेटवर्क न मिले -> 502', e.status === 502, e.message);
}

console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ====');
process.exit(fail ? 1 : 0);

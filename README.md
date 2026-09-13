# Shreeji Gold — Backend API

`soni-ji-react` (React + Vite बिलिंग ऐप) के लिए backend. Node.js + Express + MongoDB.
Vercel Functions पर चलने के लिए तैयार.

ऐप का सारा डेटा यहीं रहता है — ग्राहक, बिल, स्टॉक, ऑफर, दुकान की settings और लॉगिन खाता.
React ऐप अब सीधे इसी से जुड़ा है, इसलिए दुकान का कंप्यूटर हो या मोबाइल — सब पर एक जैसा हिसाब.
ब्राउज़र में कुछ सेव नहीं होता (सिर्फ लॉगिन का टोकन).

---

## चलाने के लिए (Setup)

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
npm run dev               # या: npm start
```

सर्वर चलेगा → `http://localhost:4000`
जाँचने के लिए ब्राउज़र में खोलें: `http://localhost:4000/api/health`

### लॉगिन खाता बनाएं (यूज़र ID + पासवर्ड)

`.env` में `ADMIN_USER_ID` और `ADMIN_PASSWORD` डालें, फिर:

```bash
npm run seed:admin
```

खाता न हो तो बन जाता है, हो तो उसका यूज़र ID और पासवर्ड बदल जाता है (सुरक्षा सवाल वैसा ही रहता है).
कोई डेटा नहीं मिटता. पासवर्ड `.env` में ही रहता है, जो git में नहीं जाती.

### टेस्ट के लिए demo data भरें

```bash
npm run seed
```

(ध्यान दें: यह मौजूदा Customers/Stock/Bills **हटाकर** sample डेटा भर देगा — असली दुकान के डेटाबेस पर न चलाएं.)

### सब कुछ ठीक चल रहा है या नहीं — जाँचें

```bash
npm test
```

205 जाँचें चलती हैं (लॉगिन, email OTP, Brevo, बिल का हिसाब, बिल नंबर की गिनती, HUID / Hallmark / भुगतान के तरीके,
stock घटना-बढ़ना, उधारी खाता, backup/restore, website catalog, फोटो, leads और CORS).
यह अपने आप एक अस्थायी MongoDB चला लेता है — असली डेटा को हाथ नहीं लगाता, और कोई असली email नहीं भेजता.

### डेटाबेस की कॉपी अभी बनाएं

```bash
npm run backup
```

### यूज़र ID या पासवर्ड, दोनों भूल जाएं तो

```bash
npm run reset-password
```

डेटा नहीं मिटेगा — सिर्फ लॉगिन खाता हटेगा. उसके बाद ऐप खोलकर नया यूज़र ID, पासवर्ड और सुरक्षा सवाल सेट करें.

---

## .env की settings

| नाम | मतलब |
|---|---|
| `PORT` | सर्वर का पोर्ट (default `4000`) |
| `JWT_SECRET` | लॉगिन टोकन की secret key — **hosting पर ज़रूर बदलें** |
| `JWT_EXPIRES_IN` | टोकन कब तक चले (default `30d`) |
| `CORS_ORIGIN` | फ्रंटएंड का पता, comma से कई. `*` = सबको allow |
| `MONGODB_URI` | MongoDB Atlas का पता — **ज़रूरी** |
| `MONGODB_DB` | database का नाम (खाली छोड़ें तो URI वाला चलेगा) |
| `CRON_SECRET` | रोज़ के backup की key |
| `AUTO_BACKUP` | रोज़ाना अपने आप कॉपी बने (default `true`) |
| `BACKUP_KEEP` | कितनी पुरानी कॉपियाँ रखें (default `30`) |
| `LOGIN_MAX_ATTEMPTS` | कितनी गलत लॉगिन कोशिशें चलेंगी (default `20`) |
| `LOGIN_WINDOW_MINUTES` | उतने मिनट में (default `15`) |
| `BREVO_API_KEY` | पासवर्ड भूलने पर OTP Brevo से भेजने की key (free: रोज़ 300 email). हो तो यही चलता है, SMTP नहीं |
| `MAIL_FROM_EMAIL` / `MAIL_FROM_NAME` | मेल किसके नाम से जाए — Brevo में यह email Senders में verify होना चाहिए |
| `SMTP_USER` | Brevo न हो तो OTP जिस Gmail से जाएगा |
| `SMTP_PASS` | उस Gmail का **App Password** (Google Account → Security → 2-Step Verification → App passwords) — Gmail का असली पासवर्ड नहीं |
| `SMTP_HOST` / `SMTP_PORT` | Gmail के अलावा कोई मेल सेवा हो तो (default `smtp.gmail.com` / `465`) |

---

## डेटाबेस — क्या है और कैसे संभालना है

### कौन सा डेटाबेस

**MongoDB** (Atlas पर). Vercel Functions पर हर request एक नए, खाली डिब्बे में चलती है —
वहाँ डिस्क पर लिखी कोई फाइल टिकती नहीं. इसलिए डेटा बाहर, Atlas में रहता है.

डेटाबेस से बात **Mongoose** के ज़रिए होती है. कनेक्शन (`connectDB`) एक बार बनकर global में
रखा जाता है, ताकि हर बिल पर नया कनेक्शन न बने और Atlas का कनेक्शन कोटा न भरे
(`src/db/index.js`). पहली API request पर यह अपने आप जुड़ जाता है.

### Collections और उनके Models

हर collection का Mongoose model `src/models/` में है — fields, types और indexes वहीं लिखे हैं.

| Collection | Model | क्या रखता है |
|---|---|---|
| `meta` | `Meta` | key/value — GST %, दुकान का नाम/पता/लोगो, सोने-चांदी का भाव, लॉगिन खाता |
| `customers` | `Customer` | ग्राहक — नाम, फ़ोन, पता, `balance`, और **उधारी खाता (`ledger`) इसी के अंदर** |
| `stock` | `Stock` | माल — नाम, Gold/Silver, purity, वजन, नग |
| `invoices` | `Invoice` | बिल — बिल नंबर, items (HUID, Gross/Net वजन, hallmark), exchange, भुगतान के तरीके इसी दस्तावेज़ में |
| `counters` | `Counter` | बिल नंबर की गिनती — हर series और financial year की अलग (`INV:2026-27` → 257) |
| `offers` | `Offer` | चालू छूट/ऑफर |
| `backups` | `Backup` | रोज़ बनने वाली पूरे डेटा की कॉपियाँ |
| `products` | `Product` | Website पर दिखने वाले designs — नाम, type, metal, कीमत, website पर दिखे या नहीं |
| `product_images` | `ProductImage` | designs की अपलोड की हुई फोटो (सूची हल्की रहे इसलिए अलग) |
| `leads` | `Lead` | Website से आई enquiry — नाम, नंबर, design, संदेश, status, दुकान का note |

**उधारी खाता ग्राहक के अंदर क्यों:** खाता हमेशा उसी ग्राहक के साथ पढ़ा जाता है, एक दुकान में
entries सैकड़ों में रहती हैं (लाखों में नहीं), और एक ही जगह लिखने से बकाया कभी अधूरा नहीं दिखता.

**ज़रूरी नियम:** `customers.balance` कभी हाथ से नहीं लिखी जाती — वह हमेशा उसी ग्राहक की
`ledger` का जोड़ होती है (`recalcBalance`). इसलिए बकाया और खाता कभी अलग-अलग नहीं दिखेंगे.

बिल के `items` को अलग collection में तोड़ा नहीं गया — छपा हुआ बिल हमेशा वैसा ही दिखना चाहिए
जैसा उस दिन बना था. भाव बाद में बदल जाएं तो भी पुराना बिल नहीं बदलना चाहिए, इसलिए हर item का
निकाला हुआ `metalVal` / `making` बिल के अंदर ही जम जाता है.

**बिल नंबर (GST नियम 46):** tax invoice का नंबर लगातार हो और एक financial year (अप्रैल–मार्च) में
दोहराया न जाए. इसलिए तीन series अलग गिनती से चलती हैं — GST बिक्री `1, 2, 3…`, Estimate `E-1…`,
खरीद `P-1…` — और हर 1 अप्रैल को फिर 1 से. बिल हटे तो भी गिनती पीछे नहीं जाती (वही नंबर दूसरे बिल पर
नहीं छपता), और backup restore के बाद गिनती backup के सबसे बड़े नंबर से आगे चलती है.
पुराने बिलों (इस बदलाव से पहले के) में नंबर नहीं है — उन पर पहले की तरह id के आखिरी 6 अक्षर छपते हैं.

### एक साथ बदलने वाली चीज़ें (transactions)

बिल बनते ही तीन काम होते हैं — बिल सेव, stock adjust, ग्राहक के खाते में entry.
तीनों एक **transaction** में चलते हैं, इसलिए बीच में कुछ गड़बड़ हो तो कुछ भी अधूरा नहीं बचता.
Atlas हमेशा replica set होता है, वहाँ यह अपने आप चलता है.

### Backup

**1. अपने आप बनने वाली कॉपियाँ** — `backups` collection में
- दिन में एक बार पूरे डेटा की कॉपी बन जाती है, पिछली 30 रहती हैं
- Vercel पर यह **Vercel Cron** से चलता है (`vercel.json` में रोज़ रात 2:00 IST)
- अपने कंप्यूटर पर सर्वर खुद हर 6 घंटे जाँच कर लेता है
- ऐप के Backup पेज से किसी भी कॉपी को एक क्लिक में वापस लाया जा सकता है

**2. `.json` backup** — `GET /api/backup?download=1`
- वही फाइल जो ऐप के Backup पेज से बनती है, इसलिए **पुरानी backup फाइल सीधे यहाँ restore हो जाएगी**
- इसमें पासवर्ड नहीं जाता — सिर्फ ग्राहक/स्टॉक/बिल/offers/settings

> **ध्यान दें:** Atlas के मुफ़्त वाले (M0) में अपने आप backup नहीं मिलता. ऊपर वाली दोनों
> चीज़ें उसी डेटाबेस के अंदर हैं — यानी Atlas का पूरा cluster ही चला जाए तो वे भी चली जाएंगी.
> इसलिए **महीने में एक बार Backup पेज से `.json` फाइल डाउनलोड करके अपने पास ज़रूर रखें.**

---

## लॉगिन (Authentication)

एक ही खाता — दुकान के मालिक के लिए. **यूज़र ID + पासवर्ड**, और पासवर्ड भूल जाने पर
यूज़र ID वाले **email पर OTP** (Brevo या Gmail से), या **सुरक्षा सवाल** से नया पासवर्ड बन जाता है
(डेटा कुछ नहीं मिटता).

1. पहली बार: मालिक का खाता टर्मिनल से — `npm run seed:admin` (`.env` के `ADMIN_USER_ID` / `ADMIN_PASSWORD`).
   लॉगिन स्क्रीन पर कोई register फॉर्म नहीं है, और `POST /api/auth/setup` बंद रहता है (403) —
   सिर्फ `ALLOW_SETUP=true` पर खुलता है, जो टेस्ट के लिए है. बाकी users अंदर **Users / Staff** पेज से बनते हैं
2. उसके बाद: `POST /api/auth/login` — यूज़र ID + पासवर्ड → `{ token }`
3. `/api/auth/*` को छोड़कर हर request में यह header लगाना है:

```
Authorization: Bearer <token>
```

- पासवर्ड और सुरक्षा सवाल का जवाब — दोनों bcrypt hash बनकर सेव होते हैं, कहीं सादा नहीं रहते
- यूज़र ID में छोटे-बड़े अक्षर से फ़र्क नहीं पड़ता; जवाब में भी नहीं
- लॉगिन गलत होने पर यह नहीं बताया जाता कि ID गलत थी या पासवर्ड — दोनों के लिए एक ही जवाब
- गलत कोशिशों पर rate limit लगता है (`LOGIN_MAX_ATTEMPTS` / `LOGIN_WINDOW_MINUTES`)
- यूज़र ID और सुरक्षा सवाल का जवाब भी भूल जाएं तो टर्मिनल से: `npm run reset-password`

### Auth के endpoints

| Method | Path | काम |
|---|---|---|
| GET | `/auth/status` | खाता बना है या नहीं (`{ isSetup, hasSecurityQuestion }`) |
| POST | `/auth/setup` | पहली बार — `{ userId, password, question, answer }` |
| POST | `/auth/login` | लॉगिन — `{ userId, password }` → `{ token, userId }` |
| GET | `/auth/me` | टोकन सही है या नहीं |
| GET | `/auth/forgot?userId=` | उस यूज़र ID का सुरक्षा सवाल (बिना लॉगिन) |
| POST | `/auth/forgot` | `{ userId, answer, newPassword }` — सही जवाब पर नया पासवर्ड |
| POST | `/auth/forgot/otp` | `{ userId }` — यूज़र ID (email) पर 6 अंकों का OTP (10 मिनट, 1 मिनट में एक बार) |
| POST | `/auth/forgot/otp/verify` | `{ userId, otp, newPassword }` — सही OTP पर नया पासवर्ड (5 गलत कोशिश पर OTP खत्म) |
| POST | `/auth/change-password` | `{ oldPassword, newPassword }` |
| POST | `/auth/change-userid` | `{ password, newUserId }` → नया `{ token }` |
| POST | `/auth/security-question` | `{ password, question, answer }` |

---

## API — पूरी लिस्ट

बेस URL: `http://localhost:4000/api`

### दुकान — Rates, Settings, Dashboard

| Method | Path | काम |
|---|---|---|
| GET | `/shop/rates` | सोना/चांदी का भाव |
| PUT | `/shop/rates` | भाव अपडेट — `{ gold, silver }` |
| GET | `/shop/settings` | दुकान की settings (GST %, नाम, पता, फ़ोन) |
| PUT | `/shop/settings` | settings अपडेट |
| GET | `/shop/dashboard` | Dashboard के सारे आंकड़े एक ही call में |

`/shop/dashboard` देता है: आज की बिक्री, महीने की बिक्री, कुल उधारी, कुल stock,
पिछले 7 दिन का चार्ट डेटा, हाल के 8 बिल, चालू offers, सबसे ज़्यादा उधारी वाले ग्राहक.

### Customers + उधारी खाता

| Method | Path | काम |
|---|---|---|
| GET | `/customers?search=` | सारे ग्राहक (ledger समेत) |
| GET | `/customers/:id` | एक ग्राहक |
| POST | `/customers` | नया — `{ name, phone, address, openingBalance }` |
| PUT | `/customers/:id` | नाम/फ़ोन/पता बदलें |
| DELETE | `/customers/:id` | हटाएं (उसकी ledger भी हटेगी) |
| POST | `/customers/:id/ledger` | खाते में entry — `{ amount, note, date }` |
| DELETE | `/customers/:id/ledger/:entryId` | entry हटाएं |

`amount` में **+ = उधारी बढ़ी**, **− = पैसा जमा हुआ**. `balance` हर बार ledger से खुद जुड़ती है.

### एक ग्राहक = एक ही खाता

पुराना ग्राहक दोबारा आए तो उसका दूसरा खाता नहीं बनता — पिछला बकाया और नया बिल, दोनों एक ही खाते में चलते हैं:

- बिल बनाते समय `customerName` / `customerPhone` भेजें तो सर्वर पहले **उसी नंबर** का ग्राहक खोजता है
  (मिलान आख़िरी 10 अंकों से). नंबर न दिया हो तो **उसी नाम का अकेला ग्राहक**. एक ही नाम के दो ग्राहक हों
  तो कुछ नहीं जोड़ा जाता — दुकानदार खुद चुनता है, वरना दो अलग लोगों का हिसाब मिल जाए
- मिले हुए खाते में जो जानकारी खाली थी (नंबर / पता / PAN) वह इसी बिल से भर जाती है
- `POST /customers` में वही ग्राहक दोबारा डालें तो **409** आता है. सचमुच अलग आदमी हो तो `"allowDuplicate": true`

| Method | Path | काम |
|---|---|---|
| GET | `/customers/duplicates` | एक ही नंबर या एक ही नाम वाले खाते, समूह में |
| POST | `/customers/:id/merge` | `{ "from": "cust_xxx" }` — वह खाता इसी में समा जाता है |

मिलाने पर पुराने खाते के **सारे बिल और उधारी entries** रहने वाले खाते में चली जाती हैं, बकाया
दोबारा जोड़ से बनता है, और दोहरा खाता हट जाता है. (पुराना खाता मिटता है, बिल नहीं.)

### खोज (ऊपर का एक ही खाना)

| Method | Path | काम |
|---|---|---|
| GET | `/search?q=रमेश&limit=8` | ग्राहक (नाम / फ़ोन / पता) और बिल (बिल नंबर / barcode / ग्राहक का नाम) — दोनों एक ही जवाब में |

जवाब: `{ q, customers: [{ id, name, phone, address, balance, bills, lastBillDate }], invoices: [{ id, billNo, date, customerName, total, due }] }`.
बिलिंग ऐप का ऊपर वाला खाना यही चलाता है — नाम लिखते ही ग्राहक की सूची, और एक ही मिले तो Enter से सीधा उसका खाता.

### Stock

| Method | Path | काम |
|---|---|---|
| GET | `/stock?category=&search=` | सारा stock |
| GET | `/stock/:id` | एक item |
| POST | `/stock` | नया — `{ name, category, purity, weight, qty }` |
| PUT | `/stock/:id` | बदलें |
| DELETE | `/stock/:id` | हटाएं |

### Invoices (बिलिंग)

| Method | Path | काम |
|---|---|---|
| GET | `/invoices` | बिल की लिस्ट (filters नीचे) |
| GET | `/invoices/:id` | एक बिल |
| GET | `/invoices/barcode/:code` | barcode से बिल खोजें |
| POST | `/invoices` | नया बिल |
| POST | `/invoices/:id/payment` | भुगतान दर्ज — `{ amount, mode, note }` (`mode`: `cash` · `upi` · `neft` · `netbanking` · `card` · `cheque`) |
| DELETE | `/invoices/:id` | बिल हटाएं |

Filters: `?from=2026-09-01&to=2026-09-30&type=sale|purchase&gstMode=gst|nongst&customerId=&billNo=257&search=&limit=&offset=`
(`search` में छपा बिल नंबर — जैसे `E-12` — भी पूरा मिलाकर खोजा जाता है)

बिल बनाने का उदाहरण:

```json
POST /api/invoices
{
  "type": "sale",
  "gstMode": "gst",
  "date": "2026-09-08",
  "customerId": "cust_xxx",
  "customerName": "नया ग्राहक",
  "customerPhone": "9876543210",
  "customerAddress": "शांति नगर, खटखरी",
  "customerPan": "ABCDE1234F",
  "items": [
    { "name": "हार", "metal": "Gold", "huid": "VGXVXH", "grossWeight": 9.2, "weight": 9.08, "purity": 91.6,
      "makingType": "pct", "making": 13, "hallmark": 100 }
  ],
  "exchange": { "weight": 0, "purity": 0, "deduct": 0, "rate": 0 },
  "discountType": "pct",
  "discountValue": 2,
  "payments": [{ "mode": "cash", "amount": 50000 }, { "mode": "upi", "amount": 20000 }]
}
```

- `makingType`: `perg` (₹/ग्राम) · `flat` (सीधा ₹) · `pct` (value का %)
- `weight` = Net वजन (भाव इसी पर); `grossWeight` = नग/धागे समेत (न दें तो Net जितना)
- `huid` = BIS hallmark का 6 अक्षर/अंक वाला HUID (optional); `hallmark` = hallmark charge ₹ — GST से पहले जुड़ता है
- `payments` दें तो `paid` उसी का जोड़ बनता है; पुराना तरीका `"paid": 5000` भी चलता है
- `customerPan` ₹2 लाख से ऊपर के बिल पर लें (ऐप चेतावनी देता है); गलत format पर 400
- `customerId` न दें और `customerName` दें → नया ग्राहक अपने आप बन जाता है
- GST दो तरह से: `"gstType": "pct", "gstValue": 3` (प्रतिशत) या `"gstType": "flat", "gstValue": 1500` (सीधे रुपये).
  बिल पर वही छपता है जो चुना गया; `gstPct` में असली प्रतिशत हमेशा भर जाता है (रिपोर्ट के लिए).
  पुराना `"gstPct": 3` भी चलता रहेगा
- `gstMode: "nongst"` → GST 0% (Estimate बिल)

**बिल बनते ही अपने आप:**
1. भाव सर्वर के rates से लगते हैं (client का भेजा total नहीं माना जाता), barcode और बिल नंबर (`billNo`) बनता है;
   कुल रकम पूरे रुपये में — पैसे का फ़र्क `roundOff` में
2. Stock adjust होता है — बिक्री पर घटता, खरीद पर बढ़ता; खरीद में नया item हो तो stock में जुड़ जाता है
3. बकाया (due) ग्राहक के उधारी खाते में चढ़ जाता है

बिल delete करने पर तीनों असर उलट जाते हैं — stock वापस, ledger entry हटती, balance फिर से जुड़ती है.

### Offers

| Method | Path | काम |
|---|---|---|
| GET | `/offers?active=1` | सारे / सिर्फ चालू offers |
| GET | `/offers/:id` | एक offer |
| POST | `/offers` | नया — `{ title, discountPercent, startDate, endDate, description }` |
| PUT | `/offers/:id` | बदलें |
| DELETE | `/offers/:id` | हटाएं |

### Reports

| Method | Path | काम |
|---|---|---|
| GET | `/reports?from=&to=&type=&gstMode=&customerId=` | range रिपोर्ट |
| GET | `/reports/daily?date=YYYY-MM-DD` | एक दिन की |
| GET | `/reports/monthly?month=YYYY-MM` | एक महीने की |
| GET | `/reports/export.csv?from=&to=` | CSV डाउनलोड |

जवाब में: कुल बिक्री/खरीद/GST/बकाया, दिन-वार breakdown, और पूरी बिल लिस्ट.

### Backup

| Method | Path | काम |
|---|---|---|
| GET | `/backup` | पूरा डेटा JSON में (`?download=1` से फाइल) |
| POST | `/backup/restore` | backup .json से restore (मौजूदा डेटा हटेगा) |
| POST | `/backup/seed-demo` | demo data भरें |
| DELETE | `/backup/all` | पूरा डेटा मिटाएं |
| GET | `/backup/snapshots` | `.db` फाइल की बनी हुई कॉपियों की लिस्ट |
| POST | `/backup/snapshots` | अभी नई कॉपी बनाएं |
| GET | `/backup/snapshots/:file` | कोई कॉपी डाउनलोड करें |

`GET /backup` बिल्कुल वही shape देता है जो ऐप के Backup पेज से बनने वाली `.json` फाइल में है
(`{ rates, customers, stock, invoices, offers, settings }`) — इसलिए **पुरानी backup फाइल
सीधे यहाँ restore हो जाएगी**, और यहाँ की फाइल ऐप में.

---

### Website Catalog (admin — लॉगिन के बाद)

दुकान की website (`shreeji-gold`) पर दिखने वाले designs. बिलिंग ऐप का **Website Catalog** पेज यही चलाता है.

| Method | Path | काम |
|---|---|---|
| GET | `/catalog` | सारे designs (छिपे हुए भी) |
| POST | `/catalog` | नया — `{ name, type, metal, wearer, occasion, price, weight, description, imageData, imageUrl, isNew, bestseller, active }` |
| PUT | `/catalog/:id` | बदलें (जो भेजा वही बदलेगा). `removeImage: true` से फोटो हटे |
| DELETE | `/catalog/:id` | हटाएं |
| POST | `/catalog/import-defaults` | Website के पहले से बने designs (SG0001…) जोड़ें — जो पहले से हैं उन्हें नहीं छूता |

पहली बार (या गलती से हटाए designs वापस लाने के लिए) टर्मिनल से भी: `npm run seed:catalog`.
नए डाले designs सबसे ऊपर आते हैं, फिर पुराने designs अपने क्रम में.

- `imageData` = `data:image/jpeg;base64,...` (JPG/PNG/WEBP, 1.5 MB तक). ऐप फोटो पहले ही छोटी करके भेजता है
- फोटो `product_images` collection में अलग रहती है; `image` का पता `/api/public/products/:id/image?v=…` होता है
- `price: 0` = website पर "Ask today's rate"
- `type` / `metal` / `wearer` / `occasion` के नाम website के filter से मिलने चाहिए (`shreeji-gold/src/data/catalog.js`)

### Website Leads (admin — लॉगिन के बाद)

Website पर "Enquire" या WhatsApp widget में नाम-नंबर देने वाले लोग. बिलिंग ऐप का **Website Leads** पेज.

| Method | Path | काम |
|---|---|---|
| GET | `/leads?status=` | सूची (नई पहले) + हर status की गिनती `{ leads, counts }` |
| PUT | `/leads/:id` | `{ status, notes }` — status: `new` / `contacted` / `converted` / `closed` |
| DELETE | `/leads/:id` | हटाएं |

### Users / Staff (सिर्फ मालिक या Admin)

मालिक का खाता (setup / `seed:admin` वाला) हमेशा रहता है. उसके अलावा दुकान पर काम करने वालों के
अलग यूज़र ID-पासवर्ड यहाँ से बनते हैं — बिलिंग ऐप का **Users / Staff** पेज (register फॉर्म) यही चलाता है.

| Method | Path | काम |
|---|---|---|
| GET | `/users` | `{ owner, users }` — मालिक + बाकी users (पासवर्ड कभी नहीं लौटता) |
| POST | `/users` | नया user — `{ name, userId, password, role: staff \| admin }` |
| PUT | `/users/:id` | `{ name, userId, role, active, password }` — password भेजा तो reset |
| DELETE | `/users/:id` | हटाएं (बिल / ग्राहक जैसा कोई डेटा नहीं मिटता) |

| | मालिक | Admin | Staff |
|---|---|---|---|
| बिलिंग, ग्राहक, stock, आज का rate, reports, offers, catalog, leads | ✔ | ✔ | ✔ |
| users बनाना / बंद / हटाना / पासवर्ड reset | ✔ | ✔ | ✖ (403) |
| दुकान की settings, backup restore, सारा डेटा मिटाना, demo data | ✔ | ✔ | ✖ (403) |
| अपना पासवर्ड बदलना (`/auth/change-password`) | ✔ | ✔ | ✔ |
| यूज़र ID बदलना, सुरक्षा सवाल, पासवर्ड भूलने पर OTP | ✔ | ✖ | ✖ |

- लॉगिन सबका `/auth/login` से; जवाब में `role` (`owner` / `admin` / `staff`), और `/auth/me` में भी
- user बंद करने, हटाने, उसका पासवर्ड या यूज़र ID बदलने पर उसका चालू लॉगिन **उसी पल** बंद हो जाता है
  (हर request पर सर्वर user की ताज़ा हालत देखता है)
- एक यूज़र ID दो लोगों का नहीं हो सकता (मालिक वाला भी नहीं); Admin अपना ही खाता बंद / हटा नहीं सकता

### Public — website के लिए (बिना लॉगिन, हर domain से CORS खुला)

| Method | Path | काम |
|---|---|---|
| GET | `/public/catalog` | सिर्फ दिखने वाले designs + दुकान का आज का भाव `{ products, rates: { k24, k22, silver } }` |
| GET | `/public/products/:id/image` | design की फोटो |
| POST | `/public/leads` | enquiry — `{ name, phone, message, productId, productName, source }` |

- मोबाइल नंबर `+91` / `0` / जगह हटाकर 10 अंकों में सेव होता है; गलत नंबर पर 400
- 15 मिनट में एक IP से 10 enquiry तक; छिपा `website` खाना भरा हो (bot) तो सेव नहीं होती
- उसी नंबर से उसी design की 30 मिनट के अंदर दोबारा enquiry नई lead नहीं बनाती — पुरानी में संदेश जुड़ जाता है
- बाकी सारी API पर CORS पहले जैसा `CORS_ORIGIN` से ही खुलता है

---

## फ्रंटएंड को इससे जोड़ना

अभी React ऐप `localStorage` पर चलता है और backend से जुड़ा **नहीं** है — दोनों अलग-अलग काम करते हैं.
जोड़ने का रास्ता आसान है, क्योंकि ऐप का सारा data-access एक ही जगह से होकर जाता है:

- [src/lib/storage.js](../soni-ji-react/src/lib/storage.js) — `loadDB` / `saveDB` की जगह API call
- [src/context/DataContext.jsx](../soni-ji-react/src/context/DataContext.jsx) — `updateDb` को API पर भेजना
- [src/components/Login.jsx](../soni-ji-react/src/components/Login.jsx) — `getCred`/`setCred` की जगह `/api/auth/login`

फ्रंटएंड में एक `SHREEJI_URL=http://localhost:4000/api` env डालकर token `localStorage`
में रखना होगा. Backend का CORS पहले से `http://localhost:5173` (Vite) के लिए खुला है.

---

## Vercel पर डालना (Deploy)

तीन चीज़ें अलग-अलग:

| हिस्सा | कहाँ | पता |
|---|---|---|
| बिलिंग ऐप (frontend) | Vercel | `admin.shreejigold.shop` |
| यह backend | Vercel Functions | `api.shreejigold.shop` |
| डेटाबेस | MongoDB Atlas (M0 मुफ़्त) | — |

### 1. MongoDB Atlas

1. [cloud.mongodb.com](https://cloud.mongodb.com) पर मुफ़्त M0 cluster बनाएं
2. **Database Access** में एक user बनाएं (पासवर्ड में `@` या `:` न रखें, वरना URL-encode करना पड़ता है)
3. **Network Access** में `0.0.0.0/0` allow करें — Vercel के सर्वर का IP तय नहीं होता
4. **Connect → Drivers** से connection string कॉपी करें

### 2. Backend (यह फोल्डर)

Vercel पर नया project बनाएं, Root Directory इस फोल्डर पर रखें, और
Environment Variables में डालें:

```
MONGODB_URI   = mongodb+srv://user:pass@cluster.xxxxx.mongodb.net/shreeji_gold
JWT_SECRET    = (लंबी random string)
CRON_SECRET   = (दूसरी लंबी random string)
CORS_ORIGIN   = https://admin.shreejigold.shop
NODE_ENV      = production
```

`vercel.json` पहले से तैयार है — सारी requests `api/index.js` पर जाती हैं, और रोज़ का
backup cron भी उसी में लिखा है.

Domain settings में `api.shreejigold.shop` इस project से जोड़ दें.

### 3. बिलिंग ऐप (frontend)

`soni-ji-react` फोल्डर से दूसरा Vercel project बनाएं. Environment Variable:

```
SHREEJI_URL = https://shreejigoldbackend.vercel.app/api
```

Domain में `admin.shreejigold.shop` जोड़ें.

### 4. पहली बार

`https://admin.shreejigold.shop` खोलें — खाता बनाने की स्क्रीन आएगी. यूज़र ID, पासवर्ड
और सुरक्षा सवाल भरकर शुरू कर दें.

> **एक ज़रूरी बात:** अब बिलिंग इंटरनेट पर टिकी है. दुकान का नेट बंद हो या Atlas धीमा हो,
> तो बिल नहीं बनेगा. इसलिए मोबाइल का hotspot हमेशा तैयार रखें.

---

## फोल्डर की बनावट

```
src/
  config.js            - .env पढ़ना
  app.js               - Express ऐप, routes जोड़ना
  server.js            - सर्वर चालू करना
  db/
    index.js           - Mongoose कनेक्शन (connectDB), meta helpers, transactions
  models/              - Mongoose models: Meta, Customer, Stock, Invoice, Offer, Backup
  lib/
    calc.js            - बिल का हिसाब (फ्रंटएंड के calc.js जैसा ही)
    helpers.js         - uid, barcode, date helpers
    schemas.js         - zod validation
    errors.js          - ApiError
  middleware/          - auth (JWT), validate, error handler
  services/            - असली काम: customers, stock, invoices, offers, shop,
                         reports, backup, seed, auth
  routes/              - HTTP endpoints
  scripts/             - npm run seed / backup / reset-password
test/
  smoke.mjs            - npm test — पूरी API की 95 जाँचें
api/
  index.js             - Vercel Functions की entry
vercel.json            - routes + रोज़ का backup cron
```

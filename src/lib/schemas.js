import { z } from 'zod';

const numberish = z.union([z.number(), z.string()]).transform((v) => Number(v) || 0);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'तारीख YYYY-MM-DD में होनी चाहिए');

export const setupSchema = z.object({
  userId: z.string().min(1, 'यूज़र ID डालें'),
  password: z.string().min(1, 'पासवर्ड डालें'),
  question: z.string().min(1, 'सुरक्षा सवाल चुनें'),
  answer: z.string().min(1, 'सवाल का जवाब लिखें'),
});

export const loginSchema = z.object({
  userId: z.string().min(1, 'यूज़र ID डालें'),
  password: z.string().min(1, 'पासवर्ड डालें'),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'पुराना पासवर्ड डालें'),
  newPassword: z.string().min(4, 'कम से कम 4 अक्षर'),
});

export const changeUserIdSchema = z.object({
  password: z.string().min(1, 'पासवर्ड डालें'),
  newUserId: z.string().min(1, 'नया यूज़र ID डालें'),
});

export const securityQuestionSchema = z.object({
  password: z.string().min(1, 'पासवर्ड डालें'),
  question: z.string().min(1, 'सवाल लिखें'),
  answer: z.string().min(1, 'जवाब लिखें'),
});

export const forgotResetSchema = z.object({
  userId: z.string().min(1, 'यूज़र ID डालें'),
  answer: z.string().min(1, 'सवाल का जवाब लिखें'),
  newPassword: z.string().min(4, 'कम से कम 4 अक्षर'),
});

export const forgotOtpSchema = z.object({
  userId: z.string().min(1, 'यूज़र ID डालें'),
});

export const forgotOtpVerifySchema = z.object({
  userId: z.string().min(1, 'यूज़र ID डालें'),
  otp: z.string().trim().regex(/^\d{6}$/, 'OTP 6 अंकों का होता है'),
  newPassword: z.string().min(4, 'कम से कम 4 अक्षर'),
});

// ---- website catalog (admin) ----
// सब optional — जो भेजा जाएगा वही बदलेगा (defaults Product model में हैं)
export const productUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Design का नाम ज़रूरी है').max(150),
  type: z.string().max(60),
  metal: z.string().max(60),
  wearer: z.string().max(40),
  occasion: z.string().max(60),
  price: numberish,
  weight: numberish,
  description: z.string().max(1000),
  imageUrl: z.string().max(1000),
  imageData: z.string(),      // data:image/jpeg;base64,...
  removeImage: z.boolean(),
  isNew: z.boolean(),
  bestseller: z.boolean(),
  active: z.boolean(),
  order: numberish,
}).partial();

export const productCreateSchema = productUpdateSchema.extend({
  name: z.string().trim().min(1, 'Design का नाम ज़रूरी है').max(150),
});

// ---- website से आने वाली enquiry (बिना login) — संदेश website के visitor को दिखते हैं ----
// मोबाइल: +91, 0, जगह, - सब हटाकर 10 अंक
const mobile = z.string()
  .transform((s) => s.replace(/\D/g, '').replace(/^(?:91|0)(?=\d{10}$)/, ''))
  .refine((d) => /^[6-9]\d{9}$/.test(d), 'Please enter a valid 10-digit mobile number');

export const leadPublicSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name').max(80),
  phone: mobile,
  message: z.string().trim().max(1000).optional(),
  productId: z.string().max(60).optional(),
  productName: z.string().max(150).optional(),
  source: z.enum(['enquiry', 'widget', 'website']).optional(),
  website: z.string().optional(), // bots के लिए छिपा खाना — भरा हो तो lead नहीं बनती
});

export const leadUpdateSchema = z.object({
  status: z.enum(['new', 'contacted', 'converted', 'closed']).optional(),
  notes: z.string().max(2000).optional(),
});

// ---- दुकान के users (admin dashboard का register फॉर्म) ----
export const userCreateSchema = z.object({
  name: z.string().trim().max(80).optional(),
  userId: z.string().min(1, 'यूज़र ID डालें'),
  password: z.string().min(4, 'पासवर्ड कम से कम 4 अक्षर का रखें'),
  role: z.enum(['admin', 'staff']).default('staff'),
});

export const userUpdateSchema = z.object({
  name: z.string().trim().max(80).optional(),
  userId: z.string().min(1, 'यूज़र ID डालें').optional(),
  password: z.string().min(4, 'पासवर्ड कम से कम 4 अक्षर का रखें').optional(),
  role: z.enum(['admin', 'staff']).optional(),
  active: z.boolean().optional(),
});

export const ratesSchema = z.object({
  gold: numberish.optional(),
  silver: numberish.optional(),
});

// बिल पर छपने वाली हर चीज़ — सब optional, जो भेजा जाएगा वही बदलेगा
export const settingsSchema = z.object({
  gst: numberish.optional(),
  shopName: z.string().optional(),
  shopNameHindi: z.string().optional(),
  logoUrl: z.string().optional(),
  nameSuffix: z.string().optional(),
  blessing: z.string().optional(),
  tagline: z.string().optional(),
  propName: z.string().optional(),
  shopAddress: z.string().optional(),
  shopPhone: z.string().optional(),
  shopPhone2: z.string().optional(),
  gstin: z.string().optional(),
  jurisdiction: z.string().optional(),
  categories: z.string().optional(),
  hsn: z.string().optional(),
  hallmarkLabel: z.string().optional(),
  footerNote: z.string().optional(),
  billTemplate: z.enum(['slip', 'simple']).optional(),
  terms: z.array(z.string()).optional(),
  websiteUrl: z.string().max(200).optional(), // बिल के QR से बिल-जाँच वाला पेज इसी website पर खुलता है
});

export const customerCreateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'नाम ज़रूरी है'),
  phone: z.string().default(''),
  address: z.string().default(''),
  openingBalance: numberish.optional(),
});

export const customerUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

export const ledgerSchema = z.object({
  date: dateStr.optional(),
  note: z.string().default(''),
  amount: numberish,
});

export const stockCreateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Item नाम ज़रूरी है'),
  category: z.string().default('Gold'),
  purity: z.string().default(''),
  weight: numberish.default(0),
  qty: numberish.default(0),
});

// ध्यान: update के लिए .partial() इस्तेमाल नहीं कर सकते — zod में .default() partial
// करने के बाद भी लागू रहता है, यानी सिर्फ { qty } भेजने पर weight/purity चुपचाप
// खाली हो जाते. इसलिए update schema अलग से, बिना किसी default के.
export const stockUpdateSchema = z.object({
  name: z.string().min(1, 'Item नाम ज़रूरी है').optional(),
  category: z.string().optional(),
  purity: z.string().optional(),
  weight: numberish.optional(),
  qty: numberish.optional(),
});

export const offerCreateSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'Offer का title ज़रूरी है'),
  discountPercent: numberish.default(0),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  description: z.string().default(''),
});

// stockUpdateSchema वाली वजह से यहाँ भी default नहीं रखे
export const offerUpdateSchema = z.object({
  title: z.string().min(1, 'Offer का title ज़रूरी है').optional(),
  discountPercent: numberish.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  description: z.string().optional(),
});

// Purity % में (22K = 91.6). 916 जैसी गलती पर बिल 10 गुना न बन जाए — stock और उधारी भी गलत चढ़ती
const purityPct = numberish.refine((v) => v > 0 && v <= 100, 'Purity 0 से 100% के बीच डालें (जैसे 22K = 91.6)');

export const invoiceItemSchema = z.object({
  name: z.string().min(1, 'Item नाम ज़रूरी है'),
  metal: z.enum(['Gold', 'Silver']).default('Gold'),
  weight: numberish,
  purity: purityPct.default(100),
  makingType: z.enum(['perg', 'pct', 'flat']).default('flat'),
  making: numberish.default(0),
});

export const invoiceCreateSchema = z.object({
  type: z.enum(['sale', 'purchase']).default('sale'),
  gstMode: z.enum(['gst', 'nongst']).default('gst'),
  date: dateStr.optional(),
  customerId: z.string().optional().nullable(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1, 'कम से कम एक Item ज़रूरी है'),
  exchange: z
    .object({
      weight: numberish.default(0),
      purity: numberish.default(0),
      deduct: numberish.default(0),
      rate: numberish.default(0),
    })
    .refine((ex) => !(ex.weight > 0) || (ex.purity > 0 && ex.purity <= 100), {
      message: 'पुराने सोने की Purity 0 से 100% के बीच डालें', path: ['purity'],
    })
    .refine((ex) => ex.deduct >= 0 && ex.deduct <= 100, {
      message: 'कटौती 0 से 100% के बीच डालें', path: ['deduct'],
    })
    .optional(),
  discountType: z.enum(['flat', 'pct']).default('flat'),
  discountValue: numberish.default(0),
  gstPct: numberish.optional(),
  paid: numberish.default(0),
});

export const paymentSchema = z.object({
  amount: numberish,
  note: z.string().optional(),
});

export const restoreSchema = z.object({
  rates: z.object({}).passthrough().optional(),
  settings: z.object({}).passthrough().optional(),
  customers: z.array(z.object({}).passthrough()).optional(),
  stock: z.array(z.object({}).passthrough()).optional(),
  invoices: z.array(z.object({}).passthrough()).optional(),
  offers: z.array(z.object({}).passthrough()).optional(),
});

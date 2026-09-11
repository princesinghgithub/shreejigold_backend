import { Product, ProductImage } from '../models/index.js';
import { uid, num } from '../lib/helpers.js';
import { badRequest, notFound } from '../lib/errors.js';
import { getRates } from './shop.js';
import { WEBSITE_CATALOG } from '../seeds/website-catalog.js';

/**
 * Website का catalog — admin panel से design, फोटो और कीमत डलती है,
 * website /api/public/catalog से पढ़ती है.
 */

const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const TEXT_FIELDS = ['name', 'type', 'metal', 'wearer', 'occasion', 'description', 'imageUrl'];

// DB दस्तावेज़ -> admin/website shape. अपलोड वाली फोटो का पता /api/... से शुरू होता है —
// हर ऐप उसके आगे अपने backend का पता जोड़ लेता है.
function toProduct(d) {
  if (!d) return null;
  return {
    id: d._id,
    name: d.name || '',
    type: d.type || '',
    metal: d.metal || '',
    wearer: d.wearer || '',
    occasion: d.occasion || '',
    price: num(d.price),
    weight: num(d.weight),
    description: d.description || '',
    image: d.imageVersion ? `/api/public/products/${d._id}/image?v=${d.imageVersion}` : (d.imageUrl || ''),
    imageUrl: d.imageUrl || '',
    hasUpload: Boolean(d.imageVersion),
    isNew: Boolean(d.newIn),
    bestseller: Boolean(d.bestseller),
    active: d.active !== false,
    order: num(d.order),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

/** भेजे गए fields में से वही जो बदलने हैं */
function pickFields(input) {
  const set = {};
  for (const k of TEXT_FIELDS) if (input[k] !== undefined) set[k] = String(input[k]).trim();
  if (input.price !== undefined) set.price = Math.max(0, num(input.price));
  if (input.weight !== undefined) set.weight = Math.max(0, num(input.weight));
  if (input.order !== undefined) set.order = num(input.order);
  if (input.isNew !== undefined) set.newIn = Boolean(input.isNew);
  if (input.bestseller !== undefined) set.bestseller = Boolean(input.bestseller);
  if (input.active !== undefined) set.active = Boolean(input.active);
  return set;
}

/** "data:image/jpeg;base64,..." -> { contentType, data } */
function parseImage(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m) throw badRequest('फोटो JPG, PNG या WEBP होनी चाहिए');
  const data = Buffer.from(m[2], 'base64');
  if (data.length > MAX_IMAGE_BYTES) throw badRequest('फोटो 1.5 MB से छोटी रखें');
  return { contentType: m[1], data };
}

async function saveImage(id, image) {
  await ProductImage.replaceOne({ _id: id }, { _id: id, ...image }, { upsert: true });
  return Date.now();
}

// नए डाले designs (order 0) सबसे ऊपर, फिर website के पुराने designs अपने क्रम में
export async function listProducts({ activeOnly = false } = {}) {
  const rows = await Product.find(activeOnly ? { active: true } : {})
    .sort({ order: 1, createdAt: -1 })
    .lean();
  return rows.map(toProduct);
}

export async function createProduct(input) {
  const set = pickFields(input);
  if (!set.name) throw badRequest('Design का नाम ज़रूरी है');
  // फोटो पहले जाँचें — गलत हो तो कुछ भी सेव न हो
  const image = input.imageData ? parseImage(input.imageData) : null;

  const id = uid('prd');
  const now = new Date().toISOString();
  const doc = { _id: id, ...set, imageVersion: 0, createdAt: now, updatedAt: now };
  if (image) doc.imageVersion = await saveImage(id, image);
  const saved = await Product.create(doc);
  return toProduct(saved.toObject());
}

export async function updateProduct(id, input) {
  if (!(await Product.exists({ _id: id }))) throw notFound('Design नहीं मिला');
  const set = pickFields(input);
  if (set.name === '') throw badRequest('Design का नाम ज़रूरी है');

  if (input.imageData) {
    set.imageVersion = await saveImage(id, parseImage(input.imageData));
  } else if (input.removeImage) {
    await ProductImage.deleteOne({ _id: id });
    set.imageVersion = 0;
  }
  set.updatedAt = new Date().toISOString();

  const d = await Product.findOneAndUpdate({ _id: id }, { $set: set }, { returnDocument: 'after' }).lean();
  if (!d) throw notFound('Design नहीं मिला');
  return toProduct(d);
}

export async function deleteProduct(id) {
  const res = await Product.deleteOne({ _id: id });
  if (res.deletedCount === 0) throw notFound('Design नहीं मिला');
  await ProductImage.deleteOne({ _id: id });
  return { id, deleted: true };
}

/**
 * Website के पहले से बने designs (SG0001…) catalog में डालें. जो पहले से मौजूद हैं उन्हें
 * छूता नहीं — admin के बदलाव (कीमत, फोटो, छिपाना) बचे रहते हैं, और गलती से हटाए
 * designs इसी से वापस आ जाते हैं.
 */
export async function importWebsiteDefaults() {
  const now = new Date().toISOString();
  const res = await Product.bulkWrite(WEBSITE_CATALOG.map((p) => ({
    updateOne: {
      filter: { _id: p.id },
      update: {
        $setOnInsert: {
          name: p.name,
          type: p.type,
          metal: p.metal,
          wearer: p.wearer,
          occasion: p.occasion,
          price: 0,
          weight: 0,
          description: '',
          imageUrl: p.image,
          imageVersion: 0,
          newIn: Boolean(p.isNew),
          bestseller: Boolean(p.bestseller),
          active: true,
          order: p.order,
          createdAt: now,
          updatedAt: now,
        },
      },
      upsert: true,
    },
  })), { ordered: false });
  const added = res.upsertedCount || 0;
  return { added, alreadyThere: WEBSITE_CATALOG.length - added, total: WEBSITE_CATALOG.length };
}

export async function getProductImage(id) {
  const d = await ProductImage.findById(id);
  return d ? { contentType: d.contentType, data: d.data } : null;
}

/** Website के लिए — सिर्फ दिखने वाले designs, और दुकान का आज का भाव */
export async function publicCatalog() {
  const [products, rates] = await Promise.all([listProducts({ activeOnly: true }), getRates()]);
  const gold = num(rates.gold); // admin में 24K (999) का प्रति ग्राम भाव
  return {
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      metal: p.metal,
      wearer: p.wearer,
      occasion: p.occasion,
      price: p.price,
      weight: p.weight,
      description: p.description,
      image: p.image,
      isNew: p.isNew,
      bestseller: p.bestseller,
    })),
    rates: {
      k24: Math.round(gold),
      k22: Math.round(gold * 0.916),
      silver: Math.round(num(rates.silver)),
      updatedAt: rates.updatedAt,
    },
  };
}

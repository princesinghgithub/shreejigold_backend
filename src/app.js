import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config.js';
import { connectDB } from './db/index.js';
import { requireAuth, requireAdmin } from './middleware/auth.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { snapshotIfNeeded } from './services/backup.js';
import { asyncHandler } from './lib/helpers.js';

import authRoutes from './routes/auth.routes.js';
import shopRoutes from './routes/shop.routes.js';
import customersRoutes from './routes/customers.routes.js';
import stockRoutes from './routes/stock.routes.js';
import invoicesRoutes from './routes/invoices.routes.js';
import offersRoutes from './routes/offers.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import backupRoutes from './routes/backup.routes.js';
import catalogRoutes from './routes/catalog.routes.js';
import leadsRoutes from './routes/leads.routes.js';
import usersRoutes from './routes/users.routes.js';
import searchRoutes from './routes/search.routes.js';
import publicRoutes from './routes/public.routes.js';

// दुकान का अपना नेटवर्क — 192.168.x.x, 10.x.x.x, 172.16–31.x.x और खुद यही मशीन
const LAN = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

function corsOriginCheck(origin, cb) {
  // बिना origin वाली request (curl, मोबाइल ऐप) रोकनी नहीं
  if (!origin) return cb(null, true);
  if (config.corsOrigin.includes('*')) return cb(null, true);
  if (config.corsOrigin.includes(origin)) return cb(null, true);
  if (config.corsAllowLan && LAN.test(origin)) return cb(null, true);
  return cb(null, false);
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  // Vercel के पीछे असली IP x-forwarded-for में आता है. यह न करें तो लॉगिन की गलत
  // कोशिशें सबकी एक ही गिनती में जुड़ती हैं — किसी एक की गलती से दुकान का लॉगिन रुक जाता.
  if (process.env.VERCEL) app.set('trust proxy', true);

  // छोटे सुरक्षा headers — ऐप किसी दूसरी साइट के iframe में खोलकर धोखा न दिया जा सके
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  // /api/public — website (दूसरे domain) से catalog पढ़ना और enquiry भेजना, सबके लिए खुला.
  // बाकी सारी API सिर्फ ऐप के अपने पते (CORS_ORIGIN / दुकान का LAN) से.
  const publicCors = cors({ origin: true, methods: ['GET', 'POST'] });
  const appCors = cors({ origin: corsOriginCheck, credentials: true });
  app.use((req, res, next) => (req.path.startsWith('/api/public/') ? publicCors : appCors)(req, res, next));

  // backup restore की फाइल और design की फोटो बड़ी हो सकती है
  app.use(express.json({ limit: '25mb' }));
  if (config.logRequests) app.use(morgan('dev'));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'soniji-backend', time: new Date().toISOString() });
  });

  // इसके नीचे हर API को डेटाबेस चाहिए. कनेक्शन पहली request पर बनता है
  // और फिर वही चलता रहता है (Vercel के गर्म डिब्बे में भी).
  app.use('/api', (_req, _res, next) => {
    connectDB().then(() => next(), next);
  });

  // रोज़ का अपने आप backup — Vercel Cron इसे दिन में एक बार बुलाता है.
  // बिना लॉगिन चलता है, इसलिए CRON_SECRET से ही खुलता है.
  app.get('/api/cron/backup', asyncHandler(async (req, res) => {
    const given = (req.get('authorization') || '').replace(/^Bearer /, '')
      || req.query.key || '';
    if (!config.cronSecret || given !== config.cronSecret) {
      return res.status(401).json({ error: 'गलत key' });
    }
    return res.json(await snapshotIfNeeded());
  }));

  app.use('/api/public', publicRoutes);
  app.use('/api/auth', authRoutes);

  // इसके नीचे सब कुछ लॉगिन के बाद ही (मालिक, admin, staff)
  app.use('/api/shop', requireAuth, shopRoutes);
  app.use('/api/customers', requireAuth, customersRoutes);
  app.use('/api/search', requireAuth, searchRoutes);
  app.use('/api/stock', requireAuth, stockRoutes);
  app.use('/api/invoices', requireAuth, invoicesRoutes);
  app.use('/api/offers', requireAuth, offersRoutes);
  app.use('/api/reports', requireAuth, reportsRoutes);
  app.use('/api/backup', requireAuth, backupRoutes);
  app.use('/api/catalog', requireAuth, catalogRoutes);
  app.use('/api/leads', requireAuth, leadsRoutes);
  // दुकान के users बनाना / बदलना — सिर्फ मालिक या Admin
  app.use('/api/users', requireAuth, requireAdmin, usersRoutes);

  // ---- बना हुआ फ्रंटएंड, अगर मौजूद हो ----
  // फ्रंटएंड में `npm run build` चलाने के बाद पूरा ऐप इसी सर्वर से खुल जाता है:
  // http://<कंप्यूटर का IP>:4000 — तब न दूसरा सर्वर चाहिए, न CORS की झंझट.
  const indexFile = path.join(config.webDir, 'index.html');
  if (fs.existsSync(indexFile)) {
    app.use(express.static(config.webDir, { index: false }));
    // ऐप के अंदर के पते (जो /api से शुरू नहीं होते) — सबका जवाब index.html
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(indexFile));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

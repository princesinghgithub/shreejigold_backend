import { ZodError } from 'zod';
import { ApiError } from '../lib/errors.js';
import { config } from '../config.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'यह route मौजूद नहीं है: ' + req.method + ' ' + req.originalUrl });
}

// eslint-disable-next-line no-unused-vars -- Express 4 args से ही error handler पहचानता है
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'भेजा गया data सही नहीं है',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON सही नहीं है' });
  }
  // MongoDB duplicate key (जैसे वही id या barcode दोबारा)
  if (err?.code === 11000) {
    return res.status(409).json({ error: 'यह record पहले से मौजूद है' });
  }
  // Mongoose model के नियम से मेल न खाए
  if (err?.name === 'ValidationError' || err?.name === 'CastError') {
    return res.status(400).json({ error: 'भेजा गया data सही नहीं है', details: err.message });
  }

  console.error('[error]', err);
  res.status(500).json({
    error: 'सर्वर में गड़बड़ी हुई',
    details: config.isProd ? undefined : String(err?.message || err),
  });
}

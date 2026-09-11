import { verifyToken, currentUser } from '../services/auth.js';
import { unauthorized, forbidden } from '../lib/errors.js';

/**
 * हर protected route पर Authorization: Bearer <token> ज़रूरी.
 * token वाले user की ताज़ा जानकारी (role वगैरह) req.user में — staff बंद/हटाया गया हो
 * या उसका पासवर्ड बदला हो तो पुराना token यहीं रुक जाता है.
 */
export async function requireAuth(req, _res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return next(unauthorized('लॉगिन ज़रूरी है — Authorization header नहीं मिला'));
  let user;
  try {
    user = await currentUser(verifyToken(token));
  } catch (err) {
    return next(err);
  }
  req.user = user;
  return next();
}

export const isAdminRole = (user) => Boolean(user && (user.role === 'owner' || user.role === 'admin'));

/** सिर्फ मालिक या Admin — users बनाना, दुकान की settings, सारा डेटा मिटाना / restore */
export function requireAdmin(req, _res, next) {
  return isAdminRole(req.user) ? next() : next(forbidden('यह काम सिर्फ मालिक या Admin कर सकते हैं'));
}

/** सिर्फ मालिक का अपना खाता — यूज़र ID बदलना, सुरक्षा सवाल */
export function requireOwner(req, _res, next) {
  return req.user && req.user.role === 'owner'
    ? next()
    : next(forbidden('यह सिर्फ मालिक के खाते के लिए है — अपना पासवर्ड आप बदल सकते हैं'));
}

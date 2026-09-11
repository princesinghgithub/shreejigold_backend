import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import {
  setupSchema, loginSchema, changePasswordSchema,
  changeUserIdSchema, securityQuestionSchema, forgotResetSchema,
  forgotOtpSchema, forgotOtpVerifySchema,
} from '../lib/schemas.js';
import * as auth from '../services/auth.js';
import { asyncHandler } from '../lib/helpers.js';
import { rateLimit, clearRateLimit } from '../middleware/rateLimit.js';
import { config } from '../config.js';

const router = Router();

const loginLimit = rateLimit({
  windowMs: config.loginWindowMinutes * 60 * 1000,
  max: config.loginMaxAttempts,
  message: 'बहुत ज़्यादा गलत कोशिशें — थोड़ी देर बाद कोशिश करें',
});

// खाता बना है या नहीं — Login स्क्रीन इससे तय करती है कि क्या दिखाना है
router.get('/status', asyncHandler(async (_req, res) => {
  const acc = await auth.getAccount();
  res.json({
    isSetup: Boolean(acc),
    hasSecurityQuestion: Boolean(acc && acc.question),
  });
}));

router.post('/setup', loginLimit, validate(setupSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await auth.setup(req.body));
}));

// मालिक और दुकान के users (staff / admin) — सब यहीं से
router.post('/login', loginLimit, validate(loginSchema), asyncHandler(async (req, res) => {
  const result = await auth.login(req.body.userId, req.body.password);
  clearRateLimit(req); // सही निकला — गिनती रीसेट
  res.json(result);
}));

// कौन लॉगिन है: { sub, name, role: owner | admin | staff }
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ---- पासवर्ड भूल गए (लॉगिन के बिना, सिर्फ मालिक का खाता) ----

router.get('/forgot', loginLimit, asyncHandler(async (req, res) => {
  res.json(await auth.getQuestion(req.query.userId));
}));

router.post('/forgot', loginLimit, validate(forgotResetSchema), asyncHandler(async (req, res) => {
  const result = await auth.resetWithAnswer(req.body.userId, req.body.answer, req.body.newPassword);
  clearRateLimit(req);
  res.json(result);
}));

// यूज़र ID (email) पर OTP भेजना, फिर OTP से नया पासवर्ड
router.post('/forgot/otp', loginLimit, validate(forgotOtpSchema), asyncHandler(async (req, res) => {
  res.json(await auth.sendResetOtp(req.body.userId));
}));

router.post('/forgot/otp/verify', loginLimit, validate(forgotOtpVerifySchema), asyncHandler(async (req, res) => {
  const result = await auth.resetWithOtp(req.body.userId, req.body.otp, req.body.newPassword);
  clearRateLimit(req);
  res.json(result);
}));

// ---- लॉगिन के बाद ----

// अपना पासवर्ड — मालिक, admin, staff सब
router.post('/change-password', requireAuth, validate(changePasswordSchema), asyncHandler(async (req, res) => {
  res.json(await auth.changePassword(req.body.oldPassword, req.body.newPassword, req.user));
}));

// मालिक का यूज़र ID और सुरक्षा सवाल — सिर्फ मालिक
router.post('/change-userid', requireAuth, requireOwner, validate(changeUserIdSchema), asyncHandler(async (req, res) => {
  res.json(await auth.changeUserId(req.body.password, req.body.newUserId));
}));

router.post('/security-question', requireAuth, requireOwner, validate(securityQuestionSchema), asyncHandler(async (req, res) => {
  res.json(await auth.setSecurityQuestion(req.body.password, req.body.question, req.body.answer));
}));

export default router;

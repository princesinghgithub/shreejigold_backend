import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { uid } from '../lib/helpers.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { getAccount, checkUserId, checkPassword, norm } from './auth.js';

export const ROLES = ['admin', 'staff'];

function toUser(d) {
  return {
    id: d._id,
    userId: d.userIdDisplay || d.userId,
    name: d.name || '',
    role: d.role,
    active: d.active !== false,
    lastLoginAt: d.lastLoginAt || null,
    createdAt: d.createdAt,
  };
}

/** यूज़र ID किसी और का (मालिक या दूसरे user का) न हो */
async function assertFreeUserId(id, exceptId = null) {
  const acc = await getAccount();
  if (acc && acc.userId === norm(id)) throw conflict('यह यूज़र ID पहले से किसी का है');
  const other = await User.findOne({ userId: norm(id) }, { _id: 1 }).lean();
  if (other && other._id !== exceptId) throw conflict('यह यूज़र ID पहले से किसी का है');
}

export async function listUsers() {
  const [acc, rows] = await Promise.all([getAccount(), User.find({}).sort({ createdAt: 1 }).lean()]);
  return {
    owner: acc ? { userId: acc.userIdDisplay, role: 'owner' } : null,
    users: rows.map(toUser),
  };
}

export async function createUser({ name, userId, password, role }) {
  const id = checkUserId(userId);
  const pw = checkPassword(password);
  await assertFreeUserId(id);
  const now = new Date().toISOString();
  const doc = {
    _id: uid('usr'),
    userId: norm(id),
    userIdDisplay: id,
    name: String(name || '').trim(),
    passHash: bcrypt.hashSync(pw, 10),
    role: ROLES.includes(role) ? role : 'staff',
    active: true,
    tokenVersion: 0,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await User.create(doc);
  } catch (err) {
    if (err.code === 11000) throw conflict('यह यूज़र ID पहले से किसी का है');
    throw err;
  }
  return toUser(doc);
}

/** नाम, यूज़र ID, भूमिका, चालू/बंद, या नया पासवर्ड (reset). actor = जो बदल रहा है */
export async function updateUser(id, input, actor = null) {
  const d = await User.findById(id).lean();
  if (!d) throw notFound('User नहीं मिला');
  const self = actor && actor.uid === id;
  if (self && (input.active === false || input.role === 'staff')) {
    throw badRequest('अपना ही खाता बंद या Staff नहीं कर सकते — मालिक से कहें');
  }

  const set = { updatedAt: new Date().toISOString() };
  let logoutOld = false; // पुराने लॉगिन बेकार करने हैं?
  if (input.name !== undefined) set.name = String(input.name).trim();
  if (input.role !== undefined) set.role = ROLES.includes(input.role) ? input.role : d.role;
  if (input.active !== undefined) {
    set.active = Boolean(input.active);
    if (!set.active) logoutOld = true;
  }
  if (input.userId !== undefined && norm(input.userId) !== d.userId) {
    const newId = checkUserId(input.userId);
    await assertFreeUserId(newId, id);
    set.userId = norm(newId);
    set.userIdDisplay = newId;
    logoutOld = true;
  }
  if (input.password) {
    set.passHash = bcrypt.hashSync(checkPassword(input.password), 10);
    logoutOld = true;
  }

  const update = logoutOld ? { $set: set, $inc: { tokenVersion: 1 } } : { $set: set };
  const saved = await User.findOneAndUpdate({ _id: id }, update, { returnDocument: 'after' }).lean();
  return toUser(saved);
}

export async function deleteUser(id, actor = null) {
  if (actor && actor.uid === id) throw badRequest('अपना ही खाता खुद नहीं हटा सकते');
  const res = await User.deleteOne({ _id: id });
  if (res.deletedCount === 0) throw notFound('User नहीं मिला');
  return { id, deleted: true };
}

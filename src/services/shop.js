import { getMeta, setMeta, META, DEFAULT_RATES, DEFAULT_SETTINGS } from '../db/index.js';
import { num } from '../lib/helpers.js';

export async function getRates() {
  return { ...DEFAULT_RATES, ...((await getMeta(META.RATES)) || {}) };
}

export async function updateRates(input) {
  const current = await getRates();
  const next = {
    gold: input.gold !== undefined ? num(input.gold) : current.gold,
    silver: input.silver !== undefined ? num(input.silver) : current.silver,
    updatedAt: new Date().toISOString(),
  };
  return setMeta(META.RATES, next);
}

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...((await getMeta(META.SETTINGS)) || {}) };
}

export async function updateSettings(input) {
  const current = await getSettings();
  const next = {
    ...current,
    ...input,
    gst: input.gst !== undefined ? num(input.gst, current.gst) : current.gst,
  };
  return setMeta(META.SETTINGS, next);
}

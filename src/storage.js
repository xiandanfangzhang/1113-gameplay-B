import { CONFIG_VERSION } from './constants.js';
import { normalizeLevel, validateLevel } from './validation.js';

export const STORAGE_PREFIX = `color-transit:v${CONFIG_VERSION}:`;

export function saveDraft(storage, level) {
  const result = validateLevel(level);
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  storage.setItem(STORAGE_PREFIX + level.id, JSON.stringify({ version: CONFIG_VERSION, level: normalizeLevel(level) }));
}

export function loadDraft(storage, id) {
  const raw = storage.getItem(STORAGE_PREFIX + id) ?? storage.getItem(`color-transit:v4:${id}`);
  if (!raw) return null;
  try {
    const document = JSON.parse(raw);
    if (![4, CONFIG_VERSION].includes(document.version) || document.level?.id !== id) return null;
    if (validateLevel(document.level).errors.length) return null;
    return normalizeLevel(document.level);
  } catch { return null; }
}

export function removeDraft(storage, id) {
  storage.removeItem(STORAGE_PREFIX + id);
  storage.removeItem(`color-transit:v4:${id}`);
}

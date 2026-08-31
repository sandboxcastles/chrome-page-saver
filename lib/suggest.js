/**
 * Remembers which list you last used for a given site so the popup can
 * pre-select it. Filing a page should take one keystroke, not a decision.
 */

const DOMAIN_MAP_KEY = 'domainToList';
const SETTINGS_KEY = 'settings';

const DEFAULT_SETTINGS = {
  closeTabAfterSave: false,
};

export function domainOf(url) {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export async function rememberChoice(url, listId) {
  const domain = domainOf(url);
  if (!domain) return;

  const stored = await chrome.storage.local.get(DOMAIN_MAP_KEY);
  const map = stored[DOMAIN_MAP_KEY] ?? {};
  map[domain] = listId;
  await chrome.storage.local.set({ [DOMAIN_MAP_KEY]: map });
}

/** Returns a list id only if that list still exists in the given snapshot. */
export async function suggestListId(url, snapshot) {
  const domain = domainOf(url);
  if (!domain) return null;

  const stored = await chrome.storage.local.get(DOMAIN_MAP_KEY);
  const listId = (stored[DOMAIN_MAP_KEY] ?? {})[domain];
  if (!listId) return null;

  return snapshot.lists.some((list) => list.id === listId) ? listId : null;
}

export async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] ?? {}) };
}

export async function setSetting(key, value) {
  const settings = await getSettings();
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...settings, [key]: value } });
}

export function faviconUrl(pageUrl, size = 32) {
  const target = new URL(chrome.runtime.getURL('/_favicon/'));
  target.searchParams.set('pageUrl', pageUrl);
  target.searchParams.set('size', String(size));
  return target.toString();
}

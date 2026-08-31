import {
  DEFAULT_LIST_TITLE,
  addToList,
  findSaved,
  getSnapshot,
  saveToNamedList,
} from './lib/store.js';
import { faviconUrl, getSettings, rememberChoice, setSetting, suggestListId } from './lib/suggest.js';

const els = {
  icon: document.getElementById('page-icon'),
  title: document.getElementById('page-title'),
  url: document.getElementById('page-url'),
  notice: document.getElementById('saved-notice'),
  input: document.getElementById('list-input'),
  options: document.getElementById('list-options'),
  closeTab: document.getElementById('close-tab'),
  manage: document.getElementById('manage'),
  status: document.getElementById('status'),
};

const state = {
  tab: null,
  snapshot: { lists: [] },
  visible: [],
  activeIndex: 0,
};

function setStatus(message, tone = 'info') {
  els.status.textContent = message;
  els.status.dataset.tone = tone;
}

/**
 * Options are the filtered lists, plus a trailing "create" row when the typed
 * name does not already exist. That makes new lists a byproduct of saving.
 */
function computeOptions(query) {
  const trimmed = query.trim();
  const needle = trimmed.toLowerCase();

  const matches = state.snapshot.lists.filter((list) =>
    list.title.toLowerCase().includes(needle)
  );

  const options = matches.map((list) => ({
    kind: 'existing',
    id: list.id,
    label: list.title,
    meta: `${list.items.length}`,
  }));

  const exists = state.snapshot.lists.some(
    (list) => list.title.toLowerCase() === needle
  );
  if (trimmed && !exists) {
    options.push({ kind: 'create', label: trimmed, meta: 'new list' });
  }
  if (options.length === 0) {
    options.push({ kind: 'create', label: DEFAULT_LIST_TITLE, meta: 'new list' });
  }

  return options;
}

function render() {
  els.options.replaceChildren();

  state.visible.forEach((option, index) => {
    const li = document.createElement('li');
    li.id = `option-${index}`;
    li.className = option.kind === 'create' ? 'option option--create' : 'option';
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(index === state.activeIndex));

    const name = document.createElement('span');
    name.className = 'option__name';
    name.textContent = option.kind === 'create' ? `Create “${option.label}”` : option.label;

    const meta = document.createElement('span');
    meta.className = 'option__meta';
    meta.textContent = option.meta;

    li.append(name, meta);
    // Pointer users get the same commit path as keyboard users.
    li.addEventListener('mousedown', (event) => {
      event.preventDefault();
      commit(index);
    });
    els.options.append(li);
  });

  const active = state.visible[state.activeIndex];
  els.input.setAttribute(
    'aria-activedescendant',
    active ? `option-${state.activeIndex}` : ''
  );
  els.options.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

function refreshOptions(query) {
  state.visible = computeOptions(query);
  state.activeIndex = 0;
  render();
}

function moveActive(delta) {
  if (state.visible.length === 0) return;
  const next = (state.activeIndex + delta + state.visible.length) % state.visible.length;
  state.activeIndex = next;
  render();
}

async function commit(index = state.activeIndex) {
  const option = state.visible[index];
  if (!option || !state.tab?.url) return;

  els.input.disabled = true;
  setStatus('Saving…');

  try {
    const page = { title: state.tab.title, url: state.tab.url };
    const result =
      option.kind === 'create'
        ? await saveToNamedList(option.label, page)
        : { ...(await addToList(option.id, page)), listId: option.id };

    await rememberChoice(state.tab.url, result.listId);

    setStatus(
      result.wasDuplicate
        ? `Already in “${option.label}”.`
        : `Saved to “${option.label}”.`
    );

    if (els.closeTab.checked && typeof state.tab.id === 'number') {
      await chrome.tabs.remove(state.tab.id);
    }
    // Let the status line render before the popup tears itself down.
    setTimeout(() => window.close(), 350);
  } catch (error) {
    els.input.disabled = false;
    els.input.focus();
    setStatus(error instanceof Error ? error.message : 'Could not save that page.', 'error');
  }
}

function onKeyDown(event) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      moveActive(1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      moveActive(-1);
      break;
    case 'Enter':
      event.preventDefault();
      commit();
      break;
    case 'Escape':
      window.close();
      break;
    default:
      break;
  }
}

async function init() {
  els.input.addEventListener('input', () => refreshOptions(els.input.value));
  els.input.addEventListener('keydown', onKeyDown);
  els.manage.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('manage.html') });
    window.close();
  });
  els.closeTab.addEventListener('change', () => {
    setSetting('closeTabAfterSave', els.closeTab.checked);
  });

  const [[tab], snapshot, settings] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }),
    getSnapshot(),
    getSettings(),
  ]);

  state.tab = tab ?? null;
  state.snapshot = snapshot;
  els.closeTab.checked = settings.closeTabAfterSave;

  if (!state.tab?.url) {
    els.title.textContent = 'No page to save';
    els.input.disabled = true;
    setStatus('This tab has no address that can be saved.', 'error');
    return;
  }

  els.title.textContent = state.tab.title || state.tab.url;
  els.url.textContent = state.tab.url;
  els.icon.src = faviconUrl(state.tab.url);

  const already = findSaved(snapshot, state.tab.url);
  if (already.length > 0) {
    els.notice.hidden = false;
    els.notice.textContent = `Already saved in ${already
      .map((entry) => `“${entry.listTitle}”`)
      .join(', ')}.`;
  }

  refreshOptions('');

  // Pre-select the list last used for this site so Enter alone is enough.
  const suggested = await suggestListId(state.tab.url, snapshot);
  if (suggested) {
    const index = state.visible.findIndex(
      (option) => option.kind === 'existing' && option.id === suggested
    );
    if (index >= 0) {
      state.activeIndex = index;
      render();
      const name = state.visible[index].label;
      setStatus(`Suggested “${name}” based on this site.`);
    }
  }

  els.input.focus();
}

init();

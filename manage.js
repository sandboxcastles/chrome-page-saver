import {
  createList,
  exportSnapshot,
  getSnapshot,
  removeItem,
  removeList,
  renameList,
} from './lib/store.js';
import { domainOf, faviconUrl } from './lib/suggest.js';

const els = {
  search: document.getElementById('search'),
  newList: document.getElementById('new-list'),
  exportBtn: document.getElementById('export'),
  lists: document.getElementById('lists'),
  status: document.getElementById('status'),
  template: document.getElementById('list-template'),
};

let snapshot = { lists: [] };

function setStatus(message, tone = 'info') {
  els.status.textContent = message;
  els.status.dataset.tone = tone;
}

/** A list survives filtering if its name matches, or any of its items do. */
function filterLists(query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return snapshot.lists;

  return snapshot.lists
    .map((list) => {
      if (list.title.toLowerCase().includes(needle)) return list;
      const items = list.items.filter(
        (item) =>
          item.title.toLowerCase().includes(needle) ||
          item.url.toLowerCase().includes(needle)
      );
      return items.length > 0 ? { ...list, items } : null;
    })
    .filter((list) => list !== null);
}

function buildItem(item, listTitle) {
  const li = document.createElement('li');
  li.className = 'item';

  const icon = document.createElement('img');
  icon.className = 'item__icon';
  icon.width = 16;
  icon.height = 16;
  icon.alt = '';
  icon.src = faviconUrl(item.url);

  const link = document.createElement('a');
  link.className = 'item__link';
  link.href = item.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  const title = document.createElement('span');
  title.className = 'item__title';
  title.textContent = item.title || item.url;

  const host = document.createElement('span');
  host.className = 'item__host';
  host.textContent = domainOf(item.url);

  link.append(title, host);

  const remove = document.createElement('button');
  remove.className = 'item__remove';
  remove.type = 'button';
  remove.textContent = '\u00d7';
  // Icon-only control, so the name has to come from the label.
  remove.setAttribute('aria-label', `Remove ${item.title || item.url} from ${listTitle}`);
  remove.addEventListener('click', async () => {
    try {
      await removeItem(item.id);
      setStatus('Removed.');
      await refresh();
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });

  li.append(icon, link, remove);
  return li;
}

function buildCard(list) {
  const fragment = els.template.content.cloneNode(true);
  const card = fragment.querySelector('.card');
  const heading = fragment.querySelector('.card__title');
  const items = fragment.querySelector('.items');

  heading.textContent = `${list.title} (${list.items.length})`;
  items.setAttribute('aria-label', `Pages in ${list.title}`);

  if (list.items.length === 0) {
    const li = document.createElement('li');
    li.className = 'item';
    li.textContent = 'No pages yet.';
    items.append(li);
  } else {
    for (const item of list.items) {
      items.append(buildItem(item, list.title));
    }
  }

  card.querySelector('[data-action="open-all"]').addEventListener('click', async () => {
    const window_ = await chrome.windows.create({ focused: true });
    for (const item of list.items) {
      await chrome.tabs.create({ windowId: window_.id, url: item.url, active: false });
    }
    setStatus(`Opened ${list.items.length} page(s) from “${list.title}”.`);
  });

  card.querySelector('[data-action="rename"]').addEventListener('click', async () => {
    const next = window.prompt(`Rename “${list.title}” to:`, list.title);
    if (next === null) return;
    try {
      await renameList(list.id, next);
      setStatus(`Renamed to “${next.trim()}”.`);
      await refresh();
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });

  card.querySelector('[data-action="delete-list"]').addEventListener('click', async () => {
    const confirmed = window.confirm(
      `Delete “${list.title}” and its ${list.items.length} page(s)? This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await removeList(list.id);
      setStatus(`Deleted “${list.title}”.`);
      await refresh();
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });

  return fragment;
}

function render() {
  const lists = filterLists(els.search.value);
  els.lists.replaceChildren();

  if (lists.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = snapshot.lists.length === 0
      ? 'No lists yet. Press the toolbar button on any page to save it.'
      : 'Nothing matches that search.';
    els.lists.append(empty);
    return;
  }

  for (const list of lists) {
    els.lists.append(buildCard(list));
  }
}

async function refresh() {
  snapshot = await getSnapshot();
  render();
}

async function promptForNewList() {
  const name = window.prompt('Name for the new list:');
  if (name === null) return;
  try {
    await createList(name);
    setStatus(`Created “${name.trim()}”.`);
    await refresh();
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function exportJson() {
  const data = await exportSnapshot();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `page-saver-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  setStatus('Exported.');
}

els.search.addEventListener('input', render);
els.newList.addEventListener('click', promptForNewList);
els.exportBtn.addEventListener('click', exportJson);

// Bookmark edits made elsewhere (or by the context menu) should show up here.
for (const event of [
  chrome.bookmarks.onCreated,
  chrome.bookmarks.onRemoved,
  chrome.bookmarks.onChanged,
]) {
  event.addListener(() => refresh());
}

await refresh();

if (new URLSearchParams(window.location.search).get('new') === '1') {
  await promptForNewList();
}

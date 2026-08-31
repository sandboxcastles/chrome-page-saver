import { addToList, ensureRoot, getSnapshot } from './lib/store.js';
import { rememberChoice } from './lib/suggest.js';

const PARENT_ID = 'save-to-list';
const NEW_LIST_ID = 'save-to-new-list';
const LIST_PREFIX = 'list:';

async function buildMenus() {
  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({
    id: PARENT_ID,
    title: 'Save page to list',
    contexts: ['page', 'link', 'selection'],
  });

  const { lists } = await getSnapshot();
  for (const list of lists) {
    chrome.contextMenus.create({
      id: `${LIST_PREFIX}${list.id}`,
      parentId: PARENT_ID,
      title: `${list.title} (${list.items.length})`,
      contexts: ['page', 'link', 'selection'],
    });
  }

  if (lists.length > 0) {
    chrome.contextMenus.create({
      id: 'separator',
      parentId: PARENT_ID,
      type: 'separator',
      contexts: ['page', 'link', 'selection'],
    });
  }

  chrome.contextMenus.create({
    id: NEW_LIST_ID,
    parentId: PARENT_ID,
    title: 'New list…',
    contexts: ['page', 'link', 'selection'],
  });
}

/**
 * Menu rebuilds are debounced because a single user action (deleting a list)
 * can emit several bookmark events.
 */
let rebuildTimer = null;
function scheduleRebuild() {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    buildMenus().catch((error) => console.error('Menu rebuild failed', error));
  }, 250);
}

chrome.runtime.onInstalled.addListener(() => {
  ensureRoot().then(buildMenus).catch((error) => console.error(error));
});
chrome.runtime.onStartup.addListener(() => scheduleRebuild());

for (const event of [
  chrome.bookmarks.onCreated,
  chrome.bookmarks.onRemoved,
  chrome.bookmarks.onChanged,
  chrome.bookmarks.onMoved,
]) {
  event.addListener(() => scheduleRebuild());
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  // A link right-click saves the link; anywhere else saves the page itself.
  const url = info.linkUrl ?? info.pageUrl ?? tab?.url;
  if (!url) return;
  const page = { title: info.linkUrl ? info.selectionText || info.linkUrl : tab?.title, url };

  try {
    if (typeof info.menuItemId !== 'string') return;

    if (info.menuItemId === NEW_LIST_ID) {
      // Naming needs UI, so hand off to the popup's manage page.
      await chrome.tabs.create({ url: chrome.runtime.getURL('manage.html?new=1') });
      return;
    }

    if (info.menuItemId.startsWith(LIST_PREFIX)) {
      const listId = info.menuItemId.slice(LIST_PREFIX.length);
      await addToList(listId, page);
      await rememberChoice(url, listId);
    }
  } catch (error) {
    console.error('Save failed', error);
  }
});
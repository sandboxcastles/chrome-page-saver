/**
 * Lists are bookmark folders nested under a single root folder. Using the
 * bookmarks API rather than chrome.storage means lists sync across devices,
 * have no quota ceiling, and outlive uninstalling the extension.
 */

const ROOT_TITLE = 'Page Saver';
const ROOT_ID_KEY = 'rootFolderId';
export const DEFAULT_LIST_TITLE = 'Unsorted';

/**
 * "Other Bookmarks" is id '2' on every current Chrome build, but the id is not
 * contractual, so fall back to locating it in the tree.
 */
async function resolveParentFolderId() {
  const [root] = await chrome.bookmarks.getTree();
  const children = root.children ?? [];
  const other = children.find((node) => node.id === '2' && !node.url);
  if (other) return other.id;

  const folders = children.filter((node) => !node.url);
  const preferred = folders[1] ?? folders[0];
  if (!preferred) throw new Error('No writable bookmark folder found.');
  return preferred.id;
}

async function readCachedRootId() {
  const stored = await chrome.storage.local.get(ROOT_ID_KEY);
  const id = stored[ROOT_ID_KEY];
  if (typeof id !== 'string') return null;

  // The user may have deleted the folder from the bookmark manager.
  try {
    const [node] = await chrome.bookmarks.get(id);
    return node && !node.url ? node.id : null;
  } catch {
    return null;
  }
}

export async function ensureRoot() {
  const cached = await readCachedRootId();
  if (cached) return cached;

  const parentId = await resolveParentFolderId();
  const siblings = await chrome.bookmarks.getChildren(parentId);
  const existing = siblings.find((node) => !node.url && node.title === ROOT_TITLE);
  const root = existing ?? (await chrome.bookmarks.create({ parentId, title: ROOT_TITLE }));

  await chrome.storage.local.set({ [ROOT_ID_KEY]: root.id });
  return root.id;
}

function toItem(node) {
  return { id: node.id, title: node.title, url: node.url, dateAdded: node.dateAdded ?? 0 };
}

/**
 * One traversal produces everything the UI needs: the lists, their contents,
 * and enough data to tell whether the current URL is already saved.
 */
export async function getSnapshot() {
  const rootId = await ensureRoot();
  const [tree] = await chrome.bookmarks.getSubTree(rootId);
  const children = tree.children ?? [];

  const lists = children
    .filter((node) => !node.url)
    .map((folder) => ({
      id: folder.id,
      title: folder.title,
      items: (folder.children ?? []).filter((child) => child.url).map(toItem),
    }));

  // Bookmarks dropped directly on the root (e.g. dragged in) still belong somewhere.
  const loose = children.filter((node) => node.url).map(toItem);
  if (loose.length > 0) {
    lists.unshift({ id: rootId, title: DEFAULT_LIST_TITLE, items: loose });
  }

  lists.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  return { rootId, lists };
}

export async function createList(title) {
  const clean = title.trim();
  if (!clean) throw new Error('A list needs a name.');

  const rootId = await ensureRoot();
  const siblings = await chrome.bookmarks.getChildren(rootId);
  const existing = siblings.find(
    (node) => !node.url && node.title.toLowerCase() === clean.toLowerCase()
  );
  if (existing) return existing.id;

  const created = await chrome.bookmarks.create({ parentId: rootId, title: clean });
  return created.id;
}

export async function addToList(listId, page) {
  if (!page?.url) throw new Error('That tab has no address to save.');

  const siblings = await chrome.bookmarks.getChildren(listId);
  const duplicate = siblings.find((node) => node.url === page.url);
  if (duplicate) return { id: duplicate.id, wasDuplicate: true };

  const created = await chrome.bookmarks.create({
    parentId: listId,
    title: page.title?.trim() || page.url,
    url: page.url,
  });
  return { id: created.id, wasDuplicate: false };
}

export async function saveToNamedList(listTitle, page) {
  const listId = await createList(listTitle);
  const result = await addToList(listId, page);
  return { ...result, listId };
}

export function findSaved(snapshot, url) {
  if (!url) return [];
  return snapshot.lists
    .filter((list) => list.items.some((item) => item.url === url))
    .map((list) => ({ listId: list.id, listTitle: list.title }));
}

export async function renameList(listId, title) {
  const clean = title.trim();
  if (!clean) throw new Error('A list needs a name.');
  await chrome.bookmarks.update(listId, { title: clean });
}

export async function removeItem(itemId) {
  await chrome.bookmarks.remove(itemId);
}

export async function removeList(listId) {
  const rootId = await ensureRoot();
  if (listId === rootId) throw new Error('The root folder cannot be removed.');
  await chrome.bookmarks.removeTree(listId);
}

export async function exportSnapshot() {
  const snapshot = await getSnapshot();
  return {
    exportedAt: new Date().toISOString(),
    lists: snapshot.lists.map((list) => ({
      name: list.title,
      items: list.items.map((item) => ({ title: item.title, url: item.url })),
    })),
  };
}

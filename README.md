# Page Saver

A Chrome extension for filing the page you are looking at into a named list, so
you can close the tab instead of hoarding it.

Looking at indoor plant soil mixes? Press the shortcut, type `pl`, hit Enter, and
it lands in your **plant soils** list. Reading about Angular 22? Same two
keystrokes put it in **Angular**.

## Why bookmark folders under the hood

Each list is a bookmark folder inside an `Page Saver` folder in *Other
Bookmarks*. That choice buys a few things for free:

- Lists sync across your devices with normal bookmark sync
- No storage quota to worry about (`chrome.storage.sync` caps out near 100 KB)
- Your data survives uninstalling this extension
- Lists remain visible in the normal bookmark manager and the omnibox

The extension is a fast front-end over those folders, not a separate silo.

## Install

There is no build step and there are no dependencies, so the folder loads as-is.

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this folder
4. Pin the extension so the toolbar button is always visible

### The keyboard shortcut

The manifest suggests <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> on macOS and
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> elsewhere, but **expect to set it
by hand.** Chrome treats `suggested_key` as a suggestion only: it is applied
once at install time and silently ignored if anything already holds that
combination, with no warning anywhere in the UI. That combination is also the
default autofill shortcut for Bitwarden, LastPass and Dashlane, so a password
manager will often win it.

To assign it yourself:

1. Open `chrome://extensions/shortcuts`
2. Find **Page Saver**
3. Click the field next to *Save current tab to a list* and press your keys
4. Leave the scope as **In Chrome**

Most `Cmd+Shift` letters are already taken by Chrome (`A`, `B`, `D`, `H`, `J`,
`M`, `N`, `O`, `R`, `T`, `W`). <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd>,
<kbd>U</kbd> and <kbd>Y</kbd> are usually free.

Two things worth knowing once you have set it:

- The binding is stored in your Chrome profile, not in this repo, so it does not
  follow the code to another machine, and editing `suggested_key` in the
  manifest will no longer affect your own install.
- Unpacked extensions get their ID from the folder's absolute path, so moving or
  renaming this folder makes Chrome treat it as a brand new extension: the
  shortcut and the per-domain suggestions reset. Your saved lists are unaffected,
  because they are bookmarks and live outside the extension.

## Using it

**Saving.** Press the shortcut. The popup opens with the text field focused.
Type a few letters to filter your lists, then press Enter. If what you typed
does not match an existing list, the first option becomes *Create "…"*, so new
lists happen as a side effect of saving rather than as a separate chore.

- <kbd>↑</kbd> / <kbd>↓</kbd> move between lists
- <kbd>Enter</kbd> saves to the highlighted list
- <kbd>Esc</kbd> closes without saving

**Suggestions.** The extension remembers the last list you used for each domain.
Save an `angular.dev` page to *Angular* once, and the next `angular.dev` page
arrives with *Angular* already highlighted.

**Closing as you save.** Tick *Close tab after saving* in the popup footer. The
preference sticks. This is the part that actually breaks the tab habit, since
the list genuinely replaces the open tab.

**Right-click.** Any page or link has a *Save page to list* submenu with your
existing lists, for when you do not want to open the popup.

**Getting things back out.** *Manage lists* opens a full page with search across
titles, URLs and list names, plus per-list *Open all*, rename, delete, and a
JSON export.

## Files

| Path | Role |
| --- | --- |
| `manifest.json` | MV3 manifest, permissions, keyboard shortcut |
| `lib/store.js` | All bookmark reads and writes; the only place that touches lists |
| `lib/suggest.js` | Per-domain list memory, settings, favicon URLs |
| `popup.html` / `popup.js` | The capture UI (combobox over your lists) |
| `manage.html` / `manage.js` | Search, open-all, rename, delete, export |
| `service-worker.js` | Context menus, rebuilt when bookmarks change |
| `shared.css` | Design tokens, light/dark, focus styles |
| `tools/make-icons.py` | Regenerates `icons/*.png` from flat geometry |

## Icons

`icons/` holds 16, 32, 48 and 128 px PNGs with real transparency, so the icon
works on both light and dark toolbars. Chrome does not accept SVG for manifest
icons, hence the four raster sizes.

They are drawn by `tools/make-icons.py` (stdlib only — no Pillow, no
ImageMagick) rather than exported from a design tool, so tweaking a colour or
proportion is a one-line change plus:

```bash
python3 tools/make-icons.py
```

The script renders a 768×768 master and box-filters down; 768 divides evenly by
every target size, so there is no resampling error. Colours track `--accent`
in `shared.css`.

## Notes and rough edges

This is a prototype, so a few things are deliberately unfinished:

- **Rename and delete use `window.prompt` / `window.confirm`.** Fine for a
  prototype, but a real version wants an in-page dialog for styling and focus
  control.
- **No import.** Export writes JSON, but nothing reads it back yet.
- **No tags or notes.** The bookmark data model has no room for them. Adding
  them means moving to `chrome.storage` and taking on sync and backup yourself.
- **Domain suggestions are last-write-wins.** One list per domain, with no
  weighting by how often you pick a given list.

## Accessibility

The popup is a real ARIA combobox: the input keeps DOM focus while
`aria-activedescendant` tracks the highlighted option, arrow keys move the
selection, and status messages go through an `aria-live` region. Focus outlines
are never removed, the icon-only remove buttons carry `aria-label`s naming both
page and list, and the colour tokens in `shared.css` hold a 4.5:1 contrast ratio
in both light and dark mode.

## Privacy

Your lists are ordinary Chrome bookmarks on your own machine, synced only by
Chrome's own bookmark sync. The extension has no server, makes no network
requests of any kind, and includes no analytics or telemetry. The only extra
state it keeps is a map of domain to last-used list, held in
`chrome.storage.local` so the popup can pre-select a list.

Nothing is ever sent anywhere. Uninstalling leaves your bookmarks intact.

## License

MIT, see [LICENSE](LICENSE).

The icons are not third-party assets. They are drawn from flat geometry by
`tools/make-icons.py` and fall under the same license.

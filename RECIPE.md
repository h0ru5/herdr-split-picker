# Split picker

A wall of agents from different spaces. Ctrl-Shift-O and Ctrl-Shift-E open a small picker instead of splitting straight away. From it you start a shell or an agent as before, move a terminal from another space into this tab, or show a live view of it beside the tab while it stays in its own space.

![Split picker](preview.png)

Tested on herdr-app 0.1.13 and herdr-core (hc) 0.1.21. It runs no programs, reads and writes no files, and makes no network calls. It changes your layout with `layout.set`, so it needs a layout you own (a clone).

## What you see

- **The picker**: a popup at the top, 520 wide, 80 from the top edge, on `popover`, with 12.8 px text. A label "Split right" (or "Split down"), then rows 31 tall with radius 7, `selected` under the keyboard cursor and `hover` under the pointer:
  - "New shell" with `icons/shell.svg` and a dim ⏎;
  - "New &lt;agent&gt;" for each installed agent from `knownAgents()`, with its icon;
  - a label "Other terminals   ⏎ bring here · v show beside", then one row per terminal in another tab: a status glyph, "space / tab" in `foreground`, its title in 11 px `dim`, and two chips, **bring** and **show** (11 px, 1 px `border`, radius 5). Agents that need you come first (blocked, done, working, idle). **bring** is greyed out for a terminal on another machine; **show** reads "shown" and is greyed out when that terminal is already on the wall.
- **A view**: a column beside the tab area (or below it, for Split down) holding a 30 px header and the live terminal. The header, on `chrome` with radius 6, shows the status glyph, "space / tab · title", **↗** (go to the real pane) and **✕** (close the view). A view whose terminal ended reads "&lt;address&gt; (gone)" and keeps only ✕.

The status glyph is the shipped spinner (`mods/workspace-chrome/spinner.svg`, 12 px, one turn per 900 ms) while working, a ring when idle, a dot otherwise, in the theme color for that status.

## How it behaves

- **Keys**: up and down move the cursor, Enter picks the row, `v` shows the row's terminal, Escape closes. Enter on a terminal brings it if it is on this machine and shows it otherwise.
- **New shell / New agent**: `pane.split {direction}` (with `argv` for an agent), then the popup closes.
- **bring**: `terminal.park {terminal}`, then, once the terminal's pane is gone (polled every 100 ms, up to 5 s), `terminal.keep {terminal, place: direction}`. It lands next to the focused pane, same process, same address. The popup stays open meanwhile and shows "moving…", because closing it would cancel the task. A space left empty closes itself.
- **show**: the first view saves the current layout in shared state (`split-picker.base.<layout name>`) and replaces the `{tab: "active"}` block with a host (`split-picker-host`, a row for right or a column for down, with the tab block's old size) holding the tab block (weight 2) and a wall (`split-picker-wall`, weight 1). Each view is a column `split-picker-cell-<address>` with the header block (`{mod: "split-picker", props: {cell: <address>}}`) and a `{terminal: <address>}` block. Every show and close builds the layout again from the saved copy plus the views still listed, and sends it with `layout.set`.
- **Closing a view**: ✕, or `herdr-app do split-picker.hide:<address>`. The views still shown are read from the header blocks, not from the wall, and views whose terminal has ended are dropped too. Closing the last one restores the saved layout and clears the saved copy.
- **↗**: `tab.select` and `pane.focus` on the terminal's real pane.
- **Scripting**: with the picker open, `herdr-app do split-picker.up`, `.down`, `.enter`, `.v`, `.bring:<address>`, `.show:<address>`.

## Built from

- **`mods/split-picker/main.js`** and **`mod.json`** (`"place": "none"`, an `overlay` popup with `props: {direction: "right"}`). The same `main.js` draws the picker and, when `props().cell` is set, a view's header.
- **`mods/split-picker-down`**: the same `main.js` with `direction: "down"` and the title "Split picker (down)" in `mod.json`. Mods can't import from another folder, and `mod.open` passes props only from `mod.json`, so the direction needs its own copy. `install.sh` makes it.
- **Two keys**, in `keys.json`: `"ctrl-shift-o": "mod.open:split-picker"` and `"ctrl-shift-e": "mod.open:split-picker-down"`.
- The agent list is cached in shared `new-menu.agents`, the same cache the shipped + menu uses.

## Watch out

- When a terminal shown in a layout block exits, herdr 0.1.13 removes the block and then flattens every container left with one child, anywhere in the layout, and saves that file. That takes out wrappers you rely on, such as the `panel` column (the Changes button then fails with `no node "panel" in the shown layout`). Click ✕ on the "(gone)" view: the mod restores the layout it saved before the first view.
- Layout edits made while views are shown are lost when the views close, because every change starts from the saved copy.
- `layout.set` writes your current panel sizes into the layout file.
- The first view decides where the wall goes, beside the tab (right) or below it (down).
- A view's block can't be dragged like a pane. While it has focus, split, close and zoom keys do nothing.
- Write `mod.json` before `main.js`, or herdr docks a copy with place right. A popup sizes to its content, so the root needs an explicit height. `props()` is null under `herdr-app check`. Sleeping is `cx.sleep`.

## Done when

- `herdr-app check mods/split-picker` and `herdr-app check mods/split-picker-down` report nothing.
- Ctrl-Shift-O then Enter splits the focused pane with a shell.
- **bring** on a terminal from another space moves it next to the focused pane; its old space closes if it was its last terminal.
- **show** adds a view with a working header; ✕ closes it and the layout file is the same as before the view.
- After a shown terminal exits, ✕ on its "(gone)" view brings back every node the layout had before, including `panel`.

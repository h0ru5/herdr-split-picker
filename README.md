# herdr split picker

A herdr mod for building a wall of agents from different spaces. Ctrl-Shift-O / Ctrl-Shift-E open a small picker instead of splitting straight away:

- **New shell / New &lt;agent&gt;**: splits the focused pane, same as before. Enter picks New shell, so Ctrl-Shift-O, Enter still gives you a plain shell.
- **bring**: moves a terminal from another space into this tab, next to the focused pane. Same process, same address. It leaves its old space, and a space left empty closes. Only works for terminals on the same machine.
- **show** (or `v`): adds a live view of the terminal next to the tab area. The terminal stays in its own space. The view stays visible when you switch spaces. Its header has ↗ (go to the real pane) and ✕ (close the view).

Agents that need you are listed first.

## Install

```sh
./install.sh
```

Then point the keys at the picker in `~/.config/herdr-app/keys.json`:

```json
"ctrl-shift-o": "mod.open:split-picker",
"ctrl-shift-e": "mod.open:split-picker-down",
```

`install.sh` copies the mod twice, because herdr mods can't import from another folder and `mod.open` can't pass the direction.

## Limits

- Views need a layout you own (a clone). Shipped layouts can't change structure.
- The first view decides where the column of views goes: beside the tab (right) or below it (down).
- A view's block can't be dragged like a pane. While it has focus, split, close and zoom keys do nothing.
- `layout.set` writes your current panel sizes into the layout file.
- When a shown terminal exits, herdr flattens one-child containers across the whole layout (your Changes panel button can break). Click ✕ on the "(gone)" view: the mod rebuilds the layout from a copy it saved before the first view. Layout edits made while views are open are lost then.

## Scripting

With the picker open: `herdr-app do split-picker.bring:t7`, `split-picker.show:t7`, `split-picker.enter`, `.up`, `.down`. Close a view with `herdr-app do split-picker.hide:t7`.

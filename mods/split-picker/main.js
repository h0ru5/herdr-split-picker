// Split picker: ctrl-shift-o / ctrl-shift-e open this popup instead of splitting straight away.
//   New shell / new agent  split the focused pane as before.
//   Bring here             moves a terminal from another space into this tab (terminal.park, then terminal.keep).
//   Show beside            adds a live view of a terminal next to the tab area (a layout terminal block);
//                          the terminal stays in its own space. Each view has a header with go-to and close.
// The same main.js also draws those view headers (props.cell).

import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, spaces, panes, focused, knownAgents, run, props as hostProps, closeOverlay, layout, notify, shared, setShared, nextCommand } from "herdr";

const props = () => hostProps() ?? {};
const KNOWN = "new-menu.agents"; // same cache as the shipped + menu
const HOST = "split-picker-host";
const WALL = "split-picker-wall";
const cellId = (addr) => `split-picker-cell-${addr.replace(/[^A-Za-z0-9_-]/g, "_")}`;

// ---- layout edits -------------------------------------------------------------------

function findNode(node, pred, parent = null) {
  if (!node || typeof node !== "object") return null;
  if (pred(node)) return { node, parent };
  for (const c of node.children ?? []) {
    const hit = findNode(c, pred, node);
    if (hit) return hit;
  }
  return null;
}

function cell(addr) {
  return {
    type: "column", id: cellId(addr), children: [
      { type: "block", size: { px: 30 }, content: { mod: "split-picker", props: { cell: addr } } },
      { type: "block", content: { terminal: addr } },
    ],
  };
}

// Views are found by their header blocks, not by WALL/cell ids: when a shown terminal exits, herdr
// drops its block and flattens every container left with one child, anywhere in the layout
// (it also flattened the layout's "panel" column). So the layout from before the first view is kept
// in shared state and every change rebuilds from it.
const baseKey = () => `split-picker.base.${shared("layout") ?? "main"}`;

function headers(tree) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (n.content?.mod === "split-picker" && n.content.props?.cell) out.push(n.content.props.cell);
    (n.children ?? []).forEach(walk);
  };
  walk(tree);
  return out;
}

export function wallAddresses() { return headers(layout()); }

// The tree before any view: the saved one, or (for a layout from before this fix) the current one
// with the host unwrapped back to its tab block.
function baseTree() {
  const saved = shared(baseKey());
  if (saved) return JSON.parse(JSON.stringify(saved));
  const tree = JSON.parse(JSON.stringify(layout()));
  const hit = findNode(tree, (n) => n.id === HOST);
  if (hit?.parent) {
    const tab = findNode(hit.node, (n) => n.type === "block" && n.content?.tab === "active").node;
    const back = { ...tab, size: hit.node.size };
    if (!back.size) delete back.size;
    hit.parent.children[hit.parent.children.indexOf(hit.node)] = back;
  }
  return tree;
}

function build(base, addrs, direction) {
  const tree = JSON.parse(JSON.stringify(base));
  const hit = findNode(tree, (n) => n.type === "block" && n.content?.tab === "active");
  if (!hit) return notify({ title: "Split picker", body: "This layout has no tab block to show terminals beside.", level: "error" });
  if (!hit.parent) return notify({ title: "Split picker", body: "The tab block is the layout root; can't add a view beside it.", level: "error" });
  const tab = hit.node;
  // The host takes the tab block's place (and its size); the wall stacks across the split direction.
  // ponytail: the wall's direction is fixed by the first view; mixed right/down needs a grid model.
  hit.parent.children[hit.parent.children.indexOf(tab)] = {
    type: direction === "down" ? "column" : "row", id: HOST, gap: 8, size: tab.size,
    children: [{ ...tab, size: { weight: 2 } },
      { type: direction === "down" ? "row" : "column", id: WALL, gap: 8, size: { weight: 1 }, children: addrs.map(cell) }],
  };
  return tree;
}

function showBeside(addr, direction) {
  const shown = wallAddresses();
  const base = baseTree();
  if (!shown.length) setShared(baseKey(), base);
  else direction = findNode(layout(), (n) => n.id === HOST)?.node.type === "column" ? "down" : "right";
  const tree = build(base, [...shown.filter((a) => a !== addr), addr], direction);
  if (tree) run("layout.set", { layout: tree });
}

function hideView(addr) {
  const live = new Set(panes().map((p) => p.terminal));
  const rest = wallAddresses().filter((a) => a !== addr && live.has(a));
  const direction = findNode(layout(), (n) => n.id === HOST)?.node.type === "column" ? "down" : "right";
  const base = baseTree();
  // ponytail: rebuilding from the saved base drops layout edits made while views were open.
  const tree = rest.length ? build(base, rest, direction) : base;
  if (!tree) return;
  if (!rest.length) setShared(baseKey(), null);
  run("layout.set", { layout: tree });
}

// ---- shared bits --------------------------------------------------------------------

function where(tabId) {
  for (const s of spaces()) {
    const t = s.tabs.find((x) => x.id === tabId);
    if (t) return { space: s, tab: t };
  }
  return null;
}

function glyph(t, st) {
  if (st === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900);
  return div().w(12).flex_none().text_color(t[st] ?? t.dim).child(st === "idle" ? "○" : st ? "●" : "·");
}

function goTo(addr) {
  const p = panes().find((x) => x.terminal === addr);
  if (!p) return;
  run("tab.select", { id: p.tab });
  run("pane.focus", { pane: p.pane });
}

const RANK = { blocked: 0, done: 1, working: 2, idle: 3 };

// ---- the views' header ----------------------------------------------------------------

class CellHeader {
  static render(addr) {
    const t = theme();
    const p = panes().find((x) => x.terminal === addr);
    const w = p && where(p.tab);
    const btn = (id, label, tip, action) => div().id(id).px(6).rounded(5).text_color(t.muted).cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).child(label).on_click(action);
    return h_flex().size_full().px(10).gap(8).items_center().text_size(12).bg(t.chrome).rounded(6)
      .child(glyph(t, p?.status))
      .child(div().flex_1().truncate().text_color(t.foreground)
        .child(p ? `${w?.space.name ?? "?"} / ${w?.tab.name ?? "?"} · ${p.title || p.program?.name || addr}` : `${addr} (gone)`))
      .when(Boolean(p), (el) => el.child(btn("go", "↗", "go to its pane", () => goTo(addr))))
      .child(btn("x", "✕", "close this view", () => hideView(addr)));
  }
}

// ---- the popup ----------------------------------------------------------------------

export default class SplitPicker extends View {
  init(_props, cx) {
    if (props().cell) {
      // `herdr-app do split-picker.hide:<address>` closes that view (every shown copy hears it).
      return cx.spawn(async () => { for (;;) if ((await nextCommand()) === `hide:${props().cell}`) hideView(props().cell); });
    }
    this.direction = props().direction === "down" ? "down" : "right";
    this.at = 0;
    this.busy = null;
    const machine = spaces().find((s) => s.active)?.machine ?? null;
    this.machine = machine;
    this.agents = (shared(KNOWN)?.[machine ?? ""] ?? []).filter((a) => a.installed);
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(300, () => this.handle.focus());
    cx.spawn(async (cx) => { for (;;) this.key(await nextCommand(), cx); });
    cx.spawn(async (cx) => {
      try {
        const all = await knownAgents({ on: machine });
        setShared(KNOWN, { ...shared(KNOWN), [machine ?? ""]: all });
        this.agents = all.filter((a) => a.installed);
      } catch {}
      cx.notify();
    });
  }

  close() { closeOverlay(props().overlay); }

  // Keys, and the same as commands (`herdr-app do split-picker.enter`): up, down, enter, v,
  // plus bring:<address> and show:<address> for scripts.
  key(k, cx) {
    const rows = this.rows();
    const r = rows[this.at];
    const [verb, addr] = k.split(/:(.*)/);
    if ((verb === "bring" || verb === "show") && addr) this.pick(rows.find((x) => x.p?.terminal === addr), verb, cx);
    else if (k === "escape") this.close();
    else if (k === "down") this.at = (this.at + 1) % rows.length;
    else if (k === "up") this.at = (this.at + rows.length - 1) % rows.length;
    else if (k === "enter") this.pick(r, r?.kind === "term" && !this.sameMachine(r.p.terminal) ? "show" : "bring", cx);
    else if (k === "v" && r?.kind === "term" && !r.shown) this.pick(r, "show", cx);
    else return false;
    cx.notify();
    return true;
  }

  rows() {
    const here = focused()?.tab;
    const shown = new Set(wallAddresses());
    const out = [{ kind: "shell" }, ...this.agents.map((a) => ({ kind: "agent", a }))];
    const others = panes()
      .filter((p) => p.terminal && p.tab !== here)
      .map((p) => ({ kind: "term", p, w: where(p.tab), shown: shown.has(p.terminal) }))
      .sort((a, b) => (RANK[a.p.status] ?? 9) - (RANK[b.p.status] ?? 9));
    return out.concat(others);
  }

  sameMachine(addr) {
    const m = addr.includes("/") ? addr.split("/")[0] : null;
    return m === this.machine;
  }

  pick(r, how, cx) {
    if (!r || this.busy) return;
    const d = this.direction;
    if (r.kind === "shell") { this.close(); return run("pane.split", { direction: d }); }
    if (r.kind === "agent") { this.close(); return run("pane.split", { direction: d, argv: r.a.run }); }
    const addr = r.p.terminal;
    if (how === "show") { this.close(); return showBeside(addr, d); }
    if (!this.sameMachine(addr)) return;
    // Park first; keep only once the pane is gone, else keep fails ("pane change in progress").
    // The popup stays open meanwhile: closing it would cancel this task.
    this.busy = addr;
    cx.notify();
    run("terminal.park", { terminal: addr });
    cx.spawn(async (cx) => {
      for (let i = 0; i < 50 && panes().some((p) => p.terminal === addr); i++) await cx.sleep(100);
      run("terminal.keep", { terminal: addr, place: d });
      this.close();
    });
  }

  render(cx) {
    if (props().cell) return CellHeader.render(props().cell);
    const t = theme();
    const rows = this.rows();
    this.at = Math.min(this.at, rows.length - 1);
    const label = (s) => div().px(10).pt(8).pb(3).text_size(11).text_color(t.dim).child(s);
    const chip = (id, text, enabled, action) => div().id(id).px(7).py(1).rounded(5).text_size(11)
      .text_color(enabled ? t.muted : t.dim).border_1().border_color(t.border)
      .when(enabled, (el) => el.cursor_pointer().hover((s) => s.bg(t.selected).text_color(t.foreground))
        .on_click((e, cx) => { cx.stop_propagation(); action(cx); }))
      .child(text);

    const row = (r, i) => {
      const on = i === this.at;
      const base = h_flex().id(`sp-row-${i}`).mx(4).px(10).h(31).flex_none().gap(10).items_center().rounded(7)
        .cursor_pointer().when(on, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover));
      if (r.kind === "shell") return base.on_click((e, cx) => this.pick(r, "bring", cx))
        .child(svg("icons/shell.svg").size(14)).child(div().flex_1().child("New shell")).child(div().text_size(11).text_color(t.dim).child("⏎"));
      if (r.kind === "agent") return base.on_click((e, cx) => this.pick(r, "bring", cx))
        .child(r.a.tint ? svg(r.a.icon).size(14).text_color(t.foreground) : image(r.a.icon).size(14))
        .child(div().flex_1().child(`New ${r.a.name}`));
      const addr = r.p.terminal;
      const movable = this.sameMachine(addr);
      return base.on_click((e, cx) => this.pick(r, movable ? "bring" : "show", cx))
        .child(glyph(t, r.p.status))
        .child(div().flex_none().text_color(t.foreground).child(`${r.w?.space.name ?? "?"} / ${r.w?.tab.name ?? "?"}`))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(r.p.title || r.p.program?.name || addr))
        .when(this.busy === addr, (el) => el.child(div().text_size(11).text_color(t.dim).child("moving…")))
        .child(chip(`sp-bring-${i}`, "bring", movable, (cx) => this.pick(r, "bring", cx)))
        .child(chip(`sp-show-${i}`, r.shown ? "shown" : "show", !r.shown, (cx) => this.pick(r, "show", cx)));
    };

    const first = rows.findIndex((r) => r.kind === "term");
    const items = [];
    rows.forEach((r, i) => {
      if (i === first) items.push(label("Other terminals   ⏎ bring here · v show beside"));
      items.push(row(r, i));
    });

    return v_flex().id("split-picker").track_focus(this.handle).w_full().min_h(0).h(Math.min(560, 40 + items.length * 32))
      .bg(t.popover).p(5).text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.modifiers.control || e.modifiers.alt || e.modifiers.platform) return;
        if (this.key(e.key, cx)) cx.stop_propagation();
      })
      .child(label(`Split ${this.direction}`))
      .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().children(items));
  }
}

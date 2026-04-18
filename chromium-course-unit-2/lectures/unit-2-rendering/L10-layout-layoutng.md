# Lecture 10 — Layout: Box Trees, Block/Inline, and LayoutNG

| | |
|---|---|
| **Unit** | II — The Rendering Pipeline |
| **Week** | 5 |
| **Duration** | 1.5 hours |
| **Demo** | Layout Shift Regions overlay; fragment tree inspection |

## Learning objectives

Students can:

1. Distinguish the DOM tree, the LayoutObject tree, and the fragment tree.
2. Describe the block formatting context and inline formatting context at a high level.
3. Explain what LayoutNG is and why it exists.
4. Identify sources of layout thrashing and cumulative layout shift.

## Opening hook (5 min)

Ask: *"Why is layout the expensive part of rendering?"*

Guesses: "lots of elements," "recursion," "text is hard." All partly right.

The deeper answer: **layout is constraint solving.** Given "this div should be 50% of its parent's width, wrap its text, and push its siblings down," the browser has to work out a consistent assignment of positions and sizes for every box on the page. Doing this fast, incrementally, and in a way that matches other browsers bit-for-bit is one of the hardest jobs in Chromium.

This lecture is why.

## Three trees, not one (15 min)

Draw this on the board. Keep it up.

```
         DOM tree               LayoutObject tree           Fragment tree
                                                              (LayoutNG)
         ─────────              ───────────────────           ─────────────

         <html>                  LayoutView                    View fragment
           ├ <head>               └ LayoutBlockFlow              └ Page fragment
           │   └ <title>             ├ LayoutBlockFlow (body)       └ BlockFragment(body)
           └ <body>                  │   ├ LayoutBlockFlow (h1)         ├ BlockFragment(h1)
               ├ <h1>                │   │   └ LayoutText ("Hello")          └ LineBox
               │   └ "Hello"         │   └ LayoutBlockFlow (p)                   └ InlineItem "Hello"
               └ <p>                 │       └ LayoutText ("World")         ├ BlockFragment(p)
                   └ "World"                                                    └ LineBox
                                                                                    └ InlineItem "World"
```

**The DOM tree** is the logical tree of elements, set by the HTML parser. It is *not* where layout happens.

**The LayoutObject tree** is built from the DOM by the style engine. One LayoutObject per element-that-produces-a-box. Elements with `display: none` get no LayoutObject. Pseudo-elements like `::before` also get LayoutObjects (not DOM nodes).

**The fragment tree** (LayoutNG) is the output of layout. It holds the actual geometry: box positions, sizes, line boxes, break points for pagination and columns. A single `<p>` with three lines of text produces one `BlockFragment` containing three `LineBox` fragments.

Why three trees? Because they change at different rates.

- DOM: changes when HTML/JS mutates the tree.
- LayoutObject: changes when DOM changes OR when `display` changes (an element going `display: none ↔ block`).
- Fragment: changes whenever layout runs.

Invalidation can operate at any level. Change `color`? No layout needed, fragment tree untouched. Change `width`? Fragment tree for that subtree rebuilt. Add a DOM element? LayoutObject tree grows, fragment tree rebuilt.

## Block and inline formatting contexts (15 min)

CSS layout is defined in terms of **formatting contexts**. For this course we care about two:

### Block formatting context (BFC)

Block-level boxes stack vertically. Each block occupies the full width of its container by default. `<body>`, `<div>`, `<p>`, `<h1>` are block by default.

```
┌─ body (BFC) ────────────────────┐
│ ┌─ h1 ───────────────────────┐  │
│ │ Hello                      │  │
│ └────────────────────────────┘  │
│ ┌─ p ────────────────────────┐  │
│ │ Some paragraph text…       │  │
│ │ wraps to multiple lines    │  │
│ └────────────────────────────┘  │
│ ┌─ div ──────────────────────┐  │
│ │ Another block              │  │
│ └────────────────────────────┘  │
└─────────────────────────────────┘
```

The block-layout algorithm: walk children top to bottom, compute each child's height, stack them.

### Inline formatting context (IFC)

Inline boxes flow horizontally, wrapping to new **line boxes** when they hit the edge. `<span>`, `<a>`, `<em>`, `<strong>` are inline by default. Text nodes are inline.

```
┌─ p (IFC) ────────────────────────────────┐
│ The quick brown fox jumps over the lazy  │  ← line box 1
│ dog. And here is some <em>emphasized</em>│  ← line box 2
│ text that continues across line breaks.  │  ← line box 3
└──────────────────────────────────────────┘
```

Inline layout is where text shaping happens. Blink calls into **HarfBuzz** for shaping (glyph selection, kerning, ligatures) and **ICU** for bidirectional text and word segmentation. Line breaking uses the Unicode line-breaking algorithm.

### Modern layout modes

Also mention (without going deep): **flex layout** (`display: flex`), **grid layout** (`display: grid`), **table layout** (the infamous one), **math layout** for MathML. Each has its own algorithm. Each produces fragment output. LayoutNG unified the framework; each mode implements its own algorithm inside the framework.

## LayoutNG — the rewrite (15 min)

This is the most interesting engineering story in Blink. Worth telling properly.

### The old engine

Until ~2019, Blink's layout code was a direct descendant of WebKit's, which was a descendant of KHTML's, dating back to the 1990s. It had structural problems:

- **Layout state scattered across LayoutObject fields.** A LayoutObject simultaneously represented "the element" and "its current geometry." Hard to reason about.
- **Mutable by default.** Layout would write back into LayoutObject fields during the recursive walk. Caching, invalidation, and incremental layout were brittle.
- **Fragmentation (columns, pages, print) was bolted on.** Multi-column layout and pagination were implemented with painful workarounds.
- **Hard to parallelize.** Because of the mutable state, you couldn't meaningfully run layout on multiple threads.

### LayoutNG's design

LayoutNG is a rewrite, starting around 2016 and rolling out gradually through 2019–2022. Core ideas:

1. **Separate the persistent element representation from the transient geometry output.** `LayoutObject` still exists but stores less state. Layout produces a new **fragment tree** as immutable output.
2. **Each layout algorithm is a function**: `(LayoutObject + ConstraintSpace) → Fragment`. The `ConstraintSpace` describes the available size, writing mode, etc. The `Fragment` is the geometric result.
3. **Layout is re-entrant and cacheable.** Because algorithms are functions of their inputs, you can cache fragments. If a box's inputs haven't changed, reuse its fragment.
4. **Fragmentation is first-class.** A single algorithm can be called repeatedly with different fragmentation constraints to lay out content across columns or pages.

The payoff: **multi-column, pagination, and cross-fragment line breaking work correctly now.** Maintainability improved dramatically. Print-to-PDF no longer has its own code path.

### The rollout

LayoutNG shipped in stages: inline layout first, then block, then flex, grid, tables. Each stage was hidden behind a runtime flag and validated against tens of thousands of web-platform tests. The project took years. It's a case study students should read if they care about large-scale rewrites.

Pointer: the [LayoutNG design doc](https://docs.google.com/document/d/1uxbDh4uONFQOiGuiumlJBLGgO4KDWB8ZEkp7Rd47fw4/) and follow-up docs explain the staging.

## A tiny code excerpt — a layout algorithm (5 min)

Open [`third_party/blink/renderer/core/layout/block_layout_algorithm.cc`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/layout/block_layout_algorithm.cc). Don't try to understand all of it. Show students the top-level shape:

```cpp
const LayoutResult* BlockLayoutAlgorithm::Layout() {
  // Set up margin collapsing, floats, fragmentation state.
  // ...

  for (auto child : ChildIterator(Node())) {
    // Determine child's ConstraintSpace based on our state.
    ConstraintSpace child_space = CreateConstraintSpaceForChild(child, ...);

    // Recursively lay out the child — returns a fragment.
    const LayoutResult* child_result = child.Layout(child_space);

    // Position the fragment in our own coordinates.
    PositionChildFragment(child_result->PhysicalFragment(), ...);
  }

  // Assemble our own fragment and return.
  return builder.ToBoxFragment();
}
```

That's the shape of every layout algorithm in LayoutNG: a function that walks children, recursively lays each out, and assembles an output fragment. Clean. Testable.

## Layout thrashing — the thing HW6 is about (10 min)

Some JS APIs force Blink to synchronously complete style + layout before returning a result. Examples:

- `element.offsetTop`, `offsetLeft`, `offsetWidth`, `offsetHeight`
- `element.clientWidth`, `clientHeight`
- `element.getBoundingClientRect()`
- `window.scrollY`, `window.innerWidth`
- `window.getComputedStyle(element).<anything>`

If any of these is called after a DOM mutation, Blink must run style and layout right then to produce an accurate answer. This is **forced synchronous layout**.

Innocuous-looking code that's deadly slow:

```javascript
// For 1000 elements...
for (const el of elements) {
  el.style.width = '100px';       // invalidates layout
  const h = el.offsetHeight;      // FORCES synchronous layout — 1000 layouts!
  el.dataset.height = h;
}
```

Fix: batch the reads, then the writes:

```javascript
// Read phase — one layout at worst
const heights = elements.map(el => el.offsetHeight);

// Write phase — batched invalidation, one layout
for (let i = 0; i < elements.length; i++) {
  elements[i].style.width = '100px';
  elements[i].dataset.height = heights[i];
}
```

DevTools Performance panel calls this out with a "Forced reflow" warning on the offending stack frames. HW6 asks students to produce and fix one of these.

## Cumulative Layout Shift (CLS) (5 min)

When content appears late and pushes existing content around, users get annoyed — they lose their scroll position or click the wrong thing. CLS is a Core Web Vital measuring this.

Browser-level mitigations:

- **`aspect-ratio` CSS property** lets you reserve space for images before they load.
- **`content-visibility: auto`** defers layout of off-screen content.
- **`size-adjust` and font-metrics overrides** reduce FOUT (flash of unstyled text) shift.

DevTools has a **"Layout Shift Regions"** overlay that flashes shifted regions blue. Demo coming up.

## Live demo (15 min)

### Demo 1 — observe layout work in Performance panel

Record a page load of a content-heavy site. Stop. Find "Layout" entries. Click one. The detail panel shows:

- "Nodes that need layout: N of M in subtree"
- A stack trace showing what triggered it

### Demo 2 — forced reflow warning

Construct a page with 1000 boxes:

```html
<div id="grid"></div>
<script>
const grid = document.getElementById('grid');
for (let i = 0; i < 1000; i++) {
  const b = document.createElement('div');
  b.className = 'box';
  b.textContent = i;
  grid.appendChild(b);
}
</script>
<style>.box { width: 50px; height: 50px; display: inline-block; background: #cef; }</style>
```

Start Performance recording. In the console:

```javascript
document.querySelectorAll('.box').forEach(el => {
  el.style.width = '60px';
  el.offsetWidth;  // force layout
});
```

Stop. You'll see a dense stack of layout entries with "Forced reflow" warnings.

Now the batched version:

```javascript
const boxes = [...document.querySelectorAll('.box')];
boxes.forEach(el => { el.style.width = '80px'; });
const widths = boxes.map(el => el.offsetWidth);  // single forced layout
```

One layout entry. Dramatic difference. This is HW6 in miniature.

### Demo 3 — Layout Shift Regions

Open DevTools → Rendering tab → enable "Layout Shift Regions." Visit a page that loads images without reserved space. Watch the page shift and blue flashes everywhere. Then compare to a page that uses `width`/`height` attributes or `aspect-ratio`. Night and day.

## Reading for next lecture

- [CSS Display Module Level 3](https://www.w3.org/TR/css-display-3/)
- [Skia documentation overview](https://skia.org/docs/) — just the intro
- chromium.org: [How cc Works](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/how_cc_works.md) — preview for Lecture 12

## Instructor notes

- HW6 (Layout Thrashing) is assigned this lecture.
- Spend time on the three-trees diagram. It's the unlock.
- LayoutNG is genuinely interesting engineering — tell the story, don't just state facts.
- Some students will ask "should I use flex or grid?" That's a different class. Point them at the MDN / spec docs.

---

[← L9](./L09-style-computed.md) · [Unit II README](./README.md) · [Next: L11 — Paint & Raster →](./L11-paint-raster.md)

# Lecture 8 — Blink: Parsing HTML and Building the DOM

| | |
|---|---|
| **Unit** | II — The Rendering Pipeline |
| **Week** | 4 |
| **Duration** | 1.5 hours |
| **Demo** | Preload scanner observation; streaming parse |

## Learning objectives

Students can:

1. Describe the three-stage HTML parse: bytes → tokens → tree.
2. Explain what the preload scanner does and why it matters.
3. Identify why `<script>` blocks parsing and how to avoid it.
4. Read a DOM tree produced by pathological HTML input.

## Opening hook (5 min)

Put this HTML on the board:

```html
<p><div></div></p>
```

Ask: *"What does the DOM tree look like?"*

Let students guess. Most will say "a `<p>` containing a `<div>`." The real answer:

```
<p></p>
<div></div>
<p></p>
```

Three siblings. No nesting. *Why?*

Because HTML parsing is not a simple nested-tag operation. It's a complex state machine defined precisely by the HTML spec, and that spec says `<div>` cannot be a child of `<p>` — the open `<p>` is implicitly closed, the `<div>` becomes a sibling, and the `</p>` in the source creates an empty `<p>` because there's no open `<p>` to close.

This is what HW4 is about. This lecture is how the parser works.

## Stage 1 — bytes to tokens (15 min)

The HTML parser has three conceptual stages, pipelined:

```
  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │   BYTES     │────▶│   TOKENS    │────▶│    TREE     │
  │(UTF-8, etc.)│     │ (start tag, │     │  (DOM)      │
  │             │     │ end tag,    │     │             │
  │             │     │ text, etc.) │     │             │
  └─────────────┘     └─────────────┘     └─────────────┘
   decoder            tokenizer            tree builder
```

### The tokenizer is a state machine

The [HTML Living Standard §13.2.5](https://html.spec.whatwg.org/multipage/parsing.html#tokenization) defines **80+ states** for the HTML tokenizer. No exaggeration. States like:

- Data state
- Tag open state
- Tag name state
- Before attribute name state
- Attribute name state
- Attribute value (double-quoted) state
- Script data state
- Script data escaped state
- Script data double escaped state
- CDATA section state
- … and 70+ more

Why so many? Because HTML has special cases everywhere: `<script>` contents are parsed differently from `<p>` contents, `<!--` starts a comment, `<![CDATA[` is valid in XML but not HTML (except in foreign content like `<svg>`), character references like `&amp;` and `&#xABCD;` need their own sub-states.

In Chromium, this lives in [`third_party/blink/renderer/core/html/parser/html_tokenizer.cc`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/html/parser/html_tokenizer.cc). Open it on the projector. Scroll. Show students: it's thousands of lines of state-machine code, organized by state.

The payoff of all this complexity: **Chromium parses HTML byte-identical to Firefox and Safari** on every conforming input. That is a huge interoperability win.

## Stage 2 — tokens to tree (10 min)

The tree-construction algorithm is the second state machine. Its input is tokens, its output is DOM nodes. It maintains:

- **A stack of open elements** — elements we've opened but not yet closed.
- **An insertion mode** — a state like "in body," "in table," "in select," "after body."
- **A list of active formatting elements** — for the infamous adoption agency algorithm.

Why the complexity? Because HTML tolerates broken markup. Users' pages in 1996 had unclosed tags everywhere. The spec codifies exactly how to recover.

Return to the opening example:

```html
<p><div></div></p>
```

Walk it as tokens through the tree builder:

1. Token: `<p>` start tag. Push `<p>` onto the stack.
2. Token: `<div>` start tag. **Rule**: if the stack of open elements has a `<p>` and we see `<div>`, close the `<p>` implicitly (because `<p>` cannot contain block-level content). Pop `<p>`. Push `<div>`.
3. Token: `</div>` end tag. Pop `<div>`.
4. Token: `</p>` end tag. **Rule**: there is no open `<p>`. The spec says create an empty `<p>` to receive this end tag, then close it.

Result: three siblings. DOM is:

```
<p></p>
<div></div>
<p></p>
```

This is precisely what HW4 exercises.

### The adoption agency algorithm

Mention briefly but don't go deep unless time allows. Given:

```html
<b>1<p>2</b>3</p>
```

The output is:

```
<b>1</b>
<p><b>2</b>3</p>
```

The `<b>` gets "adopted" into the `<p>`. The algorithm to produce this is 13 numbered steps in the spec and is legendary for its complexity. It exists because real pages in 2000 had this kind of markup and browsers had to handle it consistently.

## Scripts block parsing — the fundamental constraint (10 min)

Here's the rule every web developer eventually learns:

> **A `<script>` without `async` or `defer` blocks the HTML parser until the script has been fetched, parsed, and executed.**

Why? Because the script might call `document.write()`, which injects characters directly into the input stream. The tokenizer must process those characters before continuing.

Consequence: this page:

```html
<!DOCTYPE html>
<html><head>
  <script src="analytics.js"></script>  <!-- blocks parsing -->
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>Hello</h1>
  <img src="hero.jpg">
</body></html>
```

has a catastrophic performance property: the parser stops at the `<script>` tag and waits for analytics.js to download and execute before the parser even *sees* the stylesheet or image.

The fix in modern HTML is `async`, `defer`, or module scripts (`<script type="module">`). But we still have a second mechanism Chromium uses to mitigate:

## The preload scanner (15 min)

**The preload scanner is a separate tokenizer that runs ahead of the main parser** to discover resources that should be preloaded.

Draw this:

```
Main parser  ────▶ [blocked at <script>]   ⏸
                          │
                          │ still waiting...
                          │
Preload scanner ──────────┴──────────▶ sees <link>, <img>, <script>
                                       fires network fetches
                                       doesn't touch the DOM
```

The preload scanner is a stripped-down tokenizer that:

- **Does NOT build a DOM** — it only extracts URLs.
- **Does NOT execute JavaScript** — it ignores script contents.
- **Does NOT respect `document.write`** — because it's not building a DOM to write into.
- **Fires network fetches speculatively** for discovered resources.

So even when the main parser is blocked at `<script src=analytics.js>`, the preload scanner charges ahead, sees the stylesheet and image, and starts fetching them. By the time the main parser unblocks, the stylesheet is already in cache.

In Chromium this is [`html_preload_scanner.cc`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/html/parser/html_preload_scanner.cc). Open it on the projector. Show the `TokenPreloadScanner` class. Point out that it shares the tokenizer states with the main parser but has its own insertion logic that only cares about `<link>`, `<img>`, `<script>`, `<video>`, `<source>`, etc.

**This is why page loads don't catastrophically stall at the first script.** Every major browser now has a preload scanner. Chrome's was one of the first, circa 2008.

## A tiny code excerpt — the tree builder's state machine (5 min)

Open [`html_tree_builder.cc`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/html/parser/html_tree_builder.cc). Search for `ProcessStartTag`. You'll find a structure like:

```cpp
void HTMLTreeBuilder::ProcessStartTag(AtomicHTMLToken* token) {
  switch (insertion_mode_) {
    case kInitialMode:
      // Handle <!DOCTYPE>, switch to before-html mode
      break;
    case kBeforeHTMLMode:
      // Expect <html>, push it, switch to before-head mode
      break;
    case kInHeadMode:
      // <meta>, <link>, <title>, <script>, <style> handled here
      break;
    case kInBodyMode:
      // The big one — most markup lives here
      ProcessStartTagForInBody(token);
      break;
    // ... many more modes
  }
}
```

This file implements the tree-construction algorithm from the HTML spec directly. If you ever need to understand why some HTML produces a weird DOM, this file is where to look. The spec section headings correspond 1:1 to case labels here.

## Live demo — observing the preload scanner (15 min)

### Demo 1 — the blocking script problem, made visible

Construct a page (have it ready on your web server):

```html
<!DOCTYPE html>
<html><head>
  <title>Slow Parse Demo</title>
  <script src="/slow-script.js"></script>  <!-- 2-second delay, blocking -->
  <link rel="stylesheet" href="/style.css">
</head><body>
  <h1>Hello</h1>
  <img src="/hero.jpg">
</body></html>
```

Where `/slow-script.js` is a server endpoint that sleeps 2 seconds before responding.

Open DevTools Network panel, reload, show:
- `slow-script.js` starts fetching immediately.
- `style.css` and `hero.jpg` *also start fetching* — this is the preload scanner at work. They don't wait.
- Parsing stalls at the script tag until it returns.
- Once the script arrives, parsing resumes and finds the stylesheet and image already cached.

**Without a preload scanner, `style.css` and `hero.jpg` would not fetch until after `slow-script.js` finished.** Toggle "Disable cache" and compare timings with a synthetic network throttle.

### Demo 2 — observing tokenizer states

Open [`html_tokenizer.cc`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/html/parser/html_tokenizer.cc) and [`html_tokenizer.h`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/html/parser/html_tokenizer.h) in Code Search. Show the state enum. Count the states. That's the HTML spec made executable.

### Demo 3 — DOM inspection of pathological input

Open a blank page, paste into the console:

```javascript
document.body.innerHTML = '<p><div></div></p>';
console.log(document.body.outerHTML);
```

Show the actual output: `<body><p></p><div></div><p></p></body>`.

Try more:

```javascript
document.body.innerHTML = '<table><div>X</div></table>';
// → <div>X</div><table></table>
// Because <div> can't be in a <table>, it gets "foster-parented" out.
```

```javascript
document.body.innerHTML = '<b>1<p>2</b>3</p>';
// → <b>1</b><p><b>2</b>3</p>
// Adoption agency.
```

This is HW4. Students will do five of these on their own.

## Reading for next lecture

- [HTML Living Standard §13.2 — Parsing overview](https://html.spec.whatwg.org/multipage/parsing.html#parsing)
- [CSS Cascading & Inheritance Level 4](https://www.w3.org/TR/css-cascade-4/) — intro sections only
- web.dev: [Populating the page: how browsers work](https://web.dev/articles/howbrowserswork) — if you want a gentler overview

## Instructor notes

- HW4 (Parser Pathology) is assigned this lecture.
- The state-machine count (80+) reliably gets a reaction. Lean into it.
- If time is short, skip the adoption agency. It's fun trivia but not essential.
- Some students will argue that "HTML is a garbage format." Valid perspective. Note that the consistency across browsers *despite* the garbage is a triumph of standardization.

---

[← L7](./L07-url-to-pixels.md) · [Unit II README](./README.md) · [Next: L9 — Style →](./L09-style-computed.md)

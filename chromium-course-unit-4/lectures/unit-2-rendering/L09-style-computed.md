# Lecture 9 — Style: From CSS to ComputedStyle

| | |
|---|---|
| **Unit** | II — The Rendering Pipeline |
| **Week** | 5 |
| **Duration** | 1.5 hours |
| **Demo** | Forced style recalc via DevTools "Rendering" tab |

## Learning objectives

Students can:

1. Describe how Blink matches CSS selectors against DOM elements.
2. Explain the cascade and specificity rules.
3. Identify what triggers a style recalc.
4. Use DevTools to measure and reason about style-recalc cost.

## Opening hook (5 min)

Put this on the board:

```html
<div class="card featured">
  <p class="card-title">Hello</p>
</div>
```

with CSS:

```css
.card { padding: 20px; }
.card.featured { border: 2px solid gold; }
.card-title { font-weight: bold; }
div > p { color: blue; }
.card p { color: red; }
#main .card p { color: green; }
* { box-sizing: border-box; }
```

Ask: *"What color is the text?"*

Answer: **green**. Because `#main .card p` has the highest specificity. Students may argue about source order or `!important`. Note their arguments — we'll get there.

Now the bigger question: **how does Blink decide this, for every element, on every style change, fast enough that a 60 Hz scroll doesn't stutter?**

## Two input data structures (5 min)

By the time the style engine runs, the parser has produced:

1. **The DOM** — a tree of element nodes.
2. **The CSSOM** — a parsed representation of all stylesheets. Each stylesheet becomes a list of rules; each rule has a list of selectors and a block of declarations.

The style engine's job: for each element in the DOM, compute a `ComputedStyle` — the final resolved property values after the cascade.

The output is stored as a pointer from each `Element` to a `ComputedStyle` object. `ComputedStyle` is a large immutable-ish struct containing every CSS property's resolved value. Blink aggressively shares `ComputedStyle` instances across elements that end up with identical styles (via a hash table) to save memory.

## Selector matching (15 min)

The core inner loop: given a rule like `#main .card p`, does this rule match element E?

**Blink matches selectors right-to-left.** Why? Because the rightmost selector (`p` in this case) is the cheapest filter. Most elements aren't `<p>`. If the rightmost doesn't match, reject immediately.

Algorithm sketch:

```
for each rule:
  rightmost_selector = rule.selectors[last]
  if rightmost matches element E:
    walk_up_ancestors(E, rule.selectors[0..last-1])
    if all matched: add declaration block to candidates
```

Optimizations Blink uses:

- **Rule buckets by key.** All rules with an ID selector go in one bucket keyed by ID. Class selectors, tag selectors, attribute selectors — each bucketed. When matching element E, only visit buckets relevant to E's attributes.
- **Bloom filter on ancestors.** For ancestor-chain selectors, use a bloom filter to quickly reject rules whose ancestor tokens can't possibly match E's ancestors.
- **Style sharing.** If two sibling elements have identical attributes and the same parent, they may reuse the same `ComputedStyle`.

The relevant code is in [`third_party/blink/renderer/core/css/resolver/style_resolver.cc`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/css/resolver/style_resolver.cc) and the rule set in `rule_set.cc`.

### Why this matters for performance

Bad selectors — ones that match too many elements or use expensive pseudo-classes — slow down style recalc. Selectors like `*` (universal) and `:nth-child()` with complex arguments used to be considered expensive but modern engines optimize them aggressively. The much bigger issue is **how many elements need a recalc**, not individual selector complexity.

## The cascade (10 min)

Once we have all matching rules for an element, the cascade decides which declaration wins for each property. The algorithm, summarized from [CSS Cascading & Inheritance Level 4](https://www.w3.org/TR/css-cascade-4/):

Rules are sorted by a tuple, in order of decreasing priority:

1. **Origin and importance.** User-agent stylesheets come first (lowest priority), then user stylesheets, then author stylesheets. `!important` inverts the ordering within origins.
2. **Context.** Shadow DOM encapsulation rules apply here.
3. **Specificity.** A triple `(a, b, c)` where `a` = count of ID selectors, `b` = count of class/attribute/pseudo-class selectors, `c` = count of tag/pseudo-element selectors. Compared lexicographically.
4. **Order of appearance.** Later rules win ties.

Put this on the board. Walk through the opening example:

| Rule | Specificity | Wins for `color`? |
|---|---|---|
| `div > p { color: blue; }` | (0,0,2) | no |
| `.card p { color: red; }` | (0,1,1) | no |
| `#main .card p { color: green; }` | (1,1,1) | yes — highest specificity |

Green wins. The earlier rules' `color` values are overridden.

`!important` would flip this — if `.card p { color: red !important; }`, red would win despite lower specificity, because `!important` promotes the rule into a higher-priority origin bucket.

### Inheritance

After cascade, some properties (`color`, `font-*`, `line-height`, etc.) inherit from parent if not specified. Others (`margin`, `border`, `display`) don't. The spec lists which do. In `ComputedStyle`, every property ends up with a value, resolved from cascade + inheritance + defaults.

### Custom properties (CSS variables)

`--primary-color: #0066cc` and `color: var(--primary-color)`. Custom properties are resolved at computed-value time, after cascade. They inherit by default. This is a huge feature for theme systems and the only modern-CSS feature we'll name-check.

## Style invalidation — the key performance concept (15 min)

When JavaScript mutates the DOM or a style, Blink has to figure out which elements need their style recomputed. Doing this well is the difference between snappy and janky.

### Naive approach

Invalidate every element's style on any change. Works. Horrifyingly slow.

### Blink's approach: invalidation sets

When a stylesheet is parsed, Blink builds **invalidation sets** — data structures that answer "if feature X changes on element E, which elements need recalc?"

Example: given `.highlight p { color: red; }`, Blink computes:

> "If an element gains or loses class `highlight`, invalidate all `<p>` descendants."

So when you run `element.classList.add('highlight')`, Blink:

1. Looks up the invalidation set for class `highlight`.
2. Marks all `<p>` descendants of `element` as needing style recalc.
3. Does NOT touch siblings, ancestors, or unrelated elements.

The code is in [`third_party/blink/renderer/core/css/invalidation/`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/css/invalidation/).

### Property-specific invalidation

Some property changes don't even need descendants re-computed. `color` doesn't inherit through non-`color` ancestors. Blink is increasingly property-specific in what it invalidates.

### The dirty bit walk

Once invalidation has marked elements dirty, the style-recalc pass walks the DOM tree and recomputes `ComputedStyle` only for dirty elements and their dirty descendants. Everyone else keeps their existing `ComputedStyle` pointer.

### Why this matters for JS authors

When you write:

```javascript
for (let el of hugeList) {
  el.style.color = 'red';
}
```

you cause one style recalc per iteration. Fix: batch by applying a class:

```javascript
hugeList.forEach(el => el.classList.add('red-text'));
// one recalc affecting all of them
```

Even better: if structure allows, put the class on a common ancestor and use a descendant selector. One property change, one invalidation.

## A tiny code excerpt — where recalc lives (5 min)

Open [`style_engine.cc`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/css/style_engine.cc). Search for `RecalcStyle`. You'll find something like:

```cpp
void StyleEngine::RecalcStyle() {
  DCHECK(GetDocument().documentElement());
  // ...
  StyleRecalcContext style_recalc_context;
  GetDocument().documentElement()->RecalcStyle(
      StyleRecalcChange(), style_recalc_context);
}
```

The recursion into the DOM tree lives in `Element::RecalcStyle`. Each element:

1. Checks its dirty bit.
2. If dirty, runs selector matching against the CSSOM.
3. Applies the cascade.
4. Produces a new `ComputedStyle`.
5. Recurses into children (with potentially reduced dirty state).

This is the heart of what runs during "Recalculate Style" in your Performance traces.

## Live demo — forced style recalc (15 min)

### Setup: a page with ~2000 elements

```html
<!DOCTYPE html>
<html><body>
<script>
  for (let i = 0; i < 2000; i++) {
    const div = document.createElement('div');
    div.className = 'box';
    div.textContent = 'Item ' + i;
    document.body.appendChild(div);
  }
</script>
<style>
  .box { padding: 4px; border: 1px solid #ccc; }
  .highlight { background: yellow; }
</style>
</body></html>
```

### Demo 1 — small invalidation

Open DevTools Performance panel. Start recording. In the console:

```javascript
document.querySelectorAll('.box')[500].classList.add('highlight');
```

Stop recording. Show the trace. A tiny "Recalculate Style" bar — maybe 1 element affected. Near-instant.

### Demo 2 — large invalidation

Start recording. In console:

```javascript
document.querySelectorAll('.box').forEach(el => el.classList.add('highlight'));
```

Stop. Show the trace. Huge "Recalculate Style" bar spanning many ms. Multiple entries, one per `classList.add` (or one big batch, depending on whether we're inside a microtask).

### Demo 3 — even larger, via ancestor

```javascript
// first remove all highlights
document.querySelectorAll('.box').forEach(el => el.classList.remove('highlight'));

// now add an ancestor class that reaches all descendants
// modify CSS first: .parent-on .box { background: yellow; }
document.body.classList.add('parent-on');
```

One DOM mutation → invalidation touches thousands of elements → one recalc bar, comparable total cost. Discuss the tradeoff.

### Demo 4 — forced recalc from getComputedStyle

Start recording:

```javascript
for (let el of document.querySelectorAll('.box')) {
  el.classList.toggle('highlight');
  const c = getComputedStyle(el).color;  // forces style to be up-to-date synchronously
}
```

Stop. Show the "Recalculate Style" bar that appears inside each iteration — classic style thrashing. This is the setup for HW6 (layout thrashing, same idea but for layout).

## Reading for next lecture

- [CSS Cascading & Inheritance Level 4](https://www.w3.org/TR/css-cascade-4/) — §6 "Cascading"
- [CSS Display Module Level 3](https://www.w3.org/TR/css-display-3/) — intro sections
- chromium.org: [LayoutNG design doc](https://docs.google.com/document/d/1uxbDh4uONFQOiGuiumlJBLGgO4KDWB8ZEkp7Rd47fw4/) — linked from chromium.org

## Instructor notes

- HW5 (Style Profiling) is assigned this lecture.
- Emphasize: most Unit II performance content reduces to "know which stage your change triggers." This lecture is the "what triggers style?" installment.
- Students with CS backgrounds find the invalidation-sets concept surprising. Linger on it.
- If time, briefly mention the shadow DOM — Blink's style engine has to scope styles per shadow tree, which adds significant complexity.

---

[← L8](./L08-blink-parsing-dom.md) · [Unit II README](./README.md) · [Next: L10 — Layout →](./L10-layout-layoutng.md)

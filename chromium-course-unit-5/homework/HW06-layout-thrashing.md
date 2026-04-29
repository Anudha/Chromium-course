# HW6 — Layout Thrashing

**Assigned:** Week 6 · **Due:** End of Week 6 (before midterm) · **Weight:** ~2.3% of course grade

## Goal

Produce a page that deliberately triggers layout thrashing, measure the impact, then refactor to batch reads and writes and measure the improvement.

## Background

In L10 we discussed **forced synchronous layout**: reading layout-dependent properties (`offsetTop`, `offsetHeight`, `getBoundingClientRect`, etc.) after a DOM mutation forces Blink to complete layout synchronously. Repeating this in a loop is called *layout thrashing* and is among the most common web performance bugs.

## Deliverables

Submit a git-style folder `HW6-<unityID>/` containing:

1. `thrashing.html` — the deliberately-slow version
2. `batched.html` — the fixed version
3. `report.md` or `report.pdf` — the analysis (described below)
4. `thrashing.json`, `batched.json` — two Performance-panel traces
5. A short screen recording (`demo.mp4` or `.webm` or `.gif`) showing both pages running side by side
6. `AI-USAGE.md`

## Step 1 — the thrashing version

Build a page with at least 500 elements. Write JavaScript that, in a loop:

1. Modifies an element's size or style (mutates, invalidating layout).
2. Reads a layout-dependent property from the element.
3. Uses that value to drive further mutation.

A canonical pattern:

```javascript
const boxes = document.querySelectorAll('.box');
for (const el of boxes) {
  el.style.width = (Math.random() * 100 + 50) + 'px';
  const h = el.offsetHeight;        // forces layout
  el.dataset.height = h;
  el.style.height = (h + 10) + 'px'; // force another layout on next iteration
}
```

Your version may be different but must genuinely thrash.

## Step 2 — measure the thrashing

Record a Performance trace while the thrashing loop runs. You should see:

- Many "Layout" bars, often back-to-back.
- Possibly "Forced reflow" warnings (visible in event detail as a purple triangle).
- A total time dominated by layout work.

Export as `thrashing.json`.

Report:

- Wall-clock time to complete the loop (`console.time`/`console.timeEnd`).
- Number of layout events recorded.
- Total layout time across all events.

## Step 3 — the batched version

Refactor so reads and writes are separated:

```javascript
// Read phase
const heights = boxes.map(el => el.offsetHeight);

// Write phase
for (let i = 0; i < boxes.length; i++) {
  boxes[i].style.width = (Math.random() * 100 + 50) + 'px';
  boxes[i].style.height = (heights[i] + 10) + 'px';
}
```

The output must be functionally equivalent (or document any intentional differences).

## Step 4 — measure the batched version

Record a new Performance trace.

Report the same metrics as Step 2. The batched version should be dramatically faster — often 10-100x.

## Step 5 — write the report

In `report.md`, include:

1. **What you did** — both versions' code snippets.
2. **Timing comparison** — wall-clock and layout-event counts for each.
3. **Explanation** — why is the batched version faster? Reference what you know about Blink's lifecycle (style / layout / paint phases). 3-5 sentences.
4. **A subtle question**: in the batched version, is there still *one* layout happening? If so, when? Explain.
5. **Relevance** — name one real-world scenario (e.g., a library, an animation, a framework) where this pattern would matter.

## Screen recording

Record a 15-30 second clip showing both pages running, with some visible UI indicator (e.g., a button to start the loop, a timing display). This is proof-of-work that both versions actually work.

## Submission

Zip the folder as `HW6-<unityID>.zip`.

## Why this is AI-resistant

- Timings are specific to your hardware.
- The screen recording shows a real artifact running.
- The "subtle question" requires understanding, not just retrieval.

## Grading rubric

| Component | Points |
|---|---|
| Thrashing version works and genuinely thrashes | 20 |
| Batched version works and produces equivalent output | 20 |
| Both traces captured and exported | 15 |
| Timing numbers reported for both | 10 |
| Explanation of *why* batching helps | 15 |
| Answer to subtle question about "one layout still happens" | 10 |
| Real-world relevance argument | 5 |
| Screen recording | 5 |
| **Total** | **100** |

## Hints

- `requestAnimationFrame` is a natural place to batch — reads in one rAF, writes in the next.
- If you can't see a warning in DevTools, try the "Performance insights" panel or zoom into individual frames.
- If both versions are the same speed, you're probably not actually thrashing — check that your reads come *after* writes and invalidate layout each iteration.

## AI usage policy

AI may help with explaining what you see. The code and the measurements must be yours. Cite in `AI-USAGE.md`.

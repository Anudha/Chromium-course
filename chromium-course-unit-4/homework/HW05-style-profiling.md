# HW5 — Style Profiling

**Assigned:** Week 5 · **Due:** End of Week 5 · **Weight:** ~2.3% of course grade

## Goal

Produce a page with controllable style-recalc cost, measure three different invalidation patterns, and explain the cost differences from first principles.

## Background

In L9 we saw that Blink uses **invalidation sets** to limit style recalc to elements that could actually be affected by a change. This HW asks you to cause recalcs of different sizes and measure them.

## Deliverables

Submit a git-style folder `HW5-<unityID>/` containing:

1. `page.html` — the test page you built
2. `report.md` or `report.pdf` — the analysis (described below)
3. Three `.json` Performance-panel trace files exported from DevTools: `small.json`, `large.json`, `surprising.json`
4. `AI-USAGE.md`

## Step 1 — build the test page

Construct a page with **at least 1000 DOM nodes**. Suggestion:

```html
<!DOCTYPE html>
<html><head><style>
  .box { padding: 4px; border: 1px solid #ccc; margin: 2px; display: inline-block; width: 80px; }
  .highlight { background: yellow; }
  .theme-dark .box { background: #333; color: white; }
</style></head><body>
<div id="container"></div>
<script>
  const c = document.getElementById('container');
  for (let i = 0; i < 1500; i++) {
    const d = document.createElement('div');
    d.className = 'box';
    d.textContent = 'Item ' + i;
    c.appendChild(d);
  }
</script>
</body></html>
```

You may modify or extend it.

## Step 2 — measure three scenarios

For each scenario, open DevTools Performance panel, start recording, trigger the scenario from the console, stop recording, then export the trace as JSON (click "Save profile…" icon in the Performance panel).

### Scenario A — small invalidation (file: `small.json`)

Cause a recalc that affects ~1 element. Suggestion:

```javascript
document.querySelectorAll('.box')[500].classList.add('highlight');
```

### Scenario B — large invalidation (file: `large.json`)

Cause a recalc that affects ~1500 elements. Suggestion:

```javascript
document.querySelectorAll('.box').forEach(el => el.classList.add('highlight'));
```

### Scenario C — surprisingly expensive (file: `surprising.json`)

Cause a recalc that is expensive for a reason beyond "it touched many elements." Surprise the grader. Possibilities:

- A change to a single ancestor class that invalidates all descendants via a descendant selector (theme toggle).
- A `:hover` on an element high in the tree that cascades into many descendants.
- A change affecting a custom property that's used pervasively.

Explain in your report why your chosen case is *surprising* — the point is to go beyond "more elements = more cost."

## Step 3 — write the report

In `report.md`, for each scenario:

1. **What you did** — the exact JS or interaction.
2. **The cost** — "Recalculate Style" duration in milliseconds, and number of elements affected (visible in the DevTools event detail panel).
3. **Why this cost** — explain using what you know about invalidation sets, selector matching, and the cascade. 2-4 sentences.

Then write a closing section (1-2 paragraphs) answering: **if you were advising a web developer on this page, what's the one rule of thumb you'd give them about class/style mutations?**

## Submission

Zip the folder as `HW5-<unityID>.zip`.

## Why this is AI-resistant

Performance traces are specific to your machine's hardware and OS. AI cannot fabricate them. The "surprising" scenario requires understanding that AI can help with but the experimental result must come from you.

## Grading rubric

| Component | Points |
|---|---|
| Test page loads, has 1000+ nodes | 10 |
| Three traces captured and exported | 30 |
| Cost numbers reported accurately | 15 |
| Explanations reference invalidation sets correctly | 25 |
| "Surprising" scenario is genuinely surprising | 10 |
| Closing advice is substantive | 10 |
| **Total** | **100** |

## AI usage policy

You may use AI to explain what you see in traces. Cite in `AI-USAGE.md`.

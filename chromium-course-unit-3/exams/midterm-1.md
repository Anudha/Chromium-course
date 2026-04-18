# Midterm 1

**When:** Thursday, Week 6, in class · **Duration:** 80 minutes · **Weight:** 15%
**Covers:** Units I–II (Foundations + Rendering Pipeline, Lectures 1–12)
**Materials allowed:** one handwritten, one-sided 8.5×11 note sheet. No laptops, no phones, no AI.

## Format

Three parts, 100 points total.

| Part | Points | Time guide |
|---|---|---|
| A — Short answer | 30 | 20 min |
| B — Reading real code | 30 | 25 min |
| C — Pipeline tracing | 40 | 35 min |

---

## Part A — Short answer (30 pts, 10 questions × 3 pts)

Sample questions (the actual exam draws from a similar pool):

1. What does `gn gen` produce that `ninja` consumes?
2. Why is the HTML preload scanner important for performance?
3. Distinguish `deps` from `public_deps` in a GN `BUILD.gn` target.
4. Name four top-level directories in `chromium/src` and briefly describe each.
5. What is the role of an `OWNERS` file? Who can `+2` a CL?
6. What is Site Isolation, at a one-sentence level? Why was it introduced?
7. In the rendering pipeline, which step produces a `ComputedStyle`? What does it consume?
8. Name three process types in Chromium's multi-process architecture and state what each is responsible for.
9. What does `is_component_build = true` do, and why would you use it during development?
10. Distinguish "layout" from "paint" — what does each produce?

---

## Part B — Reading real code (30 pts)

A ~40-line code snippet from Blink (parser, style, or layout code) will be provided. Answer 6 questions (5 pts each) about:

- What the code does at a high level.
- What a specific line is doing.
- What would happen if a given line were removed.
- Which directory in `chromium/src` the snippet likely comes from, and why.
- Whether this code would run on the main thread or a worker thread.
- What function or system would typically call this code.

**Preparation:** browse Code Search regularly during Weeks 3–5. Open random files in `third_party/blink/renderer/core/` and practice reading them cold.

---

## Part C — Pipeline tracing (40 pts)

You will be given a small HTML/CSS/JavaScript snippet, roughly:

```html
<style>
  .box { transform: translateX(0); transition: transform 300ms; }
</style>
<div class="box">Hello</div>
<script>
  document.querySelector('.box').style.transform = 'translateX(100px)';
</script>
```

Describe **every stage** of what Chromium does from the moment this HTML begins loading to the moment the animation completes. For each stage, identify:

1. The name of the stage (parse, style, layout, paint, composite, etc.)
2. Which thread it runs on (main thread, compositor thread, raster thread, GPU thread)
3. What input it consumes
4. What output it produces
5. Whether the given snippet causes a re-run of that stage (and why)

A correct answer will identify that the transform animation runs on the compositor thread and does not trigger style, layout, or paint for each frame — and explain why.

---

## Study guide

- Review lecture recordings for L1–L12.
- Re-do HW1 through HW6 (the HW covers much of what's tested).
- Be fluent with the rendering pipeline diagram from L7.
- Know which thread runs which stage (L11, L12).
- Practice Code Search navigation (Part B skill).

---

## Grading notes for instructor

- Part A: accept any correct answer in any phrasing. Generous partial credit for close-but-not-quite.
- Part B: students vary wildly. Anchor grading on a rubric you write after reading 5–10 papers.
- Part C: a complete answer touches parse → style → layout → paint → composite, names the threads, and correctly identifies that `transform` is compositor-only.

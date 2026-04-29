# Unit II — The Rendering Pipeline

**Weeks 4–6 · Lectures 7–12**

This unit walks the full path from HTML text to pixels on screen. Students build the mental model they'll reference for the rest of the course (and career): parse → style → layout → paint → composite.

By the end of Week 6, every student can:

- Recite the stages of the rendering pipeline and what thread each runs on.
- Read a Performance-panel trace and identify which stage dominates.
- Explain why `transform` animations are cheap and `top` animations expensive.
- Reason about LayoutNG's fragment tree and why it exists.
- Profile real pages and identify layout thrashing, paint storms, and compositor jank.

## Lectures

| # | Title | Demo |
|---|---|---|
| [L7](./L07-url-to-pixels.md) | From URL to Pixels: The Rendering Pipeline in 90 Minutes | DevTools Performance recording, annotated frame-by-frame |
| [L8](./L08-blink-parsing-dom.md) | Blink: Parsing HTML and Building the DOM | Preload scanner trace; streaming parse observation |
| [L9](./L09-style-computed.md) | Style: From CSS to ComputedStyle | Forced style recalc via DevTools "Rendering" tab |
| [L10](./L10-layout-layoutng.md) | Layout: Box Trees, Block/Inline, and LayoutNG | Layout Shift Regions overlay; fragment tree inspection |
| [L11](./L11-paint-raster.md) | Paint and Raster: Turning Boxes into Bitmaps | `chrome://tracing` capture showing raster tasks |
| [L12](./L12-compositor.md) | The Compositor: Why Scrolling Is 60fps Magic | `top` vs `transform` animation jank comparison |

## Unit learning outcomes

Students who complete Unit II can:

1. Trace a page load through parse, style, layout, paint, and composite.
2. Identify which thread executes each stage.
3. Predict which DOM or CSS changes trigger which pipeline stages to re-run.
4. Use DevTools Performance panel to diagnose rendering bottlenecks.
5. Explain the architectural role of LayoutNG, Skia, and the compositor.

## Associated homework

- [HW4 — Parser Pathology](../../homework/HW04-parser-pathology.md) (assigned L8, due end of Week 4)
- [HW5 — Style Profiling](../../homework/HW05-style-profiling.md) (assigned L9, due end of Week 5)
- [HW6 — Layout Thrashing](../../homework/HW06-layout-thrashing.md) (assigned L10, due end of Week 6)

## Midterm 1

**Thursday of Week 6, in class.** Covers Units I–II. See [exams/midterm-1.md](../../exams/midterm-1.md).

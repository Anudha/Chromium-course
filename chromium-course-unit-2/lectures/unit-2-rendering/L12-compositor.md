# Lecture 12 — The Compositor: Why Scrolling Is 60fps Magic

| | |
|---|---|
| **Unit** | II — The Rendering Pipeline |
| **Week** | 6 |
| **Duration** | 1.5 hours |
| **Demo** | `top` vs `transform` animation jank comparison |

## Learning objectives

Students can:

1. Explain what a compositor layer is.
2. Describe the main-thread / compositor-thread split and what each owns.
3. Identify which CSS properties can animate on the compositor alone.
4. Reason about when to use `will-change` and what it costs.

## Opening hook (5 min)

Put this on the projector, side by side, running:

```html
<!-- Left box: animates `top` -->
<div style="animation: move-top 2s infinite;">Top</div>
<style>
@keyframes move-top { to { top: 300px; } }
</style>

<!-- Right box: animates `transform` -->
<div style="animation: move-transform 2s infinite;">Transform</div>
<style>
@keyframes move-transform { to { transform: translateY(300px); } }
</style>
```

Then open DevTools and in the console throw a tight JavaScript loop:

```javascript
setInterval(() => { const t = Date.now() + 50; while (Date.now() < t) {} }, 100);
```

The left box stutters. The right box is silky smooth.

Why? **One is main-thread, one is compositor-thread.** By the end of this lecture students will know exactly what that means and be able to predict which box is smooth without running the demo.

## The compositor thread — what it is and what it owns (15 min)

Return to the thread model from L7:

```
RENDERER PROCESS
┌─────────────────────────────────────────┐
│  Main thread                            │
│  ┌──────────────────────────────────┐   │
│  │ JS, DOM, Style, Layout, Paint    │   │
│  └──────────────────────────────────┘   │
│                                         │
│  Compositor thread                      │  ← this lecture
│  ┌──────────────────────────────────┐   │
│  │ Layer tree, scroll, composited   │   │
│  │ animations, hit-testing          │   │
│  └──────────────────────────────────┘   │
│                                         │
│  Raster workers (pool)                  │
└─────────────────────────────────────────┘
```

**The compositor thread owns a copy of the layer tree.** Specifically, two trees, and this is important:

- **Pending tree** — being updated from the main thread.
- **Active tree** — currently being drawn each frame.

Frame production happens on the compositor thread. Every vsync (typically every 16.67 ms at 60 Hz), the compositor:

1. Checks the active tree.
2. Decides which tiles/layers to draw based on scroll position.
3. Issues GPU draw commands for the current frame.
4. Calls `SwapBuffers` on the GPU process.

**The main thread is NOT in the critical path for most frames.** If the main thread is blocked or slow, the compositor keeps drawing frames based on the last active tree it has. Scrolling, transform animations, and opacity animations keep going.

### What the compositor *cannot* do

- Run JavaScript.
- Update the DOM.
- Run style or layout.
- Paint new display lists (that's the main thread's job).

So if an animation requires, say, running a `requestAnimationFrame` callback to compute the next frame's state, **that callback runs on the main thread and can block.**

## Compositor layers (10 min)

The compositor's unit of work is a **layer**. A layer has:

- A texture (the rasterized pixels from L11).
- A transform (position, rotation, scale, skew).
- An opacity.
- A clip rect.
- A parent layer in the tree.

The compositor draws layers from back to front, respecting z-ordering. For each layer, it applies the transform and opacity to its texture and blends into the output framebuffer.

**Animating a layer's transform or opacity does not require rastering new pixels.** The texture is already on the GPU. The compositor just applies different transform matrices each frame.

### When does an element get its own layer?

An element is promoted to its own compositor layer when it has:

- `transform` with an animation.
- `opacity` with an animation.
- `will-change: transform` or `will-change: opacity`.
- `position: fixed` (usually).
- `<video>` or `<canvas>` (usually).
- Certain CSS filters.
- `backdrop-filter`.
- Certain `contain` values.

Chromium used to have more heuristics (the "overlap test") that would promote layers to avoid paint order issues. These have been gradually removed as the architecture improved.

The current rules live in [`cc/trees/property_tree_builder.cc`](https://source.chromium.org/chromium/chromium/src/+/main:cc/trees/) and the Blink side determines promotion during the compositing inputs phase.

### Cost of layers

Each layer:

- Uses GPU memory for its texture (hundreds of KB to MB).
- Adds compositor work each frame.
- Complicates hit testing.

**Don't promote everything.** Too many layers = worse performance, not better. `will-change` on every element is an anti-pattern.

## Which properties are cheap to animate? (10 min)

The cheat sheet every web dev needs:

| Property | Cost |
|---|---|
| `transform` (on promoted layer) | **Compositor only.** Cheap. |
| `opacity` (on promoted layer) | **Compositor only.** Cheap. |
| `filter` (on promoted layer, some filters) | Compositor only. Cheap-ish. |
| `background-color` | Paint + raster + composite. Medium. |
| `color` | Paint + raster + composite. Medium. |
| `width`, `height`, `margin`, `padding` | Layout + paint + raster + composite. **Expensive.** |
| `top`, `left`, `right`, `bottom` | Layout + paint + raster + composite. **Expensive.** |
| `font-size` | Style + layout + paint + raster + composite. **Very expensive.** |

Rule: **`transform: translate(...)` instead of changing `top`/`left`. `opacity: 0` instead of `visibility: hidden`.** Animations should move to the compositor whenever possible.

This is why the opening-hook demo stutters on the left and is smooth on the right. The `top` animation runs layout + paint + raster + composite every frame on the main thread, which is blocked by the JS tight loop. The `transform` animation runs only on the compositor thread, which doesn't care about the blocked main thread.

## Composited scrolling and input (10 min)

Scrolling is the canonical compositor-only operation. When you drag two fingers on a trackpad, or hit PgDn:

1. The OS sends input events to Chromium's browser process.
2. Browser forwards them to the compositor thread directly — **not the main thread**.
3. The compositor updates its scroll offset.
4. Next frame, it draws the already-rasterized tiles at the new scroll offset.

This is **composited scrolling** (also called "threaded scrolling"). The main thread is never involved for simple scroll. This is why scrolling is smooth even on pages with heavy JavaScript.

Exceptions — cases that fall back to main-thread scrolling:

- `scroll` event handlers that call `event.preventDefault()` (to block scrolling).
- Non-passive `wheel` event handlers (for the same reason — the compositor can't know whether the handler will cancel).
- Certain CSS properties on the scroller (e.g., `background-attachment: fixed` used to trigger it; mostly fixed now).

When scrolling falls back to main-thread, you get stutter during heavy JS. The Chrome team has put years of work into making passive scroll the default and encouraging developers to use passive event listeners:

```javascript
element.addEventListener('wheel', handler, { passive: true });
```

## A tiny code excerpt — scheduling a compositor frame (5 min)

Open [`cc/scheduler/scheduler.cc`](https://source.chromium.org/chromium/chromium/src/+/main:cc/scheduler/scheduler.cc). This is the compositor's state machine. Every frame is orchestrated here.

Point out the high-level shape: a `SchedulerStateMachine` that decides, at each vsync, whether to:

- Start a new BeginMainFrame (request work from the main thread).
- Start a new impl-side frame (the compositor-only path).
- Wait for raster.
- Submit the compositor frame to the GPU process.

Students don't need to read this. But it's useful to know this is where "frame production" lives.

## `will-change`, `contain`, and the modern promotion API (5 min)

### `will-change`

Hint to the browser: "this property is going to change soon, please promote." Valid values: `transform`, `opacity`, `scroll-position`, `contents`, or a specific property name.

Use when:
- An animation is about to start (then remove `will-change` when done to free GPU memory).
- A user interaction is about to cause change (e.g., on hover, set `will-change` for the element that's about to animate).

Don't use:
- On every element (blows up GPU memory).
- Permanently on elements that rarely animate.

### `contain`

CSS `contain: paint|layout|style|size|content` is a hint that a subtree is self-contained. Lets the browser skip work outside the container when something inside changes. `contain: content` is commonly useful.

### `content-visibility`

`content-visibility: auto` defers layout, paint, and raster of off-screen content until scrolled into view. Huge win for long pages. Preview for students interested in Core Web Vitals optimization.

## Live demo — compositor win, compositor loss (15 min)

### Demo 1 — the opening hook, with measurement

Use the side-by-side page from the opening. Open Performance panel. Record for 3 seconds with the JS tight loop running.

Show students:

- The `top` animation frame is main-thread work, bars everywhere in the timeline.
- The `transform` animation shows only compositor-thread activity (scroll to the compositor row).
- FPS on the right box stays at 60. FPS on the left box tanks.

### Demo 2 — layer inspection

Open DevTools → three-dot menu → More tools → **Layers**.

The Layers panel shows every compositor layer currently active on the page. Click one to see:
- Its dimensions
- Its GPU memory cost
- Why it was promoted (the "Compositing reasons")

Visit a complex page. Count the layers. Often more than you'd guess.

Then open DevTools → **Rendering** tab → enable **"Layer borders"**. Every compositor layer gets an orange border overlaid on the page. Visual confirmation of what was promoted.

### Demo 3 — intentional misuse of will-change

Live-code a page with 1000 elements, all getting `will-change: transform`. Watch GPU memory usage balloon (visible in `chrome://gpu`). Compare to the same page without `will-change`. Illustrate: `will-change` is a tool, not a magic word.

### Demo 4 — passive event listeners

Construct a page with a non-passive wheel handler:

```javascript
window.addEventListener('wheel', () => {
  // do nothing, but force compositor to wait
}, { passive: false });
```

Compared with:

```javascript
window.addEventListener('wheel', () => {}, { passive: true });
```

Scrolling with a busy main thread. The non-passive one stutters; the passive one doesn't. DevTools will actually warn in the console about non-passive wheel listeners.

## Midterm 1 review (10 min)

Midterm 1 is Thursday this week. Spend the last 10 minutes reviewing:

- The pipeline diagram (L7).
- The three-trees diagram (L10).
- The thread model (L7, L12).
- Which changes trigger which stages (L7 table).
- Style invalidation sets (L9).
- Layout thrashing (L10).
- Paint vs. raster (L11).
- Compositor-only animations (this lecture).

Remind students of format: Part A short answer, Part B read-real-code, Part C pipeline tracing. Post practice questions on the course site.

## Reading for next lecture

No reading — midterm is Thursday. Study the prior reading list.

After midterm, next unit starts:

- [v8.dev](https://v8.dev) homepage — browse. The blog posts are the primary source material for Unit III.
- v8.dev: [Launching Ignition and TurboFan](https://v8.dev/blog/launching-ignition-and-turbofan)

## Instructor notes

- This is a pivotal lecture. If students leave understanding why transform is cheap and top is expensive, you've succeeded.
- The opening-hook demo is worth nailing. Practice it before class.
- The Layers panel is under-used. Highlight it.
- After Unit II, the course gets easier — the rendering pipeline is the hardest material. Tell students this.

---

[← L11](./L11-paint-raster.md) · [Unit II README](./README.md) · **End of Unit II** · Next: Unit III coming soon

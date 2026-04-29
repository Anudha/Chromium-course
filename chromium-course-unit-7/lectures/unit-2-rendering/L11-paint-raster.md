# Lecture 11 — Paint and Raster: Turning Boxes into Bitmaps

| | |
|---|---|
| **Unit** | II — The Rendering Pipeline |
| **Week** | 6 |
| **Duration** | 1.5 hours |
| **Demo** | `chrome://tracing` capture showing raster tasks |

## Learning objectives

Students can:

1. Distinguish paint (record) from raster (execute).
2. Describe a display list and what PaintOps are.
3. Explain tiling and why Chromium rasters tiles, not whole layers.
4. Identify the role of Skia and its GPU vs. CPU backends.

## Opening hook (5 min)

Ask: *"When Chromium finishes layout, it knows the size and position of every box. It knows every color and font. Why isn't it done?"*

Let students think. The gap: **Chromium still has to actually put colored pixels into memory, then get that memory onto your screen.** That's two more steps — paint (which produces a recipe) and raster (which executes the recipe).

This lecture is the recipe-and-execution layer. Crucial, and mostly invisible unless you know where to look.

## The record/playback split (10 min)

A key architectural decision in Chromium's graphics stack: **paint is separated from raster**. Paint produces a *display list* — a sequence of drawing commands. Raster *executes* the display list to produce pixels.

Why separate? Three reasons:

1. **Raster can happen on worker threads.** The main thread records the list (fast). Raster workers execute the list (slow). Main thread isn't blocked.
2. **The same display list can be rasterized at different scales** for devicePixelRatio, zoom, and content-scale.
3. **Display lists can be inspected and debugged.** DevTools shows them.

Draw this:

```
Main thread                      Raster worker threads            GPU process
───────────                      ──────────────────────           ────────────

PaintLayer tree       ┌─ displaylist1 ─▶   Skia executes  ─▶   GPU texture tile
     │                │                       (GPU or CPU)
     │ paint          │
     ▼                │
Display lists ────────┼─ displaylist2 ─▶   Skia executes  ─▶   GPU texture tile
 (one per tile /      │
  paint chunk)        └─ displaylist3 ─▶   Skia executes  ─▶   GPU texture tile
```

## Paint — producing the display list (10 min)

Paint walks the LayoutObject tree (actually, the paint property tree and paint chunks — let's abstract for now) and emits drawing commands. Each box, each text run, each background gets one or more commands.

A display list is essentially a recorded sequence of calls to a canvas API. Blink's display list uses `PaintOpBuffer` containing `PaintOp` records. Commands look conceptually like:

```
DrawRect(x=10, y=20, w=100, h=50, paint=fill_red)
DrawTextBlob(blob=<"Hello"-shaped>, x=15, y=40, paint=fill_black)
DrawImage(image=<ref>, dst_rect=...)
Save()
ClipRect(rect=...)
Translate(dx, dy)
DrawPath(path, paint)
Restore()
```

This is intentionally similar to Skia's `SkCanvas` API because **Skia is what actually draws.** Chromium's paint layer is essentially a driver that produces `SkCanvas`-compatible command streams.

### Paint order — stacking contexts

Paint respects CSS's **stacking context** rules. An element establishes a stacking context when it has a non-`auto` `z-index`, `position: fixed`, `opacity < 1`, certain transforms, and so on. Stacking contexts paint atomically — their subtree is a unit in the z-order.

Bad paint order produces visible glitches. Chromium's paint-order logic is carefully tested against the web-platform tests.

### What code runs paint

The paint lifecycle phase kicks off in `LocalFrameView::RunPaintLifecyclePhase`. Walks produce paint chunks, stored in `PaintArtifact`. Later code (in the compositor lifecycle) converts paint chunks into layers and display lists.

Students don't need to know all the classes — but if they grep for `PaintController` in `third_party/blink/renderer/core/paint/`, they'll find the entry points.

## Skia — the 2D graphics library (10 min)

[Skia](https://skia.org) is a standalone 2D graphics library. It started at a company called Skia Inc., acquired by Google in 2005, and is now maintained by Google as open source. It backs:

- Chromium (paint and raster)
- Android (for a long time, as the default 2D engine)
- Flutter (via its underlying engine)
- Firefox (uses Skia for some paths, last I checked)
- Many other projects

Skia provides:

- **`SkCanvas`** — the drawing API. Rectangles, paths, text, images.
- **`SkPath`** — vector paths.
- **`SkPaint`** — the "paint" object: color, stroke width, shader, blend mode, filter.
- **`SkShader`**, **`SkMaskFilter`**, **`SkColorFilter`** — the building blocks of visual effects.
- **Multiple backends**: CPU raster, GPU (via Ganesh on OpenGL/Metal, or Graphite on modern APIs), and a new **CPU-optimized raster using SIMD**.

Chromium uses the **GPU backend** when available — meaning the display list gets executed via GPU commands (OpenGL, Metal, Direct3D, or Vulkan depending on platform, all mediated by ANGLE or Dawn). Falls back to CPU raster when GPU is unavailable or blacklisted.

Why GPU? Modern graphics cards can fill pixels orders of magnitude faster than CPUs for many operations. Especially gradients, blurs, image scaling. The catch: uploading/downloading between GPU and CPU memory is expensive. Chromium carefully manages this.

## Tiling — the unlock that makes scrolling fast (15 min)

Here's the problem: a full-page screenshot of a long article might be 1920×10000 pixels. Allocating a buffer that size, rasterizing the whole thing, and re-rasterizing it when *anything* changes is wasteful.

Solution: **chop the page into tiles**, typically 256×256 or 512×512 pixels. Each tile is independently:

- Rasterized once (cached as a GPU texture).
- Kept around while relevant.
- Re-rasterized only if its contents change.

Scrolling is just moving a viewport across an already-rasterized grid of tiles. The compositor picks which tiles overlap the viewport, uploads any missing ones to GPU memory, and composes them. This is *why scrolling is so fast* — almost no raster work happens during a scroll if tiles are already done.

Tiling also enables:

- **Checkerboarding.** If the user scrolls past the rasterized region faster than raster can keep up, they briefly see a solid color (the tile's background) where pixels aren't ready yet. Ugly but survivable.
- **Prioritization.** Tiles near the viewport raster first. Far-away tiles raster later (or not at all).
- **Discarding.** Tiles far outside the viewport can be evicted to save memory.

Draw this:

```
┌──────┬──────┬──────┬──────┐
│ tile │ tile │ tile │ tile │
├──────┼──────┼──────┼──────┤
│ tile │██████│██████│ tile │  ← viewport (the user's screen)
├──────┼──████│██████┼──────┤
│ tile │██████│██████│ tile │  ← tiles inside viewport: rastered, ready
├──────┼──────┼──────┼──────┤
│ tile │ tile │ tile │ tile │  ← outside tiles: may be rastered ahead, or not
└──────┴──────┴──────┴──────┘
```

Tiling lives in `cc/tiles/` in Chromium. The `Tile`, `TileManager`, and `PictureLayerTiling` classes are the heart of it.

## A tiny code excerpt — a PaintOp (5 min)

Open [`cc/paint/paint_op_buffer.h`](https://source.chromium.org/chromium/chromium/src/+/main:cc/paint/paint_op_buffer.h). Show students the `PaintOpType` enum:

```cpp
enum class PaintOpType : uint8_t {
  kAnnotate,
  kClipPath,
  kClipRect,
  kClipRRect,
  kConcat,
  kCustomData,
  kDrawColor,
  kDrawDRRect,
  kDrawImage,
  kDrawImageRect,
  kDrawIRect,
  kDrawLine,
  kDrawOval,
  kDrawPath,
  kDrawRecord,
  kDrawRect,
  kDrawRRect,
  kDrawSkottie,
  kDrawSlug,
  kDrawTextBlob,
  kDrawVertices,
  kNoop,
  kRestore,
  kRotate,
  kSave,
  kSaveLayer,
  kSaveLayerAlpha,
  kScale,
  kSetMatrix,
  kSetNodeId,
  kTranslate,
};
```

That's the alphabet of everything Blink can draw. Every visible pixel in Chrome comes from some sequence of these being executed by Skia.

## Live demo — `chrome://tracing` (15 min)

This is the single most powerful debugging tool in the course. Spend time.

### Setup

1. Open `chrome://tracing`.
2. Click "Record."
3. Choose the "Rendering" category (or "Frame viewer").
4. Click "Record" — the UI says "recording."
5. Switch to a normal Chrome tab. Load or scroll a content-rich page for 2–3 seconds.
6. Switch back to `chrome://tracing`. Click "Stop."
7. The trace viewer opens.

### What to show

- Navigate by dragging. Zoom with mousewheel.
- **Main thread row** of the renderer process — shows JS, parse, style, layout, paint events.
- **Compositor thread row** — shows frame production.
- **Raster worker rows** — shows raster tasks. Each task is a tile being rasterized.
- **GPU process row** — shows GPU commands and `SwapBuffers`.

Find a `Paint` event on the main thread. See its short duration. Find `RasterTask` events on the worker rows. See their longer durations. Point out: raster workers run in parallel; you can see multiple tiles rastering simultaneously.

### The "Frame viewer"

If Record was done with Frame Viewer enabled, you can step frame by frame and see:

- The display list for each layer
- The tile grid
- Which tiles were rasterized this frame

This is the deepest look at raster you can get without a debugger.

### Fancy: profile a real site

Load [cnn.com](https://cnn.com) or any content-heavy page. Record tracing during load. You'll see raster tasks absolutely dominate the timeline — image-heavy pages spend most of their render budget rasterizing tiles.

Contrast with a text-only page (load Wikipedia, a specific article). Far fewer raster tasks, completed much faster. The visible relationship between content complexity and raster cost.

## What paint invalidation looks like (10 min)

When only paint (not layout) changes — e.g., you change `background-color` — only the paint stage re-runs. The compositor re-rasterizes affected tiles. Layout stays cached.

When `will-change: transform` or similar is set, the browser promotes the element to its own compositor layer. Future transform changes become **composite-only** — no paint or raster. The layer already has its pixels; the compositor just moves it.

That's the core magic of 60fps animations. We'll spend L12 entirely on the compositor.

### When to reach for `will-change`

Rule of thumb: if an element will animate `transform` or `opacity` and animation is janky, add `will-change: transform`. Don't add it to everything — compositor layers use GPU memory. Too many layers hurt performance.

## Reading for next lecture

- chromium.org: [How cc Works](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/how_cc_works.md)
- chromium.org: Design doc [Compositor thread architecture](https://www.chromium.org/developers/design-documents/compositor-thread-architecture/)
- [Skia documentation](https://skia.org/docs/) — skim the "Overview" section

## Instructor notes

- Students will want to confuse paint with raster. Drill the distinction: **paint = record commands, raster = execute commands**.
- The `chrome://tracing` demo is dense. Don't try to explain every row. Point out the main thread / compositor / raster workers separation; that's the learning goal.
- L12 builds on this — the compositor consumes tiles and produces frames.

---

[← L10](./L10-layout-layoutng.md) · [Unit II README](./README.md) · [Next: L12 — Compositor →](./L12-compositor.md)

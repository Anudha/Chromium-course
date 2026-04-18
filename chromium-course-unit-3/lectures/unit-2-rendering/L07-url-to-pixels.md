# Lecture 7 — From URL to Pixels

**The Rendering Pipeline in 90 Minutes**

| | |
|---|---|
| **Unit** | II — The Rendering Pipeline |
| **Week** | 4 |
| **Duration** | 1.5 hours |
| **Demo** | DevTools Performance recording, annotated frame-by-frame |

## Learning objectives

Students can:

1. Name the stages of the rendering pipeline in order.
2. Identify which thread each stage runs on.
3. Predict which stages must re-run for a given DOM/CSS change.
4. Read a DevTools Performance trace at a basic level.

## Opening hook (5 min)

Put this on the board before class:

```
<!DOCTYPE html>
<html><body>
  <style>.box { color: red; font-size: 24px; }</style>
  <div class="box">Hello 591</div>
</body></html>
```

Ask: *"You paste this into an empty tab. What does Chromium actually do to put the text 'Hello 591' on your screen?"*

Let students answer. Common responses: "it parses the HTML," "it reads the CSS," "it... renders?" Note on the board how fuzzy the answers get after "parse."

This lecture gives them a diagram they'll internalize for the rest of the course. By the end they'll know there are six distinct stages, which threads run them, and why each exists.

## The pipeline, in one picture (15 min)

Draw this diagram. **Keep it on the board all lecture.** Re-draw it in every Unit II lecture.

```
  ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐
  │   PARSE   │───▶│   STYLE   │───▶│  LAYOUT   │───▶│  PRE-PAINT│───▶│   PAINT   │───▶│  COMPOSITE│
  └───────────┘    └───────────┘    └───────────┘    └───────────┘    └───────────┘    └───────────┘
   HTML bytes      DOM + CSSOM       LayoutObject       Property        Display        Layer tree
   ─▶ DOM tree     ─▶ ComputedStyle  tree + fragments   trees          list (PaintOps) ─▶ pixels
                   per element                                                           on screen

   [main thread]   [main thread]    [main thread]     [main thread]   [main thread]   [compositor
                                                                                       + GPU]
```

Underneath, write: **"Everything above the compositor happens on the main thread. This is why a busy main thread blocks rendering."**

Walk through each stage at a one-minute level:

| Stage | Input | Output |
|---|---|---|
| Parse | HTML/CSS bytes from the network | DOM tree + CSSOM |
| Style | DOM + CSSOM | `ComputedStyle` for each element |
| Layout | DOM + `ComputedStyle` | LayoutObject tree + fragment tree (geometry) |
| Pre-paint | Layout output | Property trees (transforms, clips, effects, scroll) |
| Paint | LayoutObject tree + property trees | Display list (`PaintOp`s) |
| Composite / raster / draw | Display list | Pixels in the framebuffer |

Key mental model: **each stage is a pure-ish function that consumes the previous stage's output.** When something changes, you replay only the stages that depend on what changed.

## The thread model (10 min)

Draw on the board:

```
RENDERER PROCESS                                    GPU PROCESS
┌─────────────────────────────────────────┐        ┌────────────┐
│  Main thread                            │        │            │
│  ┌──────────────────────────────────┐   │        │   Skia     │
│  │ JS, DOM, Style, Layout,          │   │        │   (GPU     │
│  │ Pre-paint, Paint, DOM events     │   │ ──IPC─▶│    backend)│
│  └──────────────────────────────────┘   │        │            │
│                                         │        │   ANGLE    │
│  Compositor thread                      │        │   Dawn     │
│  ┌──────────────────────────────────┐   │        │            │
│  │ Layer tree, scroll, composited   │   │        └────────────┘
│  │ animations, hit-testing          │   │
│  └──────────────────────────────────┘   │
│                                         │
│  Raster worker threads (pool)           │
│  ┌──────────────────────────────────┐   │
│  │ Execute display lists →          │   │
│  │ produce GPU textures (tiles)     │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

Rules:

- **Main thread does almost everything except raster and drawing.** JavaScript, event handlers, parsing, style, layout, paint — all main thread.
- **The compositor thread holds a copy of the layer tree** and can scroll and animate composited properties (`transform`, `opacity`) without touching the main thread. *This is the superpower.*
- **Raster workers turn display lists into GPU textures.** They do the actual "convert drawing commands to pixels" work.
- **The GPU process draws.** The renderer never touches the GPU directly (security!). It sends commands to the GPU process via the command buffer.

If the main thread is stuck running JavaScript, *the compositor thread can still scroll and animate composited layers.* This is why `transform: translate` stays 60fps even when your `setTimeout` is in an infinite loop.

## Walk the pipeline: the "Hello 591" example (10 min)

Return to the opening-hook example. Walk it step by step.

1. **Parse.** Bytes arrive. The HTML tokenizer produces tokens: `<html>`, `<body>`, `<style>`, `.box { color: red; font-size: 24px; }`, `<div class="box">`, `Hello 591`, etc. Tree construction builds the DOM. The `<style>` contents are handed to the CSS parser to build the CSSOM.

2. **Style.** For `<div class="box">`, find all matching rules. `.box` matches. Compute `ComputedStyle`: `color: rgb(255, 0, 0)`, `font-size: 24px`, inherited `font-family: <default>`, etc. Attach this to the element. Repeat for every element.

3. **Layout.** Build a `LayoutObject` for each element that produces a box. Run the block-flow algorithm: `<body>` is a block, `<div>` is a block child taking the full width, its height is one line of 24px text. The text "Hello 591" measures to some number of pixels wide. Store geometry (offsets, sizes) in `LayoutObject` / fragment tree.

4. **Pre-paint.** Determine property trees — there are no transforms, clips, or effects here, so the trees are trivial.

5. **Paint.** Walk the layout tree, emit paint operations into a display list: "fill background white," "draw text 'Hello 591' at (x, y) with red, 24px."

6. **Composite + Raster + Draw.** There's one layer. The compositor sends the display list to raster workers, which produce a texture tile. The GPU process draws that tile to the framebuffer. Pixels on screen.

Now the interesting part: **what if we change `color: red` to `color: blue`?**

- Parse: not re-run. The DOM hasn't changed.
- Style: re-run for affected elements. `.box`'s `ComputedStyle` changes.
- Layout: **not re-run** — color doesn't affect geometry.
- Pre-paint: trivially unchanged.
- Paint: re-run — paint ops now say "blue."
- Raster + draw: re-run.

Versus: **what if we change `font-size: 24px` to `font-size: 48px`?**

- Parse: no.
- Style: yes.
- Layout: **yes** — text width and line height change.
- Pre-paint: yes.
- Paint: yes.
- Raster + draw: yes.

This is the single most important mental model of the unit. **Knowing which changes trigger which stages is how you write fast web pages.**

Write on the board a little table students can screenshot:

| Change | Parse | Style | Layout | Paint | Composite |
|---|---|---|---|---|---|
| `color` change | — | ✓ | — | ✓ | ✓ |
| `background-color` change | — | ✓ | — | ✓ | ✓ |
| `font-size` change | — | ✓ | ✓ | ✓ | ✓ |
| `width` / `height` change | — | ✓ | ✓ | ✓ | ✓ |
| `transform` (non-animation) | — | ✓ | — | ✓ | ✓ |
| `transform` (animation on composited layer) | — | — | — | — | ✓ |
| `opacity` (animation on composited layer) | — | — | — | — | ✓ |
| Adding a DOM node | — | ✓ | ✓ | ✓ | ✓ |
| Reading `element.offsetTop` (after invalidation) | — | ✓ (forced) | ✓ (forced) | — | — |

That last row — "reading `offsetTop` forces style + layout" — is the setup for HW6 (layout thrashing).

## A tiny code excerpt — where the pipeline actually runs (10 min)

Open [`third_party/blink/renderer/core/frame/local_frame_view.cc`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/frame/local_frame_view.cc) on the projector. Search for `UpdateLifecyclePhases` or `RunPaintLifecyclePhase`.

You'll find code resembling:

```cpp
void LocalFrameView::UpdateLifecyclePhasesInternal(...) {
  // ...
  if (RunStyleAndLayoutLifecyclePhases(target_state)) {
    if (target_state >= DocumentLifecycle::kCompositingInputsClean) {
      RunCompositingInputsLifecyclePhase(target_state);
    }
    if (target_state >= DocumentLifecycle::kPrePaintClean) {
      RunPrePaintLifecyclePhase(target_state);
    }
    if (target_state >= DocumentLifecycle::kPaintClean) {
      RunPaintLifecyclePhase(target_state);
    }
  }
}
```

Point out: **the pipeline is literal in the code.** Each phase is a method. Each phase has a "clean" state. The `DocumentLifecycle` state machine tracks where we are. A given `UpdateLifecyclePhases` call can stop at any phase — sometimes you only need style clean (because JS asked for `getComputedStyle`), sometimes you need all the way through paint.

This file is where students should start when they get lost in Unit II.

## Live demo — DevTools Performance panel (20 min)

This demo anchors the whole unit. Give it time.

**Setup:** open a real-world page — your university homepage, a news site, a chemistry tool like pubchem. Open DevTools, go to the Performance panel.

1. Click "Record," reload the page, stop after 3 seconds.
2. Show the flame chart. Point out the colored bars:
   - **Blue**: Loading (network, parse).
   - **Yellow**: Scripting (JS execution).
   - **Purple**: Rendering (style, layout).
   - **Green**: Painting.
3. Scroll the timeline. Point at specific bars and ask: *"What stage is this?"*
4. Click on a **"Recalculate Style"** entry. The bottom panel shows what caused it.
5. Click on a **"Layout"** entry. The "Layout forced" badge may appear — that's a synchronous style+layout triggered by JS. (This sets up HW6.)
6. Click on a **"Paint"** entry. Shows which region of the screen was repainted.
7. Enable "Screenshots" in the recording options. Rerecord. Now you can scrub along the timeline and see what the page looked like at each moment.
8. Enable **"Rendering"** panel (kebab menu → More tools → Rendering). Turn on:
   - **Paint flashing** — every repaint flashes green. Scroll a page; watch what repaints.
   - **Layout Shift Regions** — every shift flashes blue. Great for CLS debugging (and L10).
   - **FPS meter** — real-time FPS, top-right corner.

Narrate what each reveals. Ask students which of the pipeline stages they can *see* happening in the tool. (Answer: all of them, modulo raster/composite which are summarized.)

## Reading for next lecture

- [HTML Living Standard §13 — Parsing](https://html.spec.whatwg.org/multipage/parsing.html) — skim the tokenizer section
- web.dev: [Critical rendering path](https://web.dev/learn/performance/understanding-the-critical-path) — intro-level but authoritative
- chromium.org: [How Blink works](https://docs.google.com/document/d/1aitSOucL0VHZa9Z2vbRJSyAIsAz24kX8LFByQ5xQnUg/) — skim, focus on the parser section

## Instructor notes

- This lecture is a scaffolding lecture. Resist going deep on any single stage. L8–L12 each pick one stage and go deep.
- Keep the thread-model diagram on the board. Students draw it on their note sheets for the midterm.
- The "which changes trigger which stages" table is the single most valuable takeaway. Put it on the course site.

---

[← Unit II README](./README.md) · [Next: L8 — Parsing HTML →](./L08-blink-parsing-dom.md)

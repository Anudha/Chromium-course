# HW3 — Code Archaeology

**Assigned:** Week 3 · **Due:** End of Week 3 · **Weight:** ~2.3% of course grade

## Goal

Trace a web API from its JavaScript entry point all the way to the platform-specific implementation, using only Chromium Code Search. This builds the navigation skills you'll use for the rest of the semester.

## Background

In Lecture 5 we traced `navigator.userAgent` end-to-end across five layers:

```
JS → Blink IDL → Blink C++ → content/ → embedder (chrome/)
```

Every web API has this shape. This HW asks you to do the same trace for a different API.

## Choose one API (do not pick `navigator.userAgent`)

Pick one from this list:

- `window.alert()`
- `document.title` (the setter)
- `navigator.clipboard.writeText()`
- `navigator.language`
- `console.log()` (trace how it reaches DevTools)
- `<input type="color">` (trace how the color picker opens)
- `window.open()`
- `navigator.geolocation.getCurrentPosition()`
- `document.cookie` (the getter)

If you want to do a different one, ask the instructor first.

## Deliverables

Submit a PDF or markdown file containing:

### 1. A hop-by-hop trace

At least **five hops** from the JS call to the underlying implementation. For each hop, include:

- The file path (absolute from `chromium/src` root, e.g., `third_party/blink/renderer/core/frame/navigator.cc`)
- The line number (or range)
- A 1–2 sentence description of what happens at that hop
- A URL link into [source.chromium.org](https://source.chromium.org) pointing to the exact line

### 2. A diagram

A drawing (hand-drawn and photographed is fine; or draw.io, Excalidraw, Mermaid — anything) showing the flow across the layer stack:

```
chrome/ (embedder) ← ... ← content/ ← third_party/blink/ ← IDL ← JS
```

### 3. Trust-boundary annotation

For your API, identify:

- Which hops execute in the **renderer process**
- Which hops execute in the **browser process**
- Whether there is a Mojo IPC call between them (and if so, which `.mojom` file defines it)

If your API stays entirely in the renderer, say so.

### 4. One surprising thing

In 2–3 sentences, describe something surprising, confusing, or clever you noticed while tracing. "It just worked" is not an acceptable answer — dig until you find something worth noting.

## Submission

Submit as `HW3-<unityID>.pdf` or `HW3-<unityID>.md`. If you include a diagram image, ensure it's embedded or packaged alongside.

## Why this is AI-resistant

AI assistants hallucinate file paths in Chromium constantly. The file paths and line numbers change commit-to-commit. The grader will verify your links resolve to sensible locations. Fabricated paths are immediately obvious.

## Grading rubric

| Component | Points |
|---|---|
| 5+ correct, working source links | 40 |
| Descriptions at each hop are accurate | 20 |
| Diagram is clear and correct | 15 |
| Trust-boundary analysis is correct | 15 |
| Surprising-thing observation is substantive | 10 |
| **Total** | **100** |

## Hints

- Start at the IDL file: search `filepath:\.idl$ <your api name>`.
- Click on class/function names in Code Search to navigate to definitions.
- The "Callers" panel in Code Search is your friend.
- If you're stuck, grep for the method name in `content/` to find the embedder-layer glue.
- APIs that need browser privileges (file access, clipboard, geolocation) will have a Mojo interface. Look for `.mojom` files named for the feature.

## AI usage policy

You may use AI to explain C++ idioms or to suggest where to look next. **Do not let AI produce the file paths — verify every path in Code Search yourself.** Cite AI usage in `AI-USAGE.md`.

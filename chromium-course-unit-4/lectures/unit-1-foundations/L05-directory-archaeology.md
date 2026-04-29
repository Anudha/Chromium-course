# Lecture 5 — Directory Archaeology

| | |
|---|---|
| **Unit** | I — Foundations |
| **Week** | 3 |
| **Duration** | 1.5 hours |
| **Demo** | End-to-end `navigator.userAgent` trace through Code Search |

## Learning objectives

Students can:

1. Navigate `chromium/src` top-level directories and state what each contains.
2. Use Chromium Code Search effectively.
3. Trace a user action from JS API call through Blink bindings, the renderer, Mojo, and the browser process.
4. Distinguish "content layer" from "chrome layer."

## Opening hook (5 min)

On the projector, open [source.chromium.org](https://source.chromium.org/chromium/chromium/src/+/main:). Students see the root. Ask: *"Here are 40-ish top-level directories. Which one contains the code that runs when I type a URL and press Enter?"*

Let them guess. Common guesses: `chrome/`, `content/`, `net/`. Real answer: **all three, plus `components/`, `services/`, `third_party/blink/`, `ui/`, and usually `v8/`**. Each handles a different layer of the request. By the end of this lecture students know which layer is which.

## The top-level map (20 min)

Go directory-by-directory. For each: (1) what's in it, (2) who owns it, (3) when you'd touch it. Put one-line summaries on the board.

### Product directories (what you build)

| Directory | Contents |
|---|---|
| `chrome/` | The Chrome-branded desktop browser UI, Chrome-specific features, Chrome's embedder code. First-party Google Chrome stuff that's not in `content/`. `chrome/browser/` and `chrome/renderer/`. |
| `android_webview/` | Android WebView product. |
| `ash/` / `chromeos/` | ChromeOS-specific. |
| `ios/` | iOS Chrome (small; mostly WebKit-shell). |
| `headless/` | Headless Chrome (`headless_shell`). |

### Core platform directories (what products are built on)

| Directory | Contents |
|---|---|
| `content/` | The "content layer." Abstract browser engine. `content/browser/`, `content/renderer/`, `content/common/`, `content/public/`. Tab management, navigation, frames, process model, public API for embedders. The heart of Chromium as a reusable engine. Electron and CEF consume this. |
| `third_party/blink/` | Rendering engine. HTML parser, DOM, CSS engine, layout, paint (partially). Blink was a WebKit fork in 2013. |
| `v8/` | JavaScript engine. Pulled in via DEPS from its own repo; appears as a subdirectory. |
| `net/` | Network stack. URLRequest, HTTP, HTTP/2, HTTP/3, QUIC, TLS integration, DNS, WebSocket, cookie parsing. |
| `base/` | Foundational primitives: strings, containers, time, files, threading, task scheduling, logging, feature flags. **Everything depends on `//base`.** |
| `ui/` | UI toolkit: `ui/views` (Google's custom widget toolkit on Windows/Linux/ChromeOS), `ui/gfx`, `ui/base`, `ui/gl`, `ui/compositor`. Not to be confused with `cc/`. |
| `cc/` | Chromium Compositor. Layer tree, tiling, property trees, compositor thread. Week 6 deep-dive. |
| `gpu/` | GPU process, command buffer, shared-memory-based GPU IPC. |
| `media/` | Audio, video, codecs. Integrates FFmpeg, platform codecs. |
| `services/` | Mojo-based services: network service, storage service, audio service, device service. "Microservices inside a browser." Week 10 topic. |
| `mojo/` | The IPC layer itself. Week 10. |
| `components/` | Reusable browser-layer components shared across Chrome, Android WebView, iOS Chrome. `components/autofill/`, `components/password_manager/`, `components/history/`. If two products want it, it lives here. |
| `third_party/` | Pulled-in dependencies: Skia, ANGLE, BoringSSL, ICU, and hundreds more. Mostly pulled via DEPS. |

### Tooling

| Directory | Contents |
|---|---|
| `build/` | Build system shared configs, toolchain descriptions. |
| `tools/` | Developer tools, scripts, analyzers. `tools/clang/`, `tools/gn/`, `tools/perf/`. |
| `testing/` | Test infra, gtest configs, fuzzer frameworks. |
| `docs/` | Markdown documentation. Rooted at `docs/README.md`. Genuinely useful — go there first when lost. |

## The "layer" concept (10 min)

Draw this stack:

```
┌──────────────────────────────────────────────┐
│  chrome/  (or electron/, or chromeos/, …)    │  ← embedder / product layer
├──────────────────────────────────────────────┤
│  components/  (reusable browser features)    │
├──────────────────────────────────────────────┤
│  content/  (abstract browser engine)         │  ← the "content layer"
├──────────────────────────────────────────────┤
│  third_party/blink/, v8/, net/, services/…   │  ← subsystems
├──────────────────────────────────────────────┤
│  base/, ui/gfx/, mojo/                       │  ← primitives
└──────────────────────────────────────────────┘
```

Rules:

- **Higher layers can depend on lower layers, never the reverse.** `content/` cannot `#include` from `chrome/`. Enforced by DEPS files — there's a DEPS file in each directory (different from the top-level DEPS, confusingly) listing what `#include`s are allowed.
- **Embedders implement `ContentClient`-style interfaces to customize behavior.** Chrome provides `ChromeContentBrowserClient`, `ChromeContentRendererClient`. Electron provides its own. This is how `content/` stays reusable.
- **Blink depends on content? No — Blink is *in* the renderer process, and `content/` sets it up.** Dependency direction: `content/renderer/` pulls in `third_party/blink/renderer/`.

If a student asks "why this structure?" — the honest answer is "so that Android WebView, ChromeOS, and third-party embedders can reuse the engine without pulling in Google-specific UI code." Real, load-bearing separation.

## Code Search: the tool you'll live in (15 min)

Open [source.chromium.org](https://source.chromium.org/) on the projector. Live-demo:

1. **Full-text search.** Type `window.alert`. Results include IDL, Blink bindings, tests, docs. Too many results.
2. **Filters.** `file:\.idl$ alert` — only IDL files. `path:blink alert` — only in Blink. `case:yes Alert` — case-sensitive.
3. **Cross-references.** Click on a function/class name. The right panel shows definitions, callers, callees, derived classes. **The superpower.**
4. **Xrefs navigation.** Click "Callers" for a browser-process IPC handler. See every renderer that calls it.
5. **History / blame.** Any file → clock icon → every commit that touched the file, with links to Gerrit CLs.
6. **Owners.** Every directory has `OWNERS`. Right-click any file → see who can review changes.

Contrast with `grep -r`: Code Search understands C++ (and JS, IDL, mojom, GN) semantically. It knows what's a function call vs. a string literal. It knows class hierarchies. Indexed across the whole tree and updated continuously.

## Live demo — tracing `navigator.userAgent` end to end (15 min)

The main event. Previews HW3.

Open Code Search. Target: *"when JS reads `navigator.userAgent`, what exactly happens?"*

### Step 1 — find the IDL

Search `navigator.idl path:blink`. Open `third_party/blink/renderer/core/frame/navigator.idl`. Point out:

```
[HighEntropy=Direct, Measure] readonly attribute DOMString userAgent;
```

IDL = Interface Definition Language. Web specs are written in IDL. Blink compiles IDL into C++ bindings at build time.

### Step 2 — find the C++ implementation

In Blink, IDL maps to a C++ class by naming convention. Open `third_party/blink/renderer/core/frame/navigator.cc` and `navigator.h`. Find `Navigator::userAgent()`. Trace it: calls `NavigatorID::userAgent()` (base class) which calls `frame->Loader().UserAgent()`.

### Step 3 — follow into the loader

`LocalFrameClient::UserAgent()` → `LocalFrameClientImpl::UserAgent()` which calls into `content/`.

### Step 4 — cross into content/

In `content/renderer/`, the user agent is cached from a value sent by the browser process at frame creation. Find where: `RenderFrameImpl`. The value ultimately comes from `content::ContentClient::GetUserAgent()`.

### Step 5 — the browser side

`ChromeContentClient::GetUserAgent()` lives in `chrome/common/`. Assembles the UA string using version data, platform data, etc.

### The full trace

```
JS: navigator.userAgent
  → Blink IDL (navigator.idl)
    → Blink C++ (Navigator::userAgent)
      → content/renderer (RenderFrame)
        → content/public/common
          → embedder (ChromeContentClient)
            → assembled string returned up the stack
```

Lessons:

- **Every Web API has this shape.** IDL → Blink C++ → `content/` → embedder or service. Some also cross into the browser process via Mojo (anything needing privilege).
- **AI assistants are bad at this.** They hallucinate file paths. You *must* use Code Search. That's why HW3 requires real line numbers.

## Reading for next lecture

- chromium.org: [Life of a Chromium Developer](https://docs.google.com/presentation/d/1abnqM9j6zFodPHA38JG1061rG2iGj_GABxEDgZsdbJg) (slide deck linked from the Contributing page)
- chromium.org: [Contributing to Chromium](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/contributing.md)
- [Google C++ style guide](https://google.github.io/styleguide/cppguide.html)

## Instructor notes

- HW3 (Code Archaeology) assigned. The `navigator.userAgent` trace is the example; students pick a different API.
- Some students get lost in Code Search. Re-demo in office hours.
- The "layer" concept comes up constantly. Refer back.

---

[← L4](./L04-gn-ninja-build.md) · [Unit I README](./README.md) · [Next: L6 — Coding Standards, Reviews →](./L06-coding-standards-reviews.md)

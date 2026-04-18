# Primary Sources

Curated list of primary-source references used throughout the course. No Medium posts, no third-party blogs. If a source isn't on this list and it's not a peer-reviewed paper, check with the instructor before citing it.

## Chromium project

- [chromium.org](https://www.chromium.org) — project home
- [source.chromium.org](https://source.chromium.org) — Chromium Code Search
- [chromium-review.googlesource.com](https://chromium-review.googlesource.com) — Gerrit code review
- [ci.chromium.org](https://ci.chromium.org) — build / CQ bot status
- [crbug.com](https://crbug.com) — issue tracker
- [chromiumdash.appspot.com](https://chromiumdash.appspot.com) — release, schedule, feature dashboards

## In-tree documentation

Nearly every subsystem has a `docs/` folder with markdown-formatted design documents:

- [`docs/`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/) — root docs README and index
- [`docs/contributing.md`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/contributing.md)
- [`docs/getting_around_the_chrome_source_code.md`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/getting_around_the_chrome_source_code.md)
- [`mojo/README.md`](https://source.chromium.org/chromium/chromium/src/+/main:mojo/README.md)
- [`services/network/README.md`](https://source.chromium.org/chromium/chromium/src/+/main:services/network/README.md)
- [`third_party/blink/renderer/README.md`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/README.md)
- [`cc/README.md`](https://source.chromium.org/chromium/chromium/src/+/main:cc/README.md)

## V8

- [v8.dev](https://v8.dev) — official V8 blog and documentation
- [V8 on Code Search](https://source.chromium.org/chromium/chromium/src/+/main:v8/) — V8 lives in the main tree

Specific v8.dev posts referenced in the course:

- "Launching Ignition and TurboFan"
- "Sparkplug — a non-optimizing JavaScript compiler"
- "Maglev — V8's fastest optimizing JIT"
- "Oilpan library" series
- "Trash talk: the Orinoco garbage collector"
- "Embedder's Guide"

## Web platform

- [web.dev](https://web.dev) and [developer.chrome.com](https://developer.chrome.com) — Chrome team's web platform docs
- [wpt.fyi](https://wpt.fyi) — Web Platform Tests dashboard

## Standards bodies

- [W3C specifications](https://www.w3.org/TR/)
- [WHATWG specifications](https://spec.whatwg.org/)
- [TC39](https://tc39.es) — ECMAScript
- [gpuweb.github.io](https://gpuweb.github.io/gpuweb/) — WebGPU
- [webassembly.org](https://webassembly.org/) — WebAssembly
- [quicwg.org](https://quicwg.org/) — QUIC working group

## Tools

- [gn.googlesource.com](https://gn.googlesource.com/gn) — GN build-config tool
- [ninja-build.org](https://ninja-build.org/manual.html) — Ninja manual
- [skia.org](https://skia.org/docs/) — Skia graphics library
- [emscripten.org](https://emscripten.org) — Emscripten (C/C++ → WASM)
- [depot_tools tutorial](https://commondatastorage.googleapis.com/chrome-infra-docs/flat/depot_tools/docs/html/depot_tools_tutorial.html)

## Research papers referenced

- Reis, Moshchuk, Oskov. *Site Isolation: Process Separation for Web Sites within the Browser.* USENIX Security 2019. [research.google](https://research.google/pubs/site-isolation-process-separation-for-web-sites-within-the-browser/)

## What NOT to cite

- Medium articles
- Stack Overflow answers (for anything beyond quick syntax lookup)
- LLM-generated tutorials
- Random YouTube explainers
- Third-party blogs (even well-intentioned ones)

If you want to use a resource not listed here, ask the instructor first. The bar is "primary source, written by someone who works on the system, or peer-reviewed."

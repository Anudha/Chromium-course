Lecture-by-Lecture Schedule
Unit I — Foundations
Week 1

L1. What Is Chromium? A Tour of the Largest Open-Source Codebase You Use Every Day. History (WebKit fork, 2008), the Chromium vs. Chrome distinction, downstream consumers (Edge, Brave, Electron, CEF, Arc, Opera). Demo: open chrome://version, chrome://credits, chrome://about and walk through every page. Readings: chromium.org "Chromium Projects" overview; Google's original Chromium announcement comic (archive.org).
L2. The Mental Model: Browser as Operating System. Multi-process architecture preview, the content layer, embedders. Why browsers are secretly OS kernels. Demo: Chrome Task Manager (Shift+Esc) — show a process per tab.

Week 2

L3. Getting the Source: depot_tools, gclient, and the 100 GB Problem. fetch chromium, the monorepo philosophy, sparse checkouts. Why Chromium doesn't use plain git. Readings: "Checking out and building Chromium" from chromium.org for each platform.
L4. GN, Ninja, and the Build System. How gn gen out/Default + autoninja -C out/Default chrome actually works; build args; component vs. static builds; is_debug, is_component_build, symbol_level. Demo: time a no-op rebuild vs. a one-line change in //base. Readings: gn.googlesource.com "GN Reference"; "Ninja build system" docs.

Week 3

L5. Directory Archaeology. A guided tour of src/: base/, content/, chrome/, components/, third_party/blink/, v8/, net/, ui/, services/, mojo/. What lives where and why. Demo: use cs.chromium.org (Chromium Code Search) to trace a user action from click to network.
L6. Coding Standards, Reviews, and the CL Lifecycle. Gerrit, OWNERS files, tryjobs, CQ (commit queue), CPU/asan/tsan bots. Why "LGTM" has teeth here. Readings: chromium.org "Contributing to Chromium"; "Chromium C++ style guide."

Unit II — The Rendering Pipeline
Week 4

L7. From URL to Pixels: The Rendering Pipeline in 90 Minutes. Parse → style → layout → paint → composite → display. This lecture is the map students will refer back to. Demo: DevTools "Performance" panel recording a page load, annotated frame-by-frame.
L8. Blink: Parsing HTML and Building the DOM. Tokenizer, tree construction, speculative parsing, script blocking, preload scanner. Readings: HTML Living Standard §13 (parsing); web.dev "Critical rendering path"; Blink "How Blink works" doc (docs.google.com link from chromium.org).

Week 5

L9. Style: From CSS to ComputedStyle. Selector matching, the cascade, specificity, custom properties, style invalidation. Demo: force a style recalc with DevTools "Rendering" tab. Readings: CSS Cascading & Inheritance Level 4 (W3C).
L10. Layout: Box Trees, Block/Inline, and LayoutNG. The legacy layout engine vs. LayoutNG, fragment trees, why layout is the expensive part. Demo: "Layout Shift Regions" overlay. Readings: W3C CSS Display 3; chromium.org "LayoutNG" design doc.

Week 6

L11. Paint and Raster: Turning Boxes into Bitmaps. Display lists, SkPicture/PaintOp, tiles, raster threads, Skia. Demo: chrome://tracing capture showing raster tasks. Readings: skia.org documentation intro.
L12. The Compositor: Why Scrolling Is 60fps Magic. cc/ (Chromium Compositor), layer trees, main thread vs. compositor thread, GPU process, will-change. Demo: show jank by animating top vs. transform: translate. Readings: chromium.org "Compositor thread architecture" design doc. Midterm 1 review at end of class.

— MIDTERM 1 (in class, Thursday of Week 6) —
Unit III — V8 and JavaScript
Week 7

L13. V8 Architecture: Ignition, TurboFan, Sparkplug, Maglev. The tiered compilation pipeline, why V8 has four+ compilers, deoptimization. Readings: v8.dev blog posts — "Ignition interpreter," "Launching Ignition and TurboFan," "Sparkplug," "Maglev compiler." Demo: node --print-bytecode on a small function; then --trace-opt.
L14. Hidden Classes, Inline Caches, and the Shape of Fast JS. Why {x:1, y:2} and {y:2, x:1} are different objects to V8; monomorphic vs. polymorphic ICs. Demo: microbenchmark the same function with stable vs. shifting object shapes using d8.

Week 8

L15. Garbage Collection: Orinoco, Oilpan, and Generational Marking. Young/old generations, incremental marking, concurrent sweeping, Oilpan for Blink DOM objects. Readings: v8.dev "Trash talk" series; "Oilpan" design docs.
L16. Embedding V8: The API That Runs Half the Internet. Isolates, contexts, handles, node.js and Deno as embedders. Mini-demo: a 40-line C++ program that embeds V8 and runs JS. Readings: v8.dev "Embedder's guide."

Unit IV — Process Model & Security
Week 9

L17. The Multi-Process Architecture. Browser, renderer, GPU, network, utility, plugin processes. Why a crash in one tab doesn't kill the browser. Readings: chromium.org "Multi-process architecture" design doc.
L18. Sandboxing Across Operating Systems. seccomp-bpf on Linux, AppContainer on Windows, Seatbelt on macOS. The principle of least privilege in practice. Readings: chromium.org "Sandbox design doc" and per-OS sandbox docs.

Week 10

L19. Site Isolation and Spectre. Why every site gets its own process post-2018; out-of-process iframes; cross-origin read blocking. Readings: Reis, Moshchuk, Oskov, "Site Isolation: Process Separation for Web Sites within the Browser" (USENIX Security 2019, on research.google).
L20. Mojo: IPC as a First-Class Citizen. Message pipes, interfaces, .mojom files, legacy IPC migration. Demo: read a small .mojom file and trace both endpoints. Readings: chromium.org "Mojo" documentation.

Unit V — Networking & Storage
Week 11

L21. The Network Stack: //net, QUIC, HTTP/3. URLRequest, network service, socket pools, HTTP cache. Chrome as the reference client for QUIC. Readings: chromium.org "Network Stack" docs; quicwg.org standards overview. Demo: chrome://net-export + Netlog Viewer.
L22. Storage: Cookies, IndexedDB, Cache API, Origin Private File System. The storage partitioning story, third-party cookie deprecation, Storage Access API. Readings: W3C Storage, IndexedDB, and File System specs. Midterm 2 review.

— MIDTERM 2 (in class, Thursday of Week 11) —
Unit VI — The Web Platform for Science
Week 12

L23. GPU in the Browser: WebGL and WebGPU. ANGLE, Dawn, the GPU process, command buffers. Why WebGPU matters for compute. Demo: a WebGPU compute shader doing N-body simulation of a small protein. Readings: W3C WebGPU spec; gpuweb.github.io; web.dev "WebGPU" articles.
L24. WebAssembly: Near-Native in the Browser. Liftoff, TurboFan for WASM, WASI, SIMD, threads. Porting a chem/ChemE simulation (e.g., LAMMPS fragment or a small DFT kernel via Emscripten). Readings: webassembly.org specs; v8.dev WASM posts; Emscripten documentation (emscripten.org).

Week 13

L25. Device APIs for the Lab: WebUSB, Web Bluetooth, Web Serial, WebHID. Talking to Arduinos, spectrometers, balances directly from a webpage. Security/permissions model. Demo: read live data from a USB or serial device if available (fallback: Chrome's "virtual device" in DevTools). Readings: W3C WebUSB, Web Bluetooth, Web Serial specifications.
L26. Progressive Web Apps, Offline, and Field Science. Service workers, Cache API, Background Sync, installability. Why a field chemist might want a PWA. Readings: W3C Service Workers spec; web.dev PWA learning path.

Unit VII — Contribution & Ecosystem
Week 14

L27. Landing a Real CL: Bugs, Tryjobs, Reviewers. Walk through a real (small) bug from crbug.com to merged CL. Flags, finch experiments, field trials. Readings: chromium.org "Contributing a patch"; crbug.com "good first bug" label.
L28. The Chromium Ecosystem and Its Future. Edge, Brave, Electron, CEF as case studies; standards bodies (W3C, WHATWG, TC39); the Blink launch process; antitrust and governance questions. Final project presentations teaser. Readings: chromium.org "Blink launch process"; W3C Process Document overview.

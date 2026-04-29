# Syllabus — CSC/CHE 591: Inside Chromium

**Architecture, Engineering, and the Modern Web Platform**
Spring Semester · Tuesday & Thursday, 1.5 hours · 14 weeks · 28 lectures
Cross-listed: Computer Science / Chemical & Biomolecular Engineering / Chemistry

## Course description

Chromium is the open-source engine behind Google Chrome, Microsoft Edge, Brave, Opera, Arc, Vivaldi, Samsung Internet, Electron, CEF, and Android WebView. It is one of the largest and most consequential codebases in modern computing, and it increasingly serves as the compute platform for scientific tools (molecular viewers, instrument control, lab-notebook PWAs).

This course takes students inside Chromium: how it is built, how it is organized, how its rendering and JavaScript pipelines work, how it achieves security through multi-process sandboxing and site isolation, and how its web-platform APIs enable modern scientific computing in the browser. Students finish the course capable of building Chromium from source, navigating its codebase, contributing a patch, and building nontrivial scientific applications on top of its platform APIs.

## Prerequisites

- CSC 216 (Data Structures) or equivalent
- Comfort with C++ and/or JavaScript
- Basic command-line skills
- ChemE/Chem students without CSC 216 may petition the instructor; they will be paired with CS partners for build-heavy labs

## Learning outcomes

By the end of the course, students will be able to:

1. Build Chromium from source and navigate its ~35M-line codebase using Chromium Code Search.
2. Explain Chromium's multi-process architecture, including renderer, GPU, network, and utility processes, and reason about the security and stability properties it provides.
3. Trace a web request from HTML parse through style, layout, paint, and composite to the screen.
4. Describe V8's tiered compilation pipeline (Ignition → Sparkplug → Maglev → TurboFan) and the role of hidden classes, inline caches, and generational garbage collection.
5. Analyze a `.mojom` IPC interface and reason about trust boundaries between processes.
6. Build modern web applications using WebGPU, WebAssembly, and device APIs (WebUSB, Web Bluetooth, Web Serial) for scientific computing.
7. Prepare, upload, and iterate on a Chromium CL through Gerrit code review.

## Structure overview

| Unit | Weeks | Theme |
|---|---|---|
| I. Foundations | 1–3 | What Chromium is, how to build it, how it's organized |
| II. The Rendering Pipeline | 4–6 | HTML → pixels: Blink, style, layout, paint, compositor |
| III. V8 and JavaScript | 7–8 | The engine under the hood |
| IV. Process Model & Security | 9–10 | Sandboxing, site isolation, IPC (Mojo) |
| V. Networking & Storage | 11 | The network stack, caching, storage |
| VI. The Web Platform for Science | 12–13 | WebGL/WebGPU, WASM, device APIs, PWAs |
| VII. Contribution & Ecosystem | 14 | Landing a real CL, downstream forks, the future |

## Lecture schedule

### Unit I — Foundations

- **Week 1**
  - L1. What Is Chromium? A Tour of the Largest Open-Source Codebase You Use Every Day
  - L2. The Mental Model: Browser as Operating System
- **Week 2**
  - L3. Getting the Source: depot_tools, gclient, and the 100 GB Problem
  - L4. GN, Ninja, and the Build System
- **Week 3**
  - L5. Directory Archaeology
  - L6. Coding Standards, Reviews, and the CL Lifecycle

### Unit II — The Rendering Pipeline

- **Week 4**
  - L7. From URL to Pixels: The Rendering Pipeline in 90 Minutes
  - L8. Blink: Parsing HTML and Building the DOM
- **Week 5**
  - L9. Style: From CSS to ComputedStyle
  - L10. Layout: Box Trees, Block/Inline, and LayoutNG
- **Week 6**
  - L11. Paint and Raster: Turning Boxes into Bitmaps
  - L12. The Compositor: Why Scrolling Is 60fps Magic

**Midterm 1** — in class, Thursday of Week 6

### Unit III — V8 and JavaScript

- **Week 7**
  - L13. V8 Architecture: Ignition, TurboFan, Sparkplug, Maglev
  - L14. Hidden Classes, Inline Caches, and the Shape of Fast JS
- **Week 8**
  - L15. Garbage Collection: Orinoco, Oilpan, and Generational Marking
  - L16. Embedding V8: The API That Runs Half the Internet

### Unit IV — Process Model & Security

- **Week 9**
  - L17. The Multi-Process Architecture
  - L18. Sandboxing Across Operating Systems
- **Week 10**
  - L19. Site Isolation and Spectre
  - L20. Mojo: IPC as a First-Class Citizen

### Unit V — Networking & Storage

- **Week 11**
  - L21. The Network Stack: //net, QUIC, HTTP/3
  - L22. Storage: Cookies, IndexedDB, Cache API, Origin Private File System

**Midterm 2** — in class, Thursday of Week 11

### Unit VI — The Web Platform for Science

- **Week 12**
  - L23. GPU in the Browser: WebGL and WebGPU
  - L24. WebAssembly: Near-Native in the Browser
- **Week 13**
  - L25. Device APIs for the Lab: WebUSB, Web Bluetooth, Web Serial, WebHID
  - L26. Progressive Web Apps, Offline, and Field Science

### Unit VII — Contribution & Ecosystem

- **Week 14**
  - L27. Landing a Real CL: Bugs, Tryjobs, Reviewers
  - L28. The Chromium Ecosystem and Its Future

**Final Exam** — exam week (comprehensive + project presentations)

## Assessment

| Component | Weight |
|---|---|
| Weekly homework (13 × ~2.3%) | 30% |
| Midterm 1 | 15% |
| Midterm 2 | 15% |
| Final exam | 20% |
| Final project | 20% |

### Homework

Thirteen weekly assignments (skipped on midterm weeks). Each assignment is designed so that AI assistants can help but cannot complete the work alone — deliverables include machine-specific traces, patches that must compile, measurements from the student's own environment, and verifiable source-tree navigation.

### Midterms

Two in-class, 80-minute midterms:
- **Midterm 1** (Week 6): Units I–II (Foundations and Rendering Pipeline)
- **Midterm 2** (Week 11): Units III–V (V8, Security, Networking)

### Final exam

Comprehensive, 2h 50min, during exam week. Covers all units and incorporates a final-project presentation component.

### Final project

Three tracks (individual or pairs):

1. **CL Track** — Land (or get substantive review on) a real CL against `chromium/src`. Good-first-bugs and documentation CLs count. Graded on engineering quality, not on whether Google merges it in time.
2. **Build-on-Chromium Track** — Build a small Electron/CEF app or custom DevTools panel solving a real problem.
3. **Scientific Web App Track** — Build a scientific tool using WebGPU + WebAssembly + device APIs (e.g., molecular viewer, live NMR processor, field sample PWA).

Deliverables: code, 5-page CL-style write-up, 10-minute presentation.

## Build infrastructure

Full Chromium builds are disk-hungry (~100 GB) and time-intensive (3–6 hours first build, minutes for incremental). To keep this accessible:

- **Lab workstations** are available for students without sufficient local resources. Reservation system on the course site.
- **Component builds** (`is_component_build=true`) are the default configuration.
- **V8 standalone** builds (~5 GB) are used for Weeks 7–8.
- **`content_shell`** replaces full `chrome` for Blink-focused work.

## Primary sources

All course material is grounded in primary sources. Required readings come exclusively from:

- chromium.org and source.chromium.org
- v8.dev
- web.dev / developer.chrome.com
- W3C and WHATWG specifications
- gpuweb.github.io, webassembly.org, emscripten.org
- research.google (peer-reviewed)
- skia.org, quicwg.org, gn.googlesource.com
- crbug.com (the Chromium issue tracker)

No Medium articles, no third-party blogs, no unverified tutorials.

## AI policy

Students may use AI assistants for all coursework. Assignments are designed with this assumption. However:

- **Work you submit must be your own to defend.** If asked in office hours or exam, you must be able to explain any line of code or reasoning you submit.
- **Cite AI usage** in a short "AI usage note" at the end of each assignment — which tools, for what purpose. No penalty; this is about transparency.
- **Exams are closed-AI.** Midterms and final are in-person, no laptops.

## Accessibility

Students needing accommodations should register with the Disability Resource Office and contact the instructor in the first two weeks.

## Academic integrity

All work must follow NC State's Student Code of Conduct. Cite all sources (including AI). Do not share completed homework solutions with students in future offerings of this course.

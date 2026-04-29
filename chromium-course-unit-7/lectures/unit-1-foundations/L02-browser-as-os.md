# Lecture 2 — The Mental Model: Browser as Operating System

| | |
|---|---|
| **Unit** | I — Foundations |
| **Week** | 1 |
| **Duration** | 1.5 hours |
| **Demo** | Chrome Task Manager archaeology; forced process crashes |

## Learning objectives

Students can:

1. Sketch the multi-process architecture from memory.
2. Explain why a tab crash doesn't kill the browser.
3. Identify which Chromium subsystems correspond to OS kernel concepts.
4. Predict which process handles a given user action.

## Opening hook (5 min)

Open Chrome Task Manager live (Shift+Esc on Windows/Linux, Window menu → Task Manager on macOS). Have roughly 5 tabs open before class: a news site, YouTube, Google Docs, a chemistry tool (e.g., pubchem.ncbi.nlm.nih.gov), and `chrome://settings`. Leave it on the projector for the whole lecture.

Ask: *"How many processes does this single browser have running right now?"* Count them out loud. Typically 15–30 for a modest set of tabs. Then: *"Why? A browser shows web pages. Why does it look more like a small operating system?"*

## The big picture (15 min)

Draw this diagram and keep it on the board all lecture:

```
                     ┌─────────────────────────────┐
                     │    BROWSER PROCESS          │
                     │  (privileged, one per user) │
                     │  - UI, tabs, bookmarks      │
                     │  - Profile, prefs           │
                     │  - Orchestrates everything  │
                     └──────────────┬──────────────┘
                                    │ (Mojo IPC)
      ┌──────────────┬──────────────┼──────────────┬──────────────┐
      ▼              ▼              ▼              ▼              ▼
 ┌─────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
 │Renderer │   │Renderer  │   │   GPU    │   │ Network  │   │ Utility  │
 │process  │   │process   │   │ process  │   │ service  │   │ process  │
 │(site A) │   │(site B)  │   │(drawing) │   │ (//net)  │   │ (audio,  │
 │         │   │          │   │          │   │          │   │  video,  │
 │ Blink   │   │ Blink    │   │  Skia    │   │  QUIC    │   │  decode) │
 │ V8      │   │ V8       │   │  ANGLE   │   │  HTTP/3  │   │          │
 │ (sand-  │   │ (sand-   │   │  Dawn    │   │          │   │          │
 │  boxed) │   │  boxed)  │   │          │   │          │   │          │
 └─────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
```

Key rules:

- **Exactly one browser process per running Chrome instance.** The most privileged. If it dies, everything dies.
- **Many renderer processes.** Roughly one per site post-Site Isolation (2018; Week 10 topic). Renderers run Blink and V8. Renderers are sandboxed — they can barely do anything on their own.
- **The GPU process isolates graphics-driver bugs and exploits.** GPU drivers are historically buggy and privileged. Isolating them means a GPU driver crash doesn't kill the browser.
- **The network service handles all network I/O.** Split out from the browser process circa 2018 so network code (huge attack surface) runs with fewer privileges than the browser.
- **Utility processes** handle specific short-lived tasks: audio decoding, video decoding, PDF rendering, storage service, etc.

## Why this architecture? The three-word answer (10 min)

### Reason 1 — Stability

If the renderer for one tab crashes, the other tabs don't. This was Chrome's original killer feature in 2008, when every other browser was single-process and one flaky Flash ad could take down your whole session.

Live demo: visit `chrome://crash` in a tab. The tab shows the "Aw, snap!" page. Everything else keeps running.

### Reason 2 — Responsiveness

With work split across processes and (within processes) across threads, the compositor thread and the GPU process keep scrolling smooth even if the main thread is wedged. (Preview Week 6.)

### Reason 3 — Security

The big one. If an attacker finds a renderer exploit — a memory-corruption bug in V8 or Blink — they still don't have much power. The renderer is sandboxed. It can't read arbitrary files, make arbitrary network requests, talk to the GPU driver directly, or access other sites' cookies. To do real damage the attacker needs a second exploit: a sandbox escape. Defense in depth. We spend Week 10 on this.

## OS analogy, made explicit (10 min)

Write this two-column table on the board:

| Operating system concept | Chromium equivalent |
|---|---|
| Kernel (privileged) | Browser process |
| Userland process | Renderer process (per site) |
| Scheduler | Browser process spawning/killing child processes |
| Syscalls | Mojo IPC messages to the browser process |
| Memory isolation via MMU | OS process isolation (Chromium inherits this) |
| Capabilities / file descriptors | Mojo message pipes passed between processes |
| Drivers | GPU process, network service, audio service |
| Permissions | Chrome permissions model (geolocation, camera, WebUSB, etc.) |
| `/proc`, `top` | `chrome://process-internals`, Task Manager |

This isn't a metaphor — it's a design pattern Chromium borrowed deliberately. The seL4 microkernel, the QNX approach, and modern capability-based OS research all inform this architecture. Chromium has *also* influenced OS design back; Fuchsia was designed by many of the same people.

For CS-heavy classes, ask: *"What's the downside of this architecture compared to a monolithic browser?"* Answer: IPC overhead and memory overhead — each process has its own V8 heap, each Blink renderer has its own allocator pools. We'll quantify the memory cost in Week 9.

## Live demo — Task Manager archaeology (15 min)

The demo students will remember. With your prepared set of tabs:

1. Open `chrome://process-internals/#general`. Show the list of frames, which process each belongs to, which site each frame is locked to.
2. Switch to Task Manager (Shift+Esc). Show CPU, memory, network per process.
3. Sort by memory. Usually the GPU process or a heavy renderer (YouTube, Docs) tops it.
4. Create an OOPIF (out-of-process iframe) live: open a page with an iframe from a different site (e.g., a page embedding a YouTube video). Show that the iframe has its own renderer process. Site Isolation in action.
5. Force a renderer crash on one tab (`chrome://crash`). Watch Task Manager — that process disappears. Others live on.
6. Kill the GPU process from Task Manager (right-click → End process). Watch Chrome re-spawn it automatically, sometimes after a visual flash. The browser process supervises.
7. Optional: kill the network service. Chrome stops loading new pages until it restarts. The browser-process-as-init-system in action.

Narrate throughout: *"This is what I mean by browser-as-OS. The browser process is doing what `init` or `launchd` does on Linux or macOS."*

## Discussion (5 min)

- Apple's Safari has a different process model (WebContent processes, Networking process, GPU process, but historically less aggressive isolation). Why might they have made different tradeoffs?
- What do you think happens on mobile, where RAM is scarce? (Answer: Chrome on Android aggressively merges renderer processes under memory pressure and puts background tabs into a "purgeable" state. Site Isolation has a lite mode on low-memory devices.)

## Reading for next lecture

- chromium.org: [Checking out and building Chromium](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/) for your OS — pick Linux, Mac, or Windows
- chromium.org: [depot_tools tutorial](https://commondatastorage.googleapis.com/chrome-infra-docs/flat/depot_tools/docs/html/depot_tools_tutorial.html)

## Instructor notes

- Keep the process diagram visible for the rest of the semester.
- The `chrome://crash` demo is crowd-pleasing but warn students they'll lose unsaved form data in that tab.
- If time is tight, skip the OS-analogy table and just wave at it on the board.

---

[← L1](./L01-what-is-chromium.md) · [Unit I README](./README.md) · [Next: L3 — Getting the Source →](./L03-getting-the-source.md)

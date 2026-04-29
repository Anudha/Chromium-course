# Lecture 17 — The Multi-Process Architecture

| | |
|---|---|
| **Unit** | IV — Process Model & Security |
| **Week** | 9 |
| **Duration** | 1.5 hours |
| **Demo** | `chrome://process-internals`; Task Manager forensics; forced process crash cascade analysis |

## Learning objectives

Students can:

1. Name and describe every process type in Chromium and what each is allowed to do.
2. Explain the role of `RenderProcessHost` and `RenderFrameHost` in the browser process.
3. Describe how the browser process enforces trust — what a renderer can and cannot request.
4. Trace a tab navigation from the browser process through renderer process selection, document commit, and IPC setup.
5. Explain why some low-memory devices use fewer renderer processes and what security that sacrifices.

## Opening hook (5 min)

Display on the projector: a Chrome window with 8 tabs open across four different sites. Open Task Manager (Shift+Esc). Count: the browser has 25+ OS processes for those 8 tabs. Ask students to predict:

- Which processes correspond to which tabs?
- Why does YouTube get two renderer processes?
- Why is there a "GPU Process" but not a "Display Process"?
- Why does `chrome://settings` have its own process?

Students will have partial answers from L2's preview. This lecture gives them the full, precise answer.

## The complete process taxonomy (20 min)

### 1. Browser process (exactly one per Chrome instance)

- **PID**: the "parent" of all other Chrome processes.
- **Privileges**: highest in the browser context — can read/write user profile, access the filesystem, make network connections, call OS APIs.
- **Responsibilities**: UI (title bar, address bar, menus), tab management, navigation, spawning and supervising all child processes, enforcing trust policy on messages received from renderers.
- **What it runs**: the Chrome `//chrome/browser/` code, plus `//content/browser/`, `//net/` (now mostly in the network service), `//services/`.
- **Key C++ classes**: `Browser`, `BrowserProcess`, `TabStripModel`, `RenderProcessHost`, `RenderFrameHost`, `WebContents`.

This is the most security-critical process. A compromise here is game over.

### 2. Renderer processes (one per site, roughly)

- **Privileges**: maximally restricted. After sandbox setup, a renderer can barely do anything.
- **Responsibilities**: parse HTML, execute JavaScript, run style/layout/paint (Units II and III), post results back to the browser via Mojo IPC.
- **What it runs**: `//content/renderer/`, `//third_party/blink/renderer/`, `v8/`.
- **Key C++ classes**: `RenderProcessImpl`, `RenderFrameImpl`, `BlinkInterfaceRegistry`.
- **Spawned**: by `RenderProcessHost::Init()` in the browser process.
- **Process count**: approximately one per committed site (scheme + eTLD+1), subject to process reuse heuristics. On low-memory devices, this is aggressively collapsed.
- **What it cannot do**: read files, make network connections, talk to the GPU directly, access other renderer processes' memory, read cookies from other sites.

### 3. GPU process (exactly one, usually)

- **Privileges**: slightly more than renderer — needs to call GPU driver APIs, but still sandboxed on some platforms.
- **Responsibilities**: accept GPU command buffers from renderer processes via shared memory, translate them into OpenGL/Metal/Vulkan/Direct3D calls, manage the GPU's display surface.
- **What it runs**: the command buffer service, ANGLE (translates OpenGL ES to platform-native APIs), Dawn (WebGPU layer).
- **Spawned**: by the browser process at startup.
- **Why isolated**: GPU drivers are notoriously buggy and historically exploitable. A crash in the GPU driver should not crash the browser. An exploit in the GPU driver should not have full browser-process privileges.
- **What it cannot do**: access the network, access user files. Can access GPU hardware via OS-mediated calls.

### 4. Network service (one, as a separate process since Chrome 77)

- **Privileges**: slightly reduced vs. old browser-process code, but not fully sandboxed (needs sockets).
- **Responsibilities**: all network I/O — DNS, TCP connections, TLS termination, HTTP/1.1, HTTP/2, HTTP/3/QUIC, WebSocket, URL fetching, the disk cache.
- **What it runs**: `//services/network/`, `//net/`.
- **Key design decision**: by isolating network code into its own process, a network stack bug (huge attack surface) doesn't give an attacker browser-process-level access. The network service communicates with the browser via Mojo.
- **Spawned**: by the browser at startup. If it crashes, the browser respawns it and pending requests are retried.

### 5. Utility processes (many types, one per task type)

Short-lived or long-lived processes for specific tasks, each with minimal privilege:

| Utility type | Purpose |
|---|---|
| Audio service | Platform audio I/O (isolated from renderer) |
| Video capture | Camera/microphone access |
| Media foundation (Windows) | Hardware video codec |
| Storage service | IndexedDB, Cache API, persistent storage |
| Speech recognition | STT processing |
| Printing | Platform print API |
| PDF renderer | Isolated sandbox for rendering PDFs |
| Sharing service | OS-level share sheets |

Each is spawned by the browser process on demand, with a sandbox configuration appropriate to its task.

### 6. Extension processes

Each extension with a background service worker gets its own renderer-like process. Extensions can have elevated permissions (e.g., read all cookies, inject into any page), so strict isolation from web content is critical. This is one of the earliest use cases for OOPIFs (launched Chrome 56: extension frames in their own processes).

### 7. WebUI processes

`chrome://` pages (settings, new tab, history, etc.) are HTML/JS pages, but they run in specially privileged renderer processes. They have access to browser-internal Mojo interfaces that web content cannot reach. They are always isolated from web content — a web page can never share a process with `chrome://settings`.

## Process lifecycle: from URL bar to committed document (20 min)

Walk through a complete navigation. This is the most important flow to understand if you want to work on browser-side Chromium code.

### Step 1 — user types a URL

`Browser → BrowserURLHandler → NavigationController::LoadURL` in the browser process. A `NavigationEntry` is created.

### Step 2 — begin navigation

`NavigationController` calls `FrameTreeNode::Navigator::Navigate()`. This creates a `NavigationRequest` — the single authoritative record of an in-flight navigation.

### Step 3 — choose a renderer process

`RenderProcessHostImpl::GetProcessHostForSiteInstance()` is called. Logic:
- Does an existing renderer process already serve this site (scheme + eTLD+1)?
- Is that process under the per-process memory limit (typically 512 MB)?
- Is Site Isolation enabled (yes on desktop)?

If yes and the process can serve this site: reuse. Otherwise: create a new `RenderProcessHost`, which calls `SpawnChildProcess()`, which forks a new process via the platform's process creation API.

### Step 4 — network fetch

`NavigationRequest` asks the network service (via Mojo) to fetch the URL. The network service starts a `URLLoaderFactory`, creates a `URLLoader`, and begins fetching. Headers arrive. CORB (Cross-Origin Read Blocking) runs here — if the response is a cross-origin document type that the renderer shouldn't receive, it's blocked before ever leaving the network service process.

### Step 5 — commit decision

When the response headers arrive, `NavigationRequest` examines the `Content-Type` and the target site. If the response is from a new site that needs a new renderer (or the same renderer isn't right for security reasons), a process swap occurs here — this is `CrossSiteNavigationThrottle`.

### Step 6 — commit the document

`RenderFrameHostImpl::CommitNavigation()` is called. It sends a `CommitNavigation` Mojo message to the chosen renderer's `RenderFrameImpl`. The renderer:
1. Receives the response body via a data pipe (Mojo).
2. Parses the HTML (L8 content).
3. Notifies the browser when the document is committed.

The browser process then updates its records: the `FrameTreeNode` now points to the new `RenderFrameHost`, which is associated with the committed `SiteInstance`.

### Step 7 — after commit

The renderer runs freely within its sandbox. For any privileged operation (network fetch, cookie access, file access, geolocation), it must send a Mojo request to the browser or network service, which validates and may execute the request.

Draw the full flow on the board. This diagram is reference material for HW9.

## What renderers can request — and how the browser validates (15 min)

This is the core of the trust model. A compromised renderer can send any Mojo message. The browser process must validate everything.

### Navigation requests (renderer-initiated)

When JavaScript calls `window.location = '...'` or `window.open(...)`, the renderer sends a navigation request to the browser process. The browser:
- Validates the URL (not a `chrome://` URL, not `javascript:` unless whitelisted, etc.).
- Checks same-origin policy for navigation permissions.
- Runs `CanCommitURL` checks before letting any document commit.

A compromised renderer **cannot** navigate itself to `chrome://settings` — the browser process rejects it.

### Cookie access

The renderer does not hold cookies. When JS reads `document.cookie`, the renderer sends a Mojo request to the browser's cookie store. The browser validates that the requesting renderer's `SiteInstance` matches the origin of the requested cookies. A compromised renderer cannot request `bank.com`'s cookies while being locked to `evil.com`.

### Network requests

All fetch/XHR/resource-load requests go through the network service via the browser. The browser's `URLLoaderFactory` is pre-configured with the renderer's origin and enforces the same-origin policy, CORS, and CORB (Cross-Origin Read Blocking) on responses. A compromised renderer cannot make an uncredentialed fetch to an arbitrary URL and read the response.

### The CanCommitURL check

One of the most security-critical checks in Chromium. When a renderer sends `DidCommitNavigation`, the browser process checks: *is this URL compatible with the SiteInstance this renderer is locked to?* If a compromised renderer tries to fake a commit from `bank.com` while it's locked to `evil.com`, this check fires and the browser kills the renderer (BadMessage).

Code: `RenderFrameHostImpl::ValidateDidCommitParams()`. Worth reading.

## Process reuse heuristics and memory cost (10 min)

The per-site-per-process model is memory-hungry. With 20 tabs across 15 sites, you might have 15 renderer processes plus a browser, GPU, and network process. On a 64 GB desktop, this is fine. On an 8 GB laptop it's tight. On a 2 GB Android phone it's untenable.

### Process limit

Chromium has a renderer process limit (default varies by platform and memory). When the limit is hit:
- New navigations are served in an existing process (process sharing / reuse).
- Shared processes are carefully chosen — never mixing sites that need strong isolation.
- On Android, the limit is aggressive; many sites share processes.

### What security is sacrificed

When two sites share a renderer process, they can read each other's memory in the presence of a Spectre-class attack (L19). This is a known, accepted tradeoff on memory-constrained devices.

On desktop, the process limit is high enough that sharing is rare. When it does occur, it happens only between sites that have no sensitive data relationship (not logged-in sites, not sites with COOP headers requiring strict isolation).

### Site Isolation on Android

Android isolates only "sensitive" sites (sites the user has logged into) — heuristically determined via signed-in sites list. Everything else may share a process. This is the `ISOLATE_ALL_SITES` vs. `PARTIAL_SITE_ISOLATION` distinction.

## A tiny code excerpt — RenderProcessHost (5 min)

Open [`content/browser/renderer_host/render_process_host_impl.h`](https://source.chromium.org/chromium/chromium/src/+/main:content/browser/renderer_host/render_process_host_impl.h).

Point out key members:
- `child_process_launcher_` — the platform-specific process spawner.
- `channel_` — the Mojo channel to the child.
- `site_instance_` — the site this process is locked to.
- `frames_` — the set of `RenderFrameHost`s currently in this process.

Show `RenderProcessHostImpl::Init()`: sets up the sandbox parameters, calls the child process launcher. Even reading the initialization sequence shows students the layered, deliberate structure.

## Live demo — `chrome://process-internals` (15 min)

Open `chrome://process-internals` on the projector. Navigate tabs. Show:

1. **`#general` tab**: list of all SiteInstances. For each frame in every tab, which process it's in, which site it's locked to.
2. Open a page with a cross-site iframe. Watch a new SiteInstance appear for the iframe in a different process.
3. Navigate a tab to a new site. Watch the SiteInstance change and the old process disappear (or be reused).
4. Open `chrome://settings` in a tab. Show it has its own SiteInstance, locked to `chrome://settings`, in a separate process.
5. Look at Task Manager alongside. Match up PIDs between the two views.
6. Find the network service process. Note it doesn't have an associated SiteInstance — it's not a renderer.

Ask students: *"Where is the GPU process in process-internals?"* (It's not there — `chrome://process-internals` shows web content SiteInstances, not infrastructure processes. For the GPU process, use Task Manager.)

## Reading for next lecture

- chromium.org: [Sandbox design doc (overview)](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/design/sandbox.md)
- chromium.org: [Linux Sandboxing](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/linux/sandboxing.md)
- chromium.org: [Windows Sandboxing](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/design/sandbox.md)

## Instructor notes

- HW9 (Process Zoo) is assigned this lecture.
- The navigation flow (Steps 1–7) is the most important part of this lecture and the hardest for students to internalize. Trace it on the board. Students are allowed to photograph it.
- If time is short, compress the "process reuse" section — the concepts appear again in L19.

---

[← Unit IV README](./README.md) · [Next: L18 — Sandboxing →](./L18-sandboxing.md)

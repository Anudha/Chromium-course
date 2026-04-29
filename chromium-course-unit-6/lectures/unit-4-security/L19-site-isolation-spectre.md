# Lecture 19 — Site Isolation and Spectre

| | |
|---|---|
| **Unit** | IV — Process Model & Security |
| **Week** | 10 |
| **Duration** | 1.5 hours |
| **Demo** | OOPIF inspection in `chrome://process-internals`; COOP header and `window.opener` isolation |

## Learning objectives

Students can:

1. Explain the Spectre vulnerability at a mechanism level — cache-timing side channels, speculative execution.
2. Describe why Spectre broke the same-process isolation assumption for web content.
3. State Chrome's Site Isolation response: site definition (scheme + eTLD+1), OOPIF, process-locked SiteInstances.
4. Describe how OOPIFs render cross-site iframes across process boundaries.
5. Explain Cross-Origin Read Blocking (CORB), Cross-Origin Opener Policy (COOP), and Cross-Origin Embedder Policy (COEP).
6. Identify when `crossOriginIsolated` mode is relevant and what it enables.

## Opening hook (5 min)

Put this on the board:

```javascript
// Runs in evil.com's renderer
const arr = new Uint8Array(256 * 4096);
const secret_addr = 0xBAD00000;  // a guess at where bank.com's cookie is
const probe = 0;

// Speculative execution loads arr[memory[secret_addr] * 4096]
// into cache, then we time access to arr[probe*4096] for each probe
// to recover memory[secret_addr] byte-by-byte.
```

Ask: *"In 2017, bank.com visited in one tab and evil.com visited in another could share a renderer process — evil.com's script could read bank.com's cookies from shared renderer memory. Why? And why is this hard to fix?"*

Both pages were JavaScript pages. Same renderer process = shared address space. The same-origin policy prevents evil.com from calling `document.cookie` on bank.com's documents. But it doesn't prevent reading the *memory* of those documents if you're in the same process and you have an arbitrary-read primitive.

And in January 2018, researchers published Spectre: a way to get an arbitrary-read primitive from *any* JavaScript, without any memory-corruption bug at all. The entire previous trust model broke.

## Spectre — the mechanism (20 min)

### Speculative execution

Modern CPUs execute instructions speculatively. When a branch (`if` statement, array bounds check) is encountered:

1. The CPU predicts which branch will be taken based on history.
2. It begins executing the predicted path *before* knowing whether the prediction is correct.
3. If the prediction was right: the work is kept.
4. If wrong: the speculative work is *rolled back* — registers are restored, the wrong path's results are discarded.

From a correctness standpoint, this is invisible. Programs always see the correct result. Speed: much better, because most branches are predicted correctly and the CPU avoids stalls.

### The cache side channel

When a memory address is read, the cache line containing it gets loaded into L1/L2/L3 cache. Subsequent reads from the same address (or same cache line) are ~100× faster than reads from non-cached addresses.

Timing `memory_access(addr)` tells you whether `addr` is in cache. If the CPU secretly executed a speculative load from address `X`, `X` will be in cache — even after the rollback. The rollback reverses the register state but **NOT the cache state**.

### Putting it together — the Spectre attack

Given:

```c
// C / WebAssembly / JIT'd JS — attacker controls `idx`
if (idx < array1.length) {
    value = array1[idx];         // speculative read of out-of-bounds memory
    cache_probe = array2[value * 4096];  // loads a cache line keyed by `value`
}
```

Steps:
1. Train the branch predictor to expect `idx < array1.length`.
2. Set `array1.length = 0` in memory (no speculative flush yet).
3. Call with `idx = <address of secret> - <base of array1>`.
4. The CPU speculatively executes `value = array1[idx]` — reading secret memory.
5. The CPU speculatively executes `cache_probe = array2[value * 4096]` — caching `array2[secret * 4096]`.
6. Branch misprediction is detected. Rollback. But `array2[secret * 4096]` is still cached.
7. Attacker times access to `array2[0]`, `array2[4096]`, `array2[2*4096]`, ... The fast one tells which `secret` value was read.

**Any memory in the process's address space can be read this way, one byte at a time, using only JavaScript.**

### Why this breaks the browser trust model

Before Spectre:

- evil.com and bank.com share a renderer process.
- evil.com's JavaScript cannot call `document.cookie` on bank.com's document (same-origin policy blocks it).
- **But evil.com can read bank.com's cookie bytes from shared memory using Spectre.**

The same-origin policy is a logical boundary. Spectre is a physical boundary violation — it leaks through the hardware.

### Why software mitigations are insufficient

You can't just patch this:

- Disabling `SharedArrayBuffer` (which provides a high-resolution timer) helps, but timers can be reconstructed from other sources.
- Timer coarsening (reducing `performance.now()` resolution) slows the attack but doesn't eliminate it.
- Site Isolation is the only robust defense: **if bank.com's memory is in a different OS process from evil.com, Spectre cannot read it.** OS process boundaries are physical — different address spaces.

This is why Site Isolation went from "desirable eventually" to "ship in six months" after January 2018.

## Site Isolation — the architecture (20 min)

### Site definition

Chromium's security principal is the **site**: scheme + eTLD+1 (effective top-level domain + 1 label).

Examples:
- `https://mail.google.com` and `https://maps.google.com` → same site: `https://google.com`
- `https://user.github.io` and `https://other.github.io` → different sites: `https://user.github.io` vs `https://other.github.io` (because `github.io` is in the public suffix list, so the site boundary is one level up)
- `http://example.com` and `https://example.com` → different sites (different scheme)

Why eTLD+1 and not full origin? Because subdomains of the same registrable domain can legitimately use `document.domain` to interact synchronously — two `iframe`s from `a.example.com` and `b.example.com` can both set `document.domain = 'example.com'` and then access each other. This means they need to share a process. (Note: `document.domain` mutation is being deprecated, which will eventually allow origin-level isolation.)

### Process-per-site

In Site Isolation mode, every renderer process is **locked** to a single site. `RenderProcessHostImpl` tracks which `SiteInstance` a process serves, and the browser refuses to load any document from a different site into that process.

This is enforced in two places:
- At process selection time (during navigation).
- At commit time via `CanCommitURL` checks (defense in depth — even if a bug routes to the wrong process, the commit check catches it).

### Out-of-Process iframes (OOPIFs)

The hardest engineering problem in Site Isolation: what do you do when a page at `evil.com` embeds an `<iframe src="https://bank.com/widget">`?

Before Site Isolation: the iframe renders in the same process as the outer page. Spectre accessible.

After Site Isolation: the iframe renders in **a different process**, in bank.com's renderer. The outer page never has bank.com's memory in its process.

But the page still visually contains the iframe! The compositor must composite pixels from two different processes — the parent's renderer and the iframe's renderer — into one display surface.

How OOPIF rendering works:

1. `bank.com`'s renderer process renders the iframe's content into its own compositor layer (a `SurfaceId`).
2. The browser passes a reference to that `SurfaceId` to `evil.com`'s compositor.
3. `evil.com`'s compositor treats the bank.com surface as an **opaque layer** — it positions and clips it, but cannot read its pixels.
4. The GPU process composites both layers into the final framebuffer.

This is the **Surface Embedding** model. Each OOPIF is a surface with an opaque ID. The parent can position it; the parent cannot read it.

### Performance cost

OOPIFs are expensive:
- Two separate render trees instead of one.
- Cross-process hit testing (where did the user click? which iframe was it in?).
- Cross-process focus management.
- Scroll coordination across processes.
- Layout queries that cross frames must round-trip via IPC.

Chromium spent years making OOPIFs work correctly. The OOPIF implementation touches nearly every rendering subsystem. The first uses launched in Chrome 56 (2017); full desktop OOPIF shipped in Chrome 67 (2018).

### The trust boundary for compositing

A key security invariant of OOPIFs: **the parent renderer can never access the pixel buffer of a child OOPIF.** The `SurfaceId` is an opaque reference. Only the browser process and GPU process know how to dereference it. The parent renderer sees: "at (x, y), width W, height H, there is a surface with ID Z." It submits this to the compositor. The compositor draws Z there. The parent cannot inspect Z's contents.

This prevents clickjacking variants where the parent could screenshot a bank.com iframe embedded in its own page.

## Cross-Origin Read Blocking (CORB) (10 min)

Site Isolation prevents Spectre on renderer memory. But there's another channel: what if the renderer itself fetches a cross-origin resource and then reads it with Spectre?

Scenario:
1. evil.com's JS runs `fetch('https://bank.com/secrets.json')`.
2. The same-origin policy prevents reading the response body.
3. But the response body bytes arrive in evil.com's renderer's memory anyway (buffered).
4. With Spectre, evil.com can read those bytes.

**CORB** (Cross-Origin Read Blocking) blocks this. Before a cross-origin response body reaches the renderer, the **network service** checks:

- Is this a "sensitive" MIME type? (HTML, XML, JSON, plain text — the types that contain user data.)
- Is the server's CORS response missing `Access-Control-Allow-Origin: *` or the appropriate header?
- If both: **strip the response body** before passing it to the renderer. The renderer gets a 200 with an empty body.

The bytes never reach the renderer's address space. Spectre cannot read what isn't there.

CORB is enforced in the network service process, which renders it moot for Spectre — the network service process is different from the renderer, so even if the network service has the bytes, the renderer's Spectre gadget can't reach them.

CORB is now superseded by the more explicit **CORP** (Cross-Origin Resource Policy) header, but CORB provides default protection without server-side changes.

## COOP and COEP — opt-in strong isolation (10 min)

CORB and Site Isolation are passive defenses. For sites that need even stronger isolation (or that want to use powerful APIs like `SharedArrayBuffer` that require it), two headers enable opt-in:

### Cross-Origin Opener Policy (COOP)

`Cross-Origin-Opener-Policy: same-origin`

When a page sends this header, it severs the `window.opener` relationship with any window that opened it, unless the opener is from the same origin. Concretely:

- Without COOP: if `bank.com` is opened by `evil.com` (`window.open('https://bank.com')`), `evil.com` has a `window` reference to `bank.com`. They can be in the same "browsing context group" and share a process.
- With COOP: bank.com's window is placed in a new browsing context group, isolated from evil.com's window. No shared JS references. Can be given its own dedicated process.

### Cross-Origin Embedder Policy (COEP)

`Cross-Origin-Embedder-Policy: require-corp`

Requires all cross-origin subresources to explicitly opt in to being embedded (via `Cross-Origin-Resource-Policy: cross-origin`). Subresources that don't opt in are blocked.

### `crossOriginIsolated` mode

When a document sends **both** COOP: same-origin and COEP: require-corp (or the newer COEP: credentialless), the document enters **`crossOriginIsolated`** mode. This unlocks:

- **`SharedArrayBuffer`** (re-enabled after being disabled post-Spectre).
- **High-resolution timers** (`performance.now()` with sub-millisecond resolution).
- **`Atomics.wait()`** on the main thread.
- **`measureUserAgentSpecificMemory()`**.

These features were disabled or degraded after Spectre because they provide timing channels useful for the attack. In `crossOriginIsolated` mode, the process isolation guarantees are strong enough that re-enabling them is safe — even with a Spectre gadget in this process, you can only read memory that the site explicitly loaded (which COEP ensures is all opt-in).

### Why this matters for scientific computing

(Direct bridge to Units VI and VII)

`SharedArrayBuffer` is required for WASM threads. WASM threads allow C/C++ scientific code compiled to WASM to use pthread-style parallelism — true parallel simulation on N cores. **Without `crossOriginIsolated`, WASM threads don't work.** Pages that want WASM threads must serve COOP + COEP headers. We'll return to this in L23 (WebGPU) and L24 (WASM).

## A tiny code excerpt — CORB in the network service (5 min)

Open [`services/network/cross_origin_read_blocking.cc`](https://source.chromium.org/chromium/chromium/src/+/main:services/network/cross_origin_read_blocking.cc) in Code Search.

Find `CrossOriginReadBlocking::ResponseAnalyzer::Sniff`. The logic:

1. Is this a cross-origin request?
2. Is the MIME type sensitive (HTML, XML, JSON, text)?
3. Is there a CORS header granting access?
4. If sensitive + no CORS: sniff the first ~1024 bytes to confirm the MIME type (some text/plain files contain HTML or JSON — the `Content-Type` can lie).
5. If confirmed sensitive: block the response body (empty it out, report an opaque network error to the renderer's resource loader).

Students can verify this by setting breakpoints or adding logging in a custom build — or just by reading the code.

## Live demo (15 min)

### Demo 1 — OOPIFs in `chrome://process-internals`

Open a page that embeds a cross-site iframe. Good real examples:
- Any page that embeds a Google Maps iframe.
- A page embedding a YouTube video.
- A page with a Facebook/Twitter share button widget.

Open `chrome://process-internals`. Show:
- The main frame is in process A, locked to the outer site.
- The cross-site iframe is in process B, locked to the embedded site.
- Both process entries show different PIDs.

Then navigate the iframe to a same-site page (if you have control). Show the iframe moving back to the same process as the parent.

### Demo 2 — COOP and `window.opener`

Create two simple pages:

```html
<!-- opener.html, served from localhost:8001 -->
<script>
const w = window.open('http://localhost:8002/opened.html');
setTimeout(() => {
  try {
    console.log('window.opener:', w.location.href);
  } catch(e) {
    console.log('Cross-origin opener access blocked:', e.message);
  }
}, 500);
</script>
```

```html
<!-- opened.html, served from localhost:8002 -->
<!-- Without COOP -->
<h1>No COOP</h1>
```

Show: `w.location.href` returns something (cross-origin window access — limited but reference exists). Now serve `opened.html` with header `Cross-Origin-Opener-Policy: same-origin`. Reload. Now the `window.open` reference in `opener.html` has a null `w` or throws on any property access. The windows are isolated.

Check `chrome://process-internals` — the two windows are in different browsing context groups and different processes.

### Demo 3 — CORB in the Network panel

Create a page on domain A that fetches JSON from domain B (no CORS headers on B):

```javascript
fetch('http://localhost:8002/data.json')
  .then(r => r.json())
  .catch(e => console.log('blocked:', e));
```

Without CORS on the server: shows as a CORS error in the console.

Now add `Content-Type: application/json` and `Cross-Origin-Read-Blocking: ?1` equivalent behavior — show in Network panel that the response is received (200), but the response body is **empty** (CORB stripped it). The request shows "CORB" in the DevTools Network panel's type column.

## Reading for next lecture

- chromium.org: [Mojo README](https://chromium.googlesource.com/chromium/src/+/HEAD/mojo/README.md)
- chromium.googlesource.com: [Intro to Mojo & Services](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/mojo_and_services.md)
- Browse a real `.mojom` file: [`third_party/blink/public/mojom/frame/frame.mojom`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/public/mojom/frame/frame.mojom)

## Instructor notes

- The Spectre explanation takes time. Don't skip it — students who don't understand Spectre don't understand why Site Isolation is mandatory rather than optional.
- CORB/COOP/COEP are a cluster of concepts; don't go too deep on any one. The payoff question ("why does WASM threads require COOP+COEP?") bridges well to L23–L24.
- The OOPIF surface embedding model is genuinely subtle. The key invariant: **the parent renderer has an opaque surface ID, not pixel access.** State this explicitly.

---

[← L18](./L18-sandboxing.md) · [Unit IV README](./README.md) · [Next: L20 — Mojo IPC →](./L20-mojo-ipc.md)

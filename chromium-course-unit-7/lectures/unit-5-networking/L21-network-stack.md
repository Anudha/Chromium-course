# Lecture 21 — The Network Stack: //net, QUIC, HTTP/3

| | |
|---|---|
| **Unit** | V — Networking & Storage |
| **Week** | 11 |
| **Duration** | 1.5 hours |
| **Demo** | `chrome://net-export` capture → Netlog Viewer analysis |

## Learning objectives

Students can:

1. Describe the path a `fetch()` call takes from Blink through the network service.
2. Explain Chrome's HTTP cache architecture: disk cache layout, cache key, validation (304), eviction.
3. Describe what QUIC is and why Chrome uses HTTP/3 over QUIC rather than HTTP/2 over TCP.
4. Use `chrome://net-export` and the Netlog Viewer to analyze a real network capture.
5. Identify the key classes in `//net` and their responsibilities.

## Opening hook (5 min)

Open the Network panel in DevTools. Load a page. Show students the waterfall. Ask: *"This is what DevTools shows you. What's actually happening underneath each of these bars? Where in Chromium's source does this work happen, which process, which thread?"*

Most developers treat the network as a black box. This lecture opens it.

## The path of a fetch() call (15 min)

Trace from JavaScript to network and back. Every step is a real class or IPC boundary.

```
Renderer process                       Network service process
─────────────────                      ───────────────────────

1. JS: fetch('https://api.example.com/data')

2. Blink: FetchManager
     ↓
3. Blink: XMLHttpRequest / Fetch API
     ↓
4. content/renderer: ResourceFetcher
     ↓
5. Blink bindings → network::mojom::URLLoaderFactory (Mojo IPC)
     ────────── IPC boundary ──────────────────────────────────▶

6. services/network: NetworkContext
     ↓
7. net::URLRequestContext
     ↓
8. net::URLRequest created
     ↓
9. net::HttpCache (check: is this request in cache?)
     │
     ├── Cache hit → return cached response directly
     │
     └── Cache miss → continue to network
          ↓
10. net::HttpNetworkTransaction
     ↓
11. net::HttpStreamFactory
     ↓
12. net::QuicStreamFactory (if QUIC/HTTP3 applicable) or
    net::HttpStreamPool  (TCP/HTTP2 or HTTP1.1)
     ↓
13. net::ClientSocketPool → establish / reuse connection
     ↓
14. TLS handshake (via BoringSSL)
     ↓
15. Request headers sent over the wire
     ↓
16. Response headers received
     ↓
17. net::HttpCache::WriteResponseInfo → write to disk cache
     ↓
18. Response body streamed via Mojo DataPipe back to renderer
     ◀─────────── IPC boundary ───────────────────────────────

19. Blink: ResourceResponse received
     ↓
20. JS: fetch() Promise resolves, Response.json() etc.
```

Each numbered step corresponds to real code in `//net` or `//services/network`. Open [`net/url_request/url_request.h`](https://source.chromium.org/chromium/chromium/src/+/main:net/url_request/url_request.h) — it's the central object. Everything in the network stack flows through `URLRequest`.

## The `//net` directory — major classes (10 min)

Walk through the key areas. Open Code Search to `chromium/src/net/` on the projector.

| Directory / File | Contents |
|---|---|
| `net/url_request/` | `URLRequest`, `URLRequestJob`, `URLRequestContext` — the top-level entry points |
| `net/http/` | `HttpCache`, `HttpNetworkTransaction`, `HttpResponseHeaders`, `HttpStream` |
| `net/socket/` | `ClientSocketPool`, `StreamSocket`, `TCPClientSocket` |
| `net/quic/` | QUIC protocol implementation, `QuicStreamFactory`, `QuicChromiumClientSession` |
| `net/ssl/` | TLS integration — delegates to BoringSSL |
| `net/dns/` | DNS resolver — async, with DoH (DNS-over-HTTPS) support |
| `net/cookies/` | `CookieMonster`, `CanonicalCookie`, `CookieStore` interface |
| `net/disk_cache/` | The HTTP cache disk implementation |
| `net/cert/` | Certificate verification chain |

**`URLRequestContext`** is the root object that owns all of these. Every profile has one (or more) `URLRequestContext`. It holds the cache, cookie store, socket pool, DNS resolver — everything a "network session" needs.

## The HTTP cache (15 min)

The HTTP cache is one of the most complex parts of `//net`. Understanding it explains cache-related bugs, performance wins, and the on-disk format.

### Cache key

Every cached resource has a cache key. In modern Chrome with storage partitioning (post-2020), the key is:

```
{top_frame_origin, network_isolation_key, URL}
```

This is **storage partitioning for the HTTP cache**. A resource fetched by `evil.com` that happens to go to `cdn.google.com` is cached separately from the same resource fetched by `google.com`. Without this, evil.com could detect whether you've visited google.com by timing a cache hit.

Before storage partitioning (pre-2020), the key was just the URL — a privacy disaster.

### Cache layers

Chrome's HTTP disk cache has two layers:

**Memory cache** (`net/http/http_cache.cc`, `ActiveEntry` map in `HttpCache`):
- Holds recently-used responses in RAM.
- Lookup is a hash-map keyed by (effectively) the cache key.
- Evicted via LRU when the cache budget is exceeded.

**Disk cache** (`net/disk_cache/`):
- Blockfile format by default on most platforms (the "Simple" backend on some).
- The **Simple backend** stores each entry as a pair of flat files: `<hash>_0` (headers) and `<hash>_1` (body). More cache-miss-friendly, easier to reason about.
- The **Blockfile backend** (legacy) uses a complex multi-file block allocation scheme.
- Both are in `~/.config/google-chrome/Default/Cache/` on Linux, `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Cache\` on Windows.

### Cache entry lifecycle

1. **Request arrives**: `HttpCache::Transaction::BeginCacheRead` checks the memory cache and then opens a disk cache entry.
2. **Cache hit + fresh**: response body served directly from disk/memory. No network contact.
3. **Cache hit + stale**: conditional request sent. Server returns 304 Not Modified → headers updated, body served from cache. Server returns 200 → old entry replaced.
4. **Cache miss**: network request made, response stored in a new cache entry as it streams in.
5. **Eviction**: when the disk cache exceeds its configured size, the least-recently-used entries are deleted.

### Cache-Control directives

`HttpCache` reads and enforces `Cache-Control` headers from both requests and responses:

- `max-age=N` — response is fresh for N seconds.
- `no-cache` — always revalidate with the server.
- `no-store` — never write to cache.
- `private` — browser-local only (not shared caches).
- `stale-while-revalidate=N` — serve stale, revalidate in background.

The Chrome team wrote a thorough explanation at [developer.chrome.com/docs/workbox/caching-strategies-overview](https://developer.chrome.com/docs/workbox/caching-strategies-overview/).

## QUIC and HTTP/3 (20 min)

This is the most technically distinctive piece of Chrome's network stack. Chrome's team invented QUIC; it became the IETF standard for HTTP/3.

### What's wrong with TCP + HTTP/2

HTTP/2 solved HTTP/1.1's head-of-line blocking at the HTTP layer — multiple requests share one TCP connection without waiting for each other. But TCP itself has **head-of-line blocking at the transport layer**: if one TCP packet is lost, TCP stalls delivery of all subsequent packets in that stream until the lost packet is retransmitted. HTTP/2's multiplexed streams all block together.

TLS adds two or three round-trips for handshake (TLS 1.2) or one to zero round-trips (TLS 1.3). Combined with TCP's own handshake, a new connection to a server costs at least one full round-trip before any application data flows. For high-latency links (mobile on 4G, satellite), this is painful.

### What QUIC does differently

QUIC is a transport protocol built **on top of UDP** instead of TCP. It reimplements everything TCP provides (reliability, ordering, flow control, congestion control) but adds:

- **Per-stream reliability**: packet loss only blocks the one stream it affects, not all streams. True multiplexing.
- **0-RTT connection establishment**: for repeated connections to a known server, QUIC can send application data in the very first packet — zero round-trips after the first connection.
- **Integrated TLS 1.3**: TLS is built into the QUIC handshake, not layered on top. No separate TLS handshake.
- **Connection migration**: if your IP address changes (roaming from WiFi to 4G), QUIC connections can survive the change by updating the connection ID. TCP connections die.
- **No kernel involvement for multiplexing**: QUIC is implemented entirely in userspace (Chrome's `net/quic/`). TCP is a kernel protocol — Chrome cannot modify its behavior.

### HTTP/3

HTTP/3 is simply **HTTP semantics transported over QUIC**. The same methods, status codes, and headers — but carried over QUIC's streams instead of TCP streams. `content-type: application/json` works the same. The difference is underneath.

Chrome sends the `Alt-Svc: h3=":443"` header in its `SETTINGS` frame when a server supports QUIC, and Chrome upgrades subsequent connections. You can see this in the Network panel — requests with a green lightning bolt icon in the "Protocol" column are HTTP/3.

### QUIC in Chrome's source

- `net/quic/` — Chrome's client-side QUIC implementation
- `net/third_party/quiche/` — the shared QUIC implementation (shared with Google's servers)
- `QuicStreamFactory` — manages QUIC sessions
- `QuicChromiumClientSession` — one QUIC connection to one server

Chrome was the primary reference client for QUIC during its development. Google runs QUIC on all its properties — Gmail, YouTube, Search — so Chrome's QUIC implementation gets exercised by billions of connections per day.

### A note on the QUIC specification

[quicwg.org](https://quicwg.org/) holds the IETF QUIC Working Group specifications. RFC 9000 is the QUIC transport spec. RFC 9114 is HTTP/3. Both are primary sources; the RFCs are clear, relatively accessible, and worth skimming.

## The DNS resolver (5 min)

`net/dns/` contains Chrome's own async DNS resolver. Key features:

- **DNS-over-HTTPS (DoH)**: Chrome can resolve names via HTTPS to a DoH server (e.g., `https://dns.google/dns-query`). This encrypts DNS queries from network eavesdroppers.
- **Async, non-blocking**: DNS resolution never blocks the network thread.
- **Built-in hosts file parser**: reads `/etc/hosts` on Linux/macOS.
- **DNS prefetch**: Chrome prefetches DNS for links on the current page.

You'll see DNS queries in the Netlog as `HOST_RESOLVER_IMPL_JOB` events.

## A tiny code excerpt — HttpCache::Transaction::BeginCacheRead (5 min)

Open [`net/http/http_cache_transaction.cc`](https://source.chromium.org/chromium/chromium/src/+/main:net/http/http_cache_transaction.cc). Search for `BeginCacheRead`. The state machine:

```cpp
int HttpCache::Transaction::BeginCacheRead() {
  // If the mode is NONE, we're not using the cache.
  if (mode_ == NONE)
    return BeginNetworkRequest();

  // ... check disk cache
  cache_key_ = GenerateCacheKey(request_);
  return OpenOrCreateEntry();
}
```

`HttpCache::Transaction` is a state machine — it has a `DoLoop()` method that drives state transitions. This pattern (state machine over async I/O) appears everywhere in `//net`. Students who want to contribute to the network stack need to learn it.

## Live demo — `chrome://net-export` and Netlog Viewer (20 min)

This demo teaches students to read the tool that's required for HW11.

### Recording a netlog

1. Open `chrome://net-export/` on the projector.
2. Click "Start Logging to Disk." Set "Capture mode" to "Everything."
3. Navigate to a specific HTTPS page in another tab (e.g., `https://wikipedia.org/wiki/QUIC`).
4. Stop logging. Save the file as `my-netlog.json`.
5. Open [netlog-viewer.chromium.org](https://netlog-viewer.chromium.org/) (or the local tool).
6. Load `my-netlog.json`.

### What to show in the viewer

Walk students through each section:

**Events tab:**
- `HOST_RESOLVER_IMPL_JOB` — DNS query. Show start time, response, cache hit vs. miss.
- `CONNECT_JOB` — TCP (or QUIC) connection establishment. Show elapsed time for handshake.
- `SSL_CONNECT` — TLS handshake. Show negotiated protocol version (TLS 1.3), cipher suite, ALPN (h2 or h3).
- `HTTP_TRANSACTION_READ_RESPONSE_HEADERS` — server's response headers.
- `HTTP_CACHE_ADD_TO_ENTRY` — caching the response.

**Timeline:** show events on a horizontal time axis. Identify which part of a page load is DNS, which is TCP, which is TLS, which is waiting for the server.

**DNS tab:** all resolved hostnames, A/AAAA records.

**Sockets tab:** every TCP/QUIC connection with state.

### The key observation

For the Wikipedia page, point out:
- First connection: DNS + TCP + TLS handshake visible.
- Second connection to same server (or subresources): connection reuse — no DNS, no handshake.
- HTTP/3 (if the server supports it): protocol shows as "h3" in the events.
- Cache hits for static resources on subsequent page loads: `HTTP_CACHE_ENTRY` events with no network request.

Ask: *"What's the biggest latency contributor for this page load?"* Usually: TLS handshake or server response time, not DNS. DNS is typically sub-10ms for CDN-served resources.

## Reading for next lecture

- chromium.googlesource.com: [Life of a URLRequest](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/net/docs/life-of-a-url-request.md)
- chromium.googlesource.com: [net README](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/net/README.md)
- quicwg.org: [RFC 9000 — QUIC: A UDP-Based Multiplexed and Secure Transport](https://quicwg.org/base-drafts/rfc9000.html) — skim §1 and §5

## Instructor notes

- HW11 is assigned this lecture — the Netlog portion specifically. The storage forensics portion is assigned in L22/L22b.
- `chrome://net-export` is not well known even among developers. The demo is worth extra time.
- The QUIC section is long but students find it genuinely interesting — it's one of the clearest examples in the course of Chromium literally shipping an IETF standard.
- The Netlog Viewer at `netlog-viewer.chromium.org` is the correct primary-source tool; don't use third-party alternatives.

---

[← Unit V README](./README.md) · [Next: L22 — Storage Internals →](./L22-storage-internals.md)

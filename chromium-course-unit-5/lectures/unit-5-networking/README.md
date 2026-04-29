# Unit V — Networking & Storage

**Week 11 · Lectures 21–22b**

This unit covers how data moves into and out of Chromium — over the network, and on disk. Three lectures across one week:

- **L21** — The network stack: `//net`, `URLRequest`, HTTP cache, QUIC, `chrome://net-export`
- **L22** — Internal storage architecture: where cookies, IndexedDB, Cache API, and Local Storage live in C++ and on disk
- **L22b** — External access lab: reading Chrome's storage from Python using `sqlite3`, LevelDB, and the CDP/Playwright APIs

Midterm 2 is Thursday of this week. The Lab (L22b) is built around content you need for HW11, which is the most hands-on assignment in the course.

## Lectures

| # | Title | Demo |
|---|---|---|
| [L21](./L21-network-stack.md) | The Network Stack: //net, QUIC, HTTP/3 | `chrome://net-export` → Netlog Viewer |
| [L22](./L22-storage-internals.md) | Storage: Cookies, IndexedDB, Cache API, OPFS | `chrome://quota-internals`; LevelDB file inspection |
| [L22b](./L22b-external-access-lab.md) | External Access Lab: Python, SQLite, CDP | Live Python reads of Cookie DB; Playwright cookie extraction |

## Unit learning outcomes

Students who complete Unit V can:

1. Trace a `fetch()` call from Blink through the network service, HTTP cache, QUIC connection, and back.
2. Explain Chrome's HTTP cache disk layout and eviction policy.
3. State where each storage type lives on disk for Linux, macOS, and Windows.
4. Describe how Chrome's cookie store is backed by SQLite and what each column means.
5. Explain why Chrome holds an exclusive lock on the cookie database and what that means for external access.
6. Use Python `sqlite3` to read (a copy of) the Chrome cookie database.
7. Decode Chrome's Windows timestamps (`WebKit epoch`).
8. Describe cookie encryption per OS (DPAPI, Keychain, libsecret).
9. Use Playwright or CDP to read cookies without touching the database directly.
10. Explain storage partitioning and why `top_frame_site_key` exists.

## Associated homework

- [HW11 — Netlog Safari + Storage Forensics](../../homework/HW11-netlog-safari.md) (assigned L21, due end of Week 11 / after Midterm 2)

## Midterm 2

**Thursday of Week 11, in class.** Covers Units III–V (L13–L22). See [exams/midterm-2.md](../../exams/midterm-2.md). HW11 is assigned before the midterm but due after — start it early so the Netlog section informs your midterm prep.

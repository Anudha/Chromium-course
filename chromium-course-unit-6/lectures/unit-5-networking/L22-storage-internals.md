# Lecture 22 — Storage: Cookies, IndexedDB, Cache API, OPFS

| | |
|---|---|
| **Unit** | V — Networking & Storage |
| **Week** | 11 |
| **Duration** | 1.5 hours |
| **Demo** | `chrome://quota-internals`; raw LevelDB file inspection; Storage DevTools panel |

## Learning objectives

Students can:

1. State the physical disk path for each storage type on Linux, macOS, and Windows.
2. Describe the C++ class responsible for each storage type.
3. Explain what storage partitioning is and why `top_frame_site_key` exists.
4. Describe Chrome's SQL abstraction layer and why Chrome uses its own SQLite wrapper.
5. Explain what IndexedDB is on disk (LevelDB + Snappy encoding).
6. Describe the Cache API's disk representation.
7. Identify the storage quota model and what `chrome://quota-internals` shows.

## Opening hook (5 min)

Ask: *"You visit a chemistry database like PubChem, log in, build a compound library in its webapp. Six months later you open Chrome and the library is still there. Where did the library go when you closed the browser? Where is it right now, physically, on your filesystem?"*

Most students can't answer this. Most web developers can't either. By the end of this lecture, they can name the exact file path, the C++ class that manages it, and the on-disk encoding.

## The profile directory — the master map (10 min)

Everything browser-local lives under Chrome's profile directory. The profile is at:

| OS | Path |
|---|---|
| Linux | `~/.config/google-chrome/Default/` |
| macOS | `~/Library/Application Support/Google/Chrome/Default/` |
| Windows | `%LOCALAPPDATA%\Google\Chrome\User Data\Default\` |

For Chromium (the open-source build), replace "Google/Chrome" with "chromium" on Linux/macOS, "Chromium/Application" on Windows.

Inside the profile directory (selective):

```
Default/
├── Cookies                  ← SQLite, cookies
├── History                  ← SQLite, browser history
├── Favicons                 ← SQLite, site favicons
├── Login Data               ← SQLite, saved passwords (encrypted)
├── Web Data                 ← SQLite, autofill data, search engines
├── Bookmarks                ← JSON, browser bookmarks
├── Preferences              ← JSON, all Chrome preferences
├── Cache/                   ← HTTP disk cache (Simple backend)
├── Code Cache/              ← V8 bytecode and JS compiled code cache
├── IndexedDB/               ← LevelDB databases, one dir per origin
│   └── https_example.com_0.indexeddb.leveldb/
├── Local Storage/           ← LevelDB, localStorage data
│   └── leveldb/
├── Session Storage/         ← LevelDB, sessionStorage (ephemeral)
├── Service Worker/          ← Service worker registration and scripts
├── CacheStorage/            ← Cache API entries, per-origin
│   └── <hash>/              ← SimpleCache format inside
├── File System/             ← Origin Private File System (OPFS)
│   └── Origins/
├── Extension State/         ← LevelDB, extension storage
├── GPUCache/                ← Compiled GPU shaders
└── Network/                 ← HSTS, DNSSD, etc.
```

Every subdirectory represents storage attributed to a specific origin. When you clear site data for example.com, Chrome deletes or purges the relevant files for that origin across all these directories.

## Cookies — SQLite on disk (20 min)

### C++ architecture

- **`net::CookieMonster`** — the in-memory cookie store. All reads/writes go through this.
- **`net::SQLitePersistentCookieStore`** — the persistent backend. Reads cookies from SQLite on startup; flushes changes asynchronously.
- **`network::mojom::CookieManager`** — the Mojo interface exposing cookie operations to the rest of Chromium.
- **`blink::RestrictedCookieManager`** — the renderer-facing Mojo interface for `document.cookie`.

### Database file: `Default/Cookies`

A SQLite v3 database. Current schema version: **21** (as of 2024). The schema is defined in [`net/extras/sqlite/sqlite_persistent_cookie_store.cc`](https://source.chromium.org/chromium/chromium/src/+/main:net/extras/sqlite/sqlite_persistent_cookie_store.cc).

Run `.schema cookies` in the SQLite shell on a closed-browser copy:

```sql
CREATE TABLE cookies (
    creation_utc     INTEGER NOT NULL,  -- microseconds since Windows epoch
    host_key         TEXT    NOT NULL,  -- e.g. ".example.com"
    top_frame_site_key TEXT  NOT NULL,  -- storage partition key (see below)
    name             TEXT    NOT NULL,
    value            TEXT    NOT NULL,  -- plaintext (legacy/unencrypted)
    encrypted_value  BLOB    DEFAULT '',-- AES-encrypted value (modern)
    path             TEXT    NOT NULL,
    expires_utc      INTEGER NOT NULL,  -- microseconds since Windows epoch
    is_secure        INTEGER NOT NULL,
    is_httponly      INTEGER NOT NULL,
    samesite         INTEGER NOT NULL,  -- -1=unspecified, 0=None, 1=Lax, 2=Strict
    last_access_utc  INTEGER NOT NULL,
    has_expires      INTEGER NOT NULL DEFAULT 1,
    is_persistent    INTEGER NOT NULL DEFAULT 1,
    priority         INTEGER NOT NULL DEFAULT 1, -- 0=Low, 1=Medium, 2=High
    source_scheme    INTEGER NOT NULL DEFAULT 0, -- 0=unset, 1=http, 2=https
    source_port      INTEGER NOT NULL DEFAULT -1,
    last_update_utc  INTEGER NOT NULL,
    UNIQUE (host_key, top_frame_site_key, name, path)
);
```

### Column details students need to know

**`creation_utc` and `expires_utc`**: Chrome timestamps are microseconds since **January 1, 1601 UTC** — the Windows FILETIME epoch (not Unix epoch). To convert to Unix time:

```python
import datetime
def chrome_time_to_datetime(chrome_ts):
    # Subtract microseconds between 1601-01-01 and 1970-01-01
    # That's 11644473600 seconds = 11644473600_000_000 microseconds
    unix_us = chrome_ts - 11_644_473_600_000_000
    return datetime.datetime(1970, 1, 1) + datetime.timedelta(microseconds=unix_us)
```

**`host_key`**: starts with a dot for domain cookies (`.example.com` matches `sub.example.com`). Host-only cookies have no leading dot (`example.com`).

**`top_frame_site_key`**: the site of the top-level frame when this cookie was set. Empty string (`''`) for cookies set without storage partitioning context (first-party). Non-empty for partitioned third-party cookies. This is **storage partitioning** — a cookie set by `tracker.io` embedded in `news.com` is stored separately from the same cookie set by `tracker.io` embedded in `bank.com`. Each gets a different `top_frame_site_key`.

**`value` vs. `encrypted_value`**: historically `value` held plaintext. Since Chrome's "cookie encryption" feature (gradually rolled out 2014–present), `value` is empty and `encrypted_value` holds an encrypted blob. The encryption scheme is platform-specific — see L22b.

**`samesite`**: `-1` = SameSite attribute not specified (defaults to Lax by current spec); `0` = `None`; `1` = `Lax`; `2` = `Strict`.

### The exclusive lock

Chrome holds a **SQLite exclusive lock** on the `Cookies` file while it's running. Any attempt to `sqlite3.connect('Cookies')` from Python while Chrome is open will fail or return stale data. The proper approach is either:
1. Close Chrome first.
2. Copy the file to a temp location (SQLite allows reading a copy).
3. Use the CDP (Chrome DevTools Protocol) or Playwright/Selenium to read cookies through the running browser.

This is the subject of L22b.

## Local Storage — LevelDB (10 min)

### What localStorage is

Web API: `window.localStorage.setItem('key', 'value')`. Synchronous, string-only, ~5 MB per origin, origin-scoped.

### On-disk format

`Default/Local Storage/leveldb/` — a single LevelDB database storing all origins' localStorage data.

**LevelDB** is a key-value store developed by Google (Jeff Dean, Sanjay Ghemawat). Keys and values are arbitrary byte strings. Data is stored in:
- **`.log`** files: write-ahead log for the most recent writes.
- **`.ldb`** files: Sorted String Table (SST) format — immutable, sorted key-value sequences, Snappy-compressed.
- **MANIFEST** file: describes which `.ldb` files are current.
- **CURRENT** file: points to the current MANIFEST.

The LevelDB source lives in `//third_party/leveldatabase/` in the Chromium tree.

**Key format for localStorage**: Chrome prefixes localStorage keys with the origin. A key looks roughly like:

```
_chrome_.<serialized-origin>.LOCAL_STORAGE.<js-key>
```

This allows the single LevelDB to serve all origins without collision.

### Why LevelDB for localStorage?

- **Sequential writes**: LevelDB's log-structured merge tree turns random writes into sequential disk writes. Fast, especially on spinning disks.
- **Compaction**: periodic background compaction merges small SST files into larger sorted ones.
- **Atomic updates**: LevelDB's write batches are atomic — either all apply or none do.

The C++ class: **`DOMStorageDatabase`** (in `//components/services/storage/dom_storage/`).

## IndexedDB — LevelDB per origin (10 min)

### What IndexedDB is

The web's only true client-side database API: async, transactional, indexed, supports structured data (not just strings). Used by Google Docs offline, PubChem's compound library, many PWAs.

### On-disk format

`Default/IndexedDB/<origin>.indexeddb.leveldb/` — one LevelDB database **per origin**.

The origin is URL-encoded in the directory name. For `https://www.example.com`, you'd see:

```
Default/IndexedDB/
└── https_www.example.com_443.indexeddb.leveldb/
    ├── CURRENT
    ├── LOCK
    ├── LOG
    ├── MANIFEST-000001
    ├── 000003.log
    └── 000004.ldb
```

**Key-value encoding inside**: Chrome's IndexedDB implementation encodes keys and values using its own internal format (not a simple JSON; it uses a custom binary format for efficient indexing). The values themselves are **Snappy-compressed** serialized V8 objects (the same serialization V8 uses for `structuredClone`).

**Reading IndexedDB from outside the browser**: extremely difficult without Chrome running, because:
1. The LevelDB files may be locked.
2. The key format and value encoding are Chrome-internal and undocumented.
3. Values are Snappy-compressed V8-serialized objects.

The practical external access path is the **CDP** (`Storage.getStorageKeyEntries`, `IndexedDB.requestData`) or Playwright's `page.evaluate(() => indexedDB...)`. This is the right approach and what L22b covers.

The C++ class: **`IndexedDBBackingStore`** (in `//content/browser/indexed_db/`).

## Cache API — SimpleCache format (10 min)

### What the Cache API is

`caches.open('v1').then(c => c.add('/data.json'))`. Used by service workers to cache network responses for offline use. Different from the HTTP disk cache (which is Chrome-internal); this is JS-accessible.

### On-disk format

`Default/CacheStorage/<hash>/` — one SimpleCache directory per registered cache name.

The **SimpleCache backend** stores each entry as a pair of files:

```
CacheStorage/
└── <origin-hash>/
    └── <cache-name-hash>/
        ├── index         ← index file (metadata)
        ├── <url-hash>_0  ← response headers + metadata
        └── <url-hash>_1  ← response body
```

The `_0` file contains HTTP response headers (text, parseable). The `_1` file contains the raw response body. Both use a simple binary header wrapping their content. You can read `_0` files with a hex editor or a small Python script (the binary header is a fixed-size struct).

The C++ class: **`CacheStorageManager`** (in `//content/browser/cache_storage/`).

## Origin Private File System (OPFS) — the file-system API (5 min)

### What OPFS is

`navigator.storage.getDirectory()` — gives JS access to a private, sandboxed filesystem visible only to the origin. Used for high-performance local file access (SQLite WASM, video editors, local databases in browser).

### On-disk format

`Default/File System/Origins/<hash>/` — each origin gets a directory. Files are stored essentially verbatim (unlike IndexedDB's encoded values), making OPFS the most directly inspectable storage type.

OPFS is particularly relevant for scientific computing: SQLite compiled to WASM can use OPFS to persist its database file, giving you a full SQL database inside the browser. We'll see this in L24.

## Storage quota and partitioning (10 min)

### The quota model

Every origin has a quota — a maximum amount of storage it may use across IndexedDB, Cache API, OPFS, and localStorage. Chrome's quota system is managed by the **Storage Service** (`//services/storage/`).

Quota is calculated as a fraction of available disk space (configurable) with per-origin limits. When quota is exceeded, writes fail with a `QuotaExceededError`.

`navigator.storage.estimate()` lets JS query its quota:

```javascript
const est = await navigator.storage.estimate();
console.log(est.quota);  // bytes available
console.log(est.usage);  // bytes used
```

### `chrome://quota-internals`

Open this page on the projector. It shows:
- Per-origin storage usage breakdown.
- Quota limits.
- Eviction candidates (entries Chrome may delete if storage gets low).
- Temporary vs. persistent storage distinction.

### Storage partitioning

As with cookies, non-cookie storage (localStorage, IndexedDB, Cache API) is **partitioned** by top-frame origin. A tracker's localStorage set while embedded in `news.com` is a different entry from the same tracker's localStorage set while embedded in `bank.com`. This prevents cross-site tracking via shared storage.

In the filesystem, this is reflected by origin directories encoding both the embedded origin and the top-frame site:

```
Default/Local Storage/leveldb/   ← key includes top-frame in prefix
Default/IndexedDB/https_tracker.com_443.indexeddb.leveldb/
    (legacy, unpartitioned)
Default/IndexedDB/https_tracker.com_443_https_news.com_443.indexeddb.leveldb/
    (partitioned, newer)
```

The exact partition key encoding is in `//content/browser/storage_partition_impl.cc`.

## A tiny code excerpt — SQLite in Chrome (5 min)

Chrome doesn't use raw SQLite — it uses its own wrapper in `//sql/`. Open [`sql/database.h`](https://source.chromium.org/chromium/chromium/src/+/main:sql/database.h). Key features:

- **Exclusive locking by default**: `sql::Database` opens with `SQLITE_OPEN_EXCLUSIVE_LOCKING`. No other process can open the same database while Chrome runs.
- **Error handling**: automatic poisoning — if a database error occurs, all subsequent operations on that `Database` object fail immediately. Prevents partial-state bugs.
- **Cached statements**: `sql::Statement` with `SQL_FROM_HERE` macro caches compiled queries by source location.
- **Diagnostic info**: `sql::Database::GetDiagnosticInfo()` for crash reporting.

Students who want to understand how Chrome reads and writes its own SQLite databases should start with `sql/database.h` and `sql/statement.h`.

## Live demo (15 min)

### Demo 1 — profile directory tour

Open a terminal. `ls -la ~/.config/google-chrome/Default/` (Linux) or equivalent. Point out each storage type. Note file sizes — `Cookies` is usually small (a few MB), `IndexedDB/` can be gigabytes for heavy web apps.

```bash
ls -lh ~/.config/google-chrome/Default/Cookies
sqlite3 ~/.config/google-chrome/Default/Cookies ".tables"
# (Chrome must be CLOSED for this to work)
```

Show the `.tables` output — there's just one: `cookies` (plus `meta`).

### Demo 2 — read the cookie schema

```bash
sqlite3 ~/.config/google-chrome/Default/Cookies
.schema cookies
SELECT COUNT(*) FROM cookies;
SELECT host_key, name, samesite, is_secure, has_expires FROM cookies LIMIT 10;
```

Walk through the output. Show a real cookie from a site the student has visited. Point out `encrypted_value` is a blob — can't read it here (that's L22b).

### Demo 3 — inspect an IndexedDB origin directory

```bash
ls ~/.config/google-chrome/Default/IndexedDB/ | head -20
# find a large one
du -sh ~/.config/google-chrome/Default/IndexedDB/*
```

Open the LevelDB directory for a large app (e.g., Google Docs if the student uses it). Show `.ldb`, `.log`, `MANIFEST`, `CURRENT` files. Open an `.ldb` file in a hex editor — compressed binary, mostly unreadable directly.

Compare with the `Local Storage/leveldb/` directory — same format, one database for all origins.

### Demo 4 — `chrome://quota-internals`

Open on projector. Point out origins using significant storage. Find one the class recognizes (Google Docs, YouTube, etc.). Show quota vs. usage.

## Reading for next lecture

No new external readings. Bring:
- A working Python 3 environment (`python3 --version`).
- `pip install playwright cryptography` completed before class.
- A Chrome profile with cookies from real sites (your normal browser profile).

## Instructor notes

- The timestamp epoch gotcha (1601 not 1970) always gets a reaction. Put it on the board in big letters.
- `exclusive locking` is the single most important practical fact about the cookie database. Emphasize it twice.
- Students from chem/ChemE should pay extra attention to IndexedDB and OPFS — these are the storage backends for offline scientific web apps.
- The storage partitioning story (`top_frame_site_key`) bridges back to L19's privacy content.

---

[← L21](./L21-network-stack.md) · [Unit V README](./README.md) · [Next: L22b — External Access Lab →](./L22b-external-access-lab.md)

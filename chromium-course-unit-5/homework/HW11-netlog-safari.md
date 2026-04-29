# HW11 — Netlog Safari + Storage Forensics

**Assigned:** Week 11 · **Due:** End of Week 11 (after Midterm 2) · **Weight:** ~2.3% of course grade

## Goal

Two exercises in one assignment: analyze a real network capture using the Netlog Viewer, then forensically inspect Chrome's storage databases using Python — both the raw-file approach and the Playwright CDP approach.

## Part A — Netlog Safari (50 pts)

### Setup

1. Open `chrome://net-export/`.
2. Set capture mode to **"Everything including raw bytes"**.
3. Click "Start Logging to Disk."
4. In a different tab, navigate to a **specific page assigned to your section** (posted on the course site — one URL per section so grading is consistent). Wait for the page to fully load including all subresources.
5. Stop logging. Save as `hw11-netlog.json`.
6. Open [netlog-viewer.chromium.org](https://netlog-viewer.chromium.org/) and load your file.

### Questions

Answer in `netlog-report.md`:

**A1 (8 pts)** — DNS queries. How many unique hostnames were resolved during the page load? List them. How many were served from the DNS cache (no network query)? How many required a real DNS lookup, and what were their TTLs?

**A2 (8 pts)** — Connections. How many distinct TCP or QUIC connections were established (not reused)? How many connections were reused from a prior session? For the first connection established, what was the wall-clock duration of (a) the TCP/QUIC handshake, (b) the TLS handshake, (c) the time until first response byte (TTFB)?

**A3 (8 pts)** — Protocol distribution. List each unique protocol used (`h1`, `h2`, `h3`) and how many requests used each. For any `h3` requests, identify which server announced QUIC support and via which mechanism (`Alt-Svc` header or QUIC Discovery).

**A4 (8 pts)** — HTTP cache behavior. Which resources were served from the HTTP cache (look for `HTTP_CACHE_ENTRY_NOT_IN_CACHE` vs. `HTTP_CACHE_ENTRY`). For at least one cached resource, identify its `Cache-Control` header and compute whether it was within its `max-age`.

**A5 (8 pts)** — Blocking resource. Identify the single resource whose network fetch took the longest (highest latency from request start to response complete). What was the bottleneck — DNS, TCP, TLS, server response time, or body transfer? Cite specific timestamps from the Netlog.

**A6 (10 pts)** — Bottleneck analysis. If you were tasked with reducing this page's load time by 30%, what would you change? Back each recommendation with specific evidence from the Netlog. (At least two recommendations, each tied to data.)

### Deliverable

- `hw11-netlog.json` — your capture file
- `netlog-report.md` — answers to A1–A6

---

## Part B — Storage Forensics (50 pts)

### Setup

Make sure Chrome is **closed** before Part B1. Re-open Chrome for Part B2.

### B1 — Raw SQLite cookie read (25 pts)

Write a Python script `read_cookies.py` that:

1. Locates the Chrome `Cookies` file automatically based on the current OS (Linux/macOS/Windows — detect with `platform.system()`).
2. Copies it to a temp location.
3. Connects to the copy with `sqlite3`.
4. Queries all cookies for a specific domain (passed as `sys.argv[1]`).
5. Prints for each cookie:
   - `host_key`, `name`, `value` (if plaintext) or `<encrypted>` (if `encrypted_value` is set)
   - `expires_utc` converted to a human-readable UTC datetime
   - `is_secure`, `is_httponly`, `samesite` (as string: `Unspecified`/`None`/`Lax`/`Strict`)
   - `top_frame_site_key` (note if it's a partitioned cookie)
   - Whether the cookie is session-only (`has_expires=0`)
6. Prints a summary at the end: total cookies, expired cookies, `Secure`-flagged cookies, partitioned cookies.

**Run your script on `google.com`** and include the output as `google-cookies.txt`.

**Run your script on a domain of your choice** (a site you actually use) and include output as `other-cookies.txt`.

#### Decryption bonus (5 pts extra credit)

Extend `read_cookies.py` to actually decrypt `encrypted_value` for your platform. For macOS: implement the PBKDF2+AES-128-CBC decryption from L22b. For Windows: implement the AES-256-GCM + DPAPI unwrapping. For Linux: use libsecret/peanuts fallback + AES-128-CBC.

If you implement this, include the decrypted values in your output and note `(decrypted)` next to each.

### B2 — Playwright cookie and storage extraction (25 pts)

Write a script `playwright_storage.py` using Playwright (`playwright.sync_api`) that:

1. Launches a persistent Chromium context pointed at `/tmp/hw11-profile` (not your real profile — a fresh temp one).
2. Navigates to `https://httpbin.org/cookies/set?hw11_test=hello_world` (this URL sets a cookie).
3. Navigates to `https://httpbin.org/cookies` (this URL shows your cookies).
4. Extracts all cookies via `browser.cookies()` — not the database. Print them in the same format as B1.
5. Sets a localStorage item: `page.evaluate("localStorage.setItem('hw11_key', 'hw11_value')")`.
6. Reads it back: `page.evaluate("localStorage.getItem('hw11_key')")`. Print the result.
7. Creates a simple IndexedDB entry:
   ```python
   page.evaluate("""() => new Promise((resolve) => {
       const req = indexedDB.open('hw11db', 1);
       req.onupgradeneeded = () => req.result.createObjectStore('store', {keyPath:'id'});
       req.onsuccess = () => {
           const tx = req.result.transaction('store', 'readwrite');
           tx.objectStore('store').put({id: 1, data: 'hw11_idb_value'});
           tx.oncomplete = resolve;
       };
   })""")
   ```
8. Reads it back from IndexedDB and prints it.
9. Closes the browser.

Run the script and include its full output as `playwright-output.txt`.

In `storage-report.md`, answer:

- **B2-Q1**: Why does the Playwright approach return plaintext cookie values even though the on-disk file stores them encrypted?
- **B2-Q2**: The raw SQLite approach requires Chrome to be closed. Playwright does not. Explain why (be specific — what is the mechanism that allows Playwright to read a running browser's cookies?).
- **B2-Q3**: For a scientific web application that stores experimental data in IndexedDB, which approach (raw file vs. CDP) would you recommend for a data-export feature? Justify.

---

## Deliverables

Submit a zip `HW11-<unityID>.zip` containing:

```
HW11-<unityID>/
├── hw11-netlog.json
├── netlog-report.md
├── read_cookies.py
├── google-cookies.txt
├── other-cookies.txt
├── playwright_storage.py
├── playwright-output.txt
├── storage-report.md
└── AI-USAGE.md
```

## Why this is AI-resistant

- Netlog answers require timestamps from your specific capture. Every capture is unique.
- `google-cookies.txt` reflects your Chrome profile's actual cookies at the moment you run it — unique session IDs, unique expiry times.
- `playwright-output.txt` shows a fresh profile's cookie state after specific navigations — verifiable.
- The decryption bonus requires platform-specific working code.

## Grading rubric

| Component | Points |
|---|---|
| **Part A** | |
| A1 — DNS analysis | 8 |
| A2 — Connection timing | 8 |
| A3 — Protocol distribution | 8 |
| A4 — Cache behavior | 8 |
| A5 — Bottleneck identification | 8 |
| A6 — Optimization recommendations | 10 |
| **Part B** | |
| B1 — `read_cookies.py` correct and runs | 15 |
| B1 — Output files present and plausible | 5 |
| B1 — Timestamp decoding correct | 5 |
| B2 — `playwright_storage.py` correct and runs | 15 |
| B2 — `playwright-output.txt` present and correct | 5 |
| B2 — `storage-report.md` answers substantive | 5 |
| **Bonus** | |
| Decryption bonus | +5 |
| **Total** | **100 (+5)** |

## AI usage policy

AI may help with Python syntax, datetime arithmetic, and Playwright API calls. The Netlog analysis (Part A) requires reading your actual capture — AI cannot fabricate timestamps from a file it hasn't seen. The interpretation of your specific cookies (Part B1) is also yours. Cite AI usage in `AI-USAGE.md`.

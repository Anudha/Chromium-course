# Lecture 26 — Progressive Web Apps, Offline, and Field Science

| | |
|---|---|
| **Unit** | VI — The Web Platform for Science |
| **Week** | 13 |
| **Duration** | 1.5 hours |
| **Demo** | Field sample logging PWA — works offline, syncs to server when back online |

## Learning objectives

Students can:

1. Define a Progressive Web App and list what makes a web app "progressive."
2. Write a service worker that intercepts fetches and serves cached responses.
3. Store structured scientific data in IndexedDB for offline use.
4. Implement Background Sync to flush queued data when connectivity is restored.
5. Configure a Web App Manifest so the PWA can be installed to a home screen.
6. Identify scientific field scenarios where PWAs are the correct tool.

## Opening hook (5 min)

Scenario: You're a geochemist doing field sampling in Yosemite. No cell signal. Your tablet has a Chrome PWA for logging rock sample provenance (GPS coordinates, photos, hand-drawn sketches, field notes, XRF readings from a portable gun). You log 40 samples over three days without connectivity. When you drive back to Merced and get LTE, the PWA syncs all 40 records to your lab's server automatically in the background. You didn't have to do anything.

This is exactly what PWAs are built for. It's also what native apps were built for — but a PWA has one superpower a native app doesn't: you typed a URL to get it. No app store, no install prompt from an untrusted developer, no platform lock-in. Just a URL.

## What makes a Web App "Progressive" (10 min)

"Progressive Web App" is not a single browser API — it's a design philosophy backed by three standards:

1. **Service Worker** — a JavaScript worker that sits between the browser and the network, intercepting fetch requests. Enables offline use, background sync, push notifications.
2. **Web App Manifest** — a JSON file that describes the app: name, icons, colors, display mode. Enables "install to home screen" on Android/iOS/desktop.
3. **HTTPS** — required for service workers. Also required for all the device APIs from L25.

A "good" PWA additionally uses:
- **IndexedDB** for structured offline storage.
- **Cache API** for storing assets (HTML, CSS, JS, images) offline.
- **Background Sync** for deferring writes to a server until connectivity returns.
- **Push** for server-to-client notifications.

None of these are required; "progressive" means the app works on any browser and progressively enhances when capabilities are available.

## Service workers — the offline engine (20 min)

### What a service worker is

A service worker is a JavaScript file that runs in its own worker context (separate from the page's JS), registered by the page, and persisted between page loads. It acts as a **programmable proxy** between the browser and the network.

```
Browser tab         Service Worker      Network
───────────         ──────────────      ───────
fetch('/data')  →   intercepts!
                    ├── cache hit?  → return cached response (no network)
                    └── cache miss? → fetch from network, cache, return
```

A service worker cannot access the DOM. It can:
- Intercept and respond to `fetch` events.
- Open and use the Cache API (`caches.open(...)`).
- Receive and handle `push` events (push notifications).
- Register for `sync` events (Background Sync).
- Communicate with pages via `postMessage`.

### The lifecycle

```
Page calls: navigator.serviceWorker.register('/sw.js')
                    │
                    ▼
            SW: install event
            (download + cache assets)
                    │
                    ▼ (waits until all clients close — or skipWaiting)
            SW: activate event
            (delete old caches)
                    │
                    ▼
            SW: fetch events (intercepts all requests)
```

The install/activate sequence matters: a new service worker doesn't take control until all tabs using the old one are closed (or `self.skipWaiting()` + `clients.claim()` are called).

### A field science service worker

```javascript
// sw.js — service worker for field sample logger

const CACHE_NAME   = 'field-logger-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/app.js',
    '/style.css',
    '/offline.html',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
];

// --- INSTALL: pre-cache all static assets ---
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('SW: caching static assets');
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();  // activate immediately (dev convenience)
});

// --- ACTIVATE: delete old caches ---
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME)
                    .map(k => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

// --- FETCH: network-first for API calls, cache-first for assets ---
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // API calls: network-first, fall back to cached response
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    // Static assets: cache-first, fall back to network
    event.respondWith(cacheFirst(event.request));
});

async function networkFirst(request) {
    try {
        const response = await fetch(request.clone());
        // Cache successful API responses for offline fallback
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
        return response;
    } catch {
        const cached = await caches.match(request);
        return cached ?? new Response('{"error":"offline"}',
            { headers: { 'Content-Type': 'application/json' } });
    }
}

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
        return response;
    } catch {
        return caches.match('/offline.html');
    }
}

// --- BACKGROUND SYNC: flush queued samples when online ---
self.addEventListener('sync', event => {
    if (event.tag === 'sync-samples') {
        event.waitUntil(syncPendingSamples());
    }
});

async function syncPendingSamples() {
    // Open IndexedDB and get all unsent samples
    const db      = await openDB();
    const pending = await getUnsyncedSamples(db);

    for (const sample of pending) {
        try {
            const resp = await fetch('/api/samples', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(sample),
            });
            if (resp.ok) {
                await markSampleSynced(db, sample.id);
                console.log(`SW: synced sample ${sample.id}`);
            }
        } catch {
            // Still offline — will retry on next sync event
            break;
        }
    }
}
```

Walk through every listener:
- **`install`**: downloads and caches all static files. If this fails, the service worker won't activate.
- **`activate`**: deletes stale caches from old service worker versions.
- **`fetch`**: the interception point. Two strategies: network-first (API calls — always try fresh data, fall back to cache) and cache-first (assets — serve from cache immediately, update in background).
- **`sync`**: the Background Sync handler. Runs when connectivity is restored and the page has queued `sync-samples`. The browser guarantees this will eventually fire even if the page is closed.

## IndexedDB for field data (15 min)

The service worker above calls `openDB()`, `getUnsyncedSamples()`, and `markSampleSynced()`. These hit IndexedDB. Let's build the complete storage layer.

```javascript
// db.js — IndexedDB layer for field samples

const DB_NAME    = 'FieldLogger';
const DB_VERSION = 1;

export function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = ({ target: { result: db } }) => {
            // Object store for samples
            const store = db.createObjectStore('samples', {
                keyPath: 'id', autoIncrement: true
            });
            store.createIndex('synced', 'synced', { unique: false });
            store.createIndex('timestamp', 'timestamp', { unique: false });

            // Object store for offline measurement queue
            db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}

export function saveSample(db, sample) {
    return new Promise((resolve, reject) => {
        const tx    = db.transaction('samples', 'readwrite');
        const store = tx.objectStore('samples');

        const record = {
            ...sample,
            synced:    false,
            timestamp: Date.now(),
        };

        const req = store.add(record);
        req.onsuccess = () => resolve(req.result);  // returns new ID
        req.onerror   = () => reject(req.error);
    });
}

export function getUnsyncedSamples(db) {
    return new Promise((resolve, reject) => {
        const tx    = db.transaction('samples', 'readonly');
        const idx   = tx.objectStore('samples').index('synced');

        // IDBKeyRange.only(false) = all records where synced === false
        const req = idx.getAll(IDBKeyRange.only(false));
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}

export function markSampleSynced(db, id) {
    return new Promise((resolve, reject) => {
        const tx    = db.transaction('samples', 'readwrite');
        const store = tx.objectStore('samples');
        const req   = store.get(id);

        req.onsuccess = () => {
            const record   = req.result;
            record.synced  = true;
            const putReq   = store.put(record);
            putReq.onsuccess = resolve;
            putReq.onerror   = () => reject(putReq.error);
        };
    });
}
```

### Recording a field sample

```javascript
// In the page's JavaScript
import { openDB, saveSample } from './db.js';

const db = await openDB();

async function logSample(data) {
    // data from the UI: GPS coords, notes, XRF readings, etc.
    const sample = {
        latitude:    data.lat,
        longitude:   data.lon,
        altitude:    data.alt,
        notes:       data.notes,
        xrf:         data.xrfReadings,   // {Fe: 12.4, Si: 45.2, ...}
        photo_url:   data.photoDataURL,
        collector:   data.username,
    };

    const id = await saveSample(db, sample);
    console.log(`Saved sample ${id} locally`);

    // Try to sync immediately; if offline, queue for background sync
    if (navigator.onLine) {
        await pushToServer(sample, id);
    } else {
        // Register for Background Sync
        const sw = await navigator.serviceWorker.ready;
        await sw.sync.register('sync-samples');
        console.log('Offline: sample queued, will sync when online');
    }
}
```

### The Background Sync guarantee

When `sw.sync.register('sync-samples')` is called, the browser promises: "at some point in the future, when the device has connectivity, I will fire the `sync` event in your service worker with tag `sync-samples`." This fires even if:
- The tab is closed.
- The user navigates away.
- The browser is backgrounded (on desktop).

For field science, this is critical. The researcher doesn't need to remember to "sync." It happens.

## Web App Manifest (5 min)

The manifest makes the app installable — bookmarkable to the home screen or taskbar as a standalone app without browser chrome.

```json
{
    "name":              "Field Sample Logger",
    "short_name":        "FieldLog",
    "description":       "Log geochemical field samples offline",
    "start_url":         "/",
    "display":           "standalone",
    "background_color":  "#f0e8d0",
    "theme_color":       "#3d5a3e",
    "orientation":       "portrait",
    "icons": [
        { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
        { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
    ],
    "screenshots": [
        { "src": "/screenshots/main.png", "sizes": "390x844", "type": "image/png" }
    ],
    "categories": ["science", "productivity"],
    "protocol_handlers": [
        { "protocol": "web+fieldlog", "url": "/open?url=%s" }
    ]
}
```

With `"display": "standalone"`, the installed app has no browser address bar or toolbar. It looks native. On Android, tapping the icon goes directly into the full-screen app.

Link the manifest from HTML:
```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#3d5a3e">
```

Chrome's "Install" button (or "Add to Home Screen" on Android) appears automatically when:
- HTTPS (or localhost).
- Service worker registered.
- Manifest present with name, icons, `start_url`.

## Full stack — everything together (5 min)

Draw the complete stack:

```
Field researcher's tablet (offline in the field)
┌────────────────────────────────────────────────┐
│  Field Logger PWA (Chrome, standalone mode)    │
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │Web Serial│  │WebGPU    │  │ IndexedDB    │ │
│  │(XRF gun) │  │(analysis)│  │ (local store)│ │
│  └──────────┘  └──────────┘  └──────────────┘ │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │    Service Worker                       │   │
│  │    Intercepts fetches → serves cache    │   │
│  │    Background Sync → queues writes      │   │
│  └─────────────────────────────────────────┘   │
└────────────────────────────────────────────────┘
                   ↕  (when online)
┌────────────────────────────────────────────────┐
│  Lab server (REST API, PostgreSQL, R analysis) │
└────────────────────────────────────────────────┘
```

This stack:
- Reads XRF data from the instrument over Web Serial.
- Optionally runs a quick statistical analysis in WebAssembly.
- Stores everything in IndexedDB.
- Syncs to the server automatically when connectivity returns.
- Is installed as a native-feeling standalone app.
- Is a URL.

## A tiny code excerpt — Background Sync in Chromium (5 min)

Background Sync's implementation is in [`content/browser/background_sync/`](https://source.chromium.org/chromium/chromium/src/+/main:content/browser/background_sync/). The central class is `BackgroundSyncManager`. When `sw.sync.register('sync-samples')` is called, `BackgroundSyncManager::Register` stores the registration in a per-origin database and sets a wake-up timer. When connectivity is detected (via Chrome's network service's connectivity observer), `BackgroundSyncManager::FireReadyEvents` dispatches the `sync` event to the service worker.

The full SW registration → fire sequence is visible in [`background_sync_manager.cc`](https://source.chromium.org/chromium/chromium/src/+/main:content/browser/background_sync/background_sync_manager.cc). One of the more useful "here's the plumbing behind a web API" tracings in the whole course.

## Live demo (15 min)

### Demo 1 — Install and go offline

Pre-loaded: the field logger PWA served from `localhost:5000` with HTTPS (self-signed cert, trusted for demo). Open it in Chrome.

1. Show the "Install" button appearing in the address bar.
2. Click install → app opens in standalone mode.
3. Open DevTools → Application → Service Workers. Show it registered, status "activated and running."
4. Log a sample: fill out the form (fake GPS coords, notes). Watch it save to IndexedDB locally.
5. Open DevTools → Application → IndexedDB → show the record.
6. Simulate offline: DevTools → Network → "Offline." Reload the app. **It still works.** The service worker serves cached HTML/JS.
7. Log another sample offline. Show it queued.

### Demo 2 — Background Sync fires

Still in offline mode:

1. Show Background Sync entry: DevTools → Application → Background Sync. The registration is there.
2. Go back online (DevTools → Network → remove "Offline" throttle).
3. Observe: within seconds, the Background Sync fires. DevTools → Background Sync shows the event fired. The queued record was sent to the server (show the server log or a "✓ synced" indicator).

### Demo 3 — Push it: the science angle

Show the completed PWA on an Android phone (or in DevTools mobile emulation). The icon is on the "home screen." Opening it feels native. The NMR spectrometer from the next lab block could feed into this — Web Serial on the phone reads a Bluetooth-to-serial bridge, the data goes straight into IndexedDB, Background Sync sends it to the server.

## Final thought: the web is the scientific platform (5 min)

Close with this framing for the chem/ChemE students:

The barrier to writing scientific software is disappearing. You don't need to know C++ to write MD simulations — you need to know WGSL and JavaScript. You don't need a driver-installation headache to talk to your spectrometer — you need Web Serial and 60 lines of JS. You don't need a native mobile app to collect field data offline — you need a service worker.

These are all browser APIs, specified by W3C and WHATWG, implemented by Chromium and other browsers, backed by the same trust model we've studied all semester. They're not toys — they're the same APIs that power Google Docs offline, Figma, and VS Code on the web.

The scientific computing lab of 2030 may not have any native apps at all.

## Reading for next unit

Unit VI ends here. Unit VII is the final unit: contribution and ecosystem.

- chromium.org: [Contributing to Chromium](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/contributing.md)
- chromium.org: [Good first bugs label on crbug.com](https://bugs.chromium.org/p/chromium/issues/list?q=label%3AGoodFirstBug&can=2)
- chromium.org: [Blink launch process (Intent to Prototype, Ship)](https://www.chromium.org/blink/launching-features/)

## Instructor notes

- HW13 due end of Week 13 — both tracks (Device API and PWA) come from the last two lectures.
- The "offline" demo with DevTools is excellent. Students have never intentionally made a web app work without a network.
- Background Sync is the most "magic-seeming" feature. Demoing the sync event firing while the tab is in the background (or closed!) is worth extra setup time.
- For the chem/ChemE students: remind them that HW13 Track 1 (Device API) lets them build a real instrument interface if they have hardware. Track 2 (PWA) is more controlled but teaches all the offline concepts.

---

[← L25](./L25-device-apis.md) · [Unit VI README](./README.md) · **End of Unit VI** · Next: Unit VII coming soon

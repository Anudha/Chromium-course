# HW13 — Device API or PWA

**Assigned:** Week 13 · **Due:** End of Week 13 · **Weight:** ~2.3% of course grade

## Goal

Build a working end-to-end scientific web application using either (a) a device API (Web Serial, WebUSB, Web Bluetooth, or WebHID) or (b) Progressive Web App technologies (service worker, IndexedDB, Background Sync). Both tracks produce something that could be used in a real lab context.

**Pick one track.** If you have access to hardware (Arduino, a real instrument, a Bluetooth sensor), strongly consider Track 1 — it's more visceral. Track 2 is fully self-contained and doesn't require hardware.

---

## Track 1 — Device API: Instrument Interface

### Scenario

Build a browser-based interface for a real or simulated lab instrument. Your app should:

1. Connect to the instrument via Web Serial, WebUSB, Web Bluetooth, or WebHID.
2. Parse the instrument's data stream.
3. Display data in a live-updating visualization (graph, table, or rendered output).
4. Allow the user to log readings to local storage.
5. Export logged data as CSV.

### Hardware options

**Option A — Arduino/Pi Pico with Web Serial (most accessible)**

If you have an Arduino Uno, Mega, Nano, or a Raspberry Pi Pico, program it to simulate a sensor of your choice. The instructor's office has Arduinos to borrow.

Sensor simulations to consider (pre-written sketches available on the course site):

- **pH meter**: outputs `pH=6.234\r\n` at 1 Hz. Simple! Start here.
- **UV-Vis spectrometer**: (from L25) outputs 600 wavelength-absorbance pairs on demand.
- **Temperature/pressure logger**: uses a simulated DHT22 + BMP280 read loop.
- **Mass spectrometer fragment ion stream**: outputs ion m/z and intensity pairs, simulating a simplified TOF output.
- **Radiation counter (Geiger)**: outputs counts-per-second for a simulated radioactive decay with Poisson statistics.

**Option B — Real instrument (if you have one)**

If you have access to a real serial instrument in your research group — a pH meter, balance, spectrophotometer, potentiostat, power supply, or anything with an RS-232/USB-serial interface — build a real interface for it. Coordinate with the instructor early.

**Option C — Web Bluetooth with a BLE sensor**

If you have a BLE sensor (common options: Bluetooth thermometer, CO₂ sensor, some fitness trackers that expose GATT), build a GATT-reading interface. Bluetooth Heart Rate Profile (standardized, available on most fitness bands) is a good starting point.

**Option D — WebHID with a lab balance**

If your department has an analytical balance that enumerates as HID (common for Ohaus and some Mettler-Toledo models), build a balance reader. The instructor can help you find the HID report descriptor.

### Required features

1. **Connection UI**: a "Connect" button that triggers the appropriate device picker. Handles the case where no device is found (user cancels picker) gracefully.
2. **Live data display**: a real-time chart, table, or spectrum plot that updates as data arrives. Use `<canvas>`, SVG, or a charting library of your choice.
3. **Data logger**: a "Start logging" / "Stop logging" button pair that accumulates readings to an array (in JS memory — no IndexedDB required for Track 1).
4. **Export**: a "Download CSV" button that generates a CSV file and downloads it using `URL.createObjectURL`.
5. **Disconnect**: clean up the serial/USB/BT connection when the user closes or navigates away.

### Deliverables

Submit a zip `HW13-<unityID>-track1.zip` containing:

```
HW13-<unityID>-track1/
├── index.html
├── app.js           ← all instrument communication and UI logic
├── arduino_sketch.ino (if you used an Arduino; or equivalent)
├── report.md
├── demo.mp4 (or .webm or .gif)
└── AI-USAGE.md
```

The **demo video** (15–60 seconds) is required and is the primary AI-resistance mechanism:
- Show the connection picker appearing when you click "Connect."
- Show live data updating.
- Show logging start/stop.
- Show the CSV download.
- If using an Arduino, the physical device should be visible in frame, or the Arduino IDE serial monitor should be visible alongside the browser window.

In `report.md`:
- Which hardware/simulated instrument did you use?
- What is the data protocol (baud rate, framing, units)?
- What did the live visualization show? Include a screenshot.
- What would you add to make this production-ready for a real lab?

### Grading rubric

| Component | Points |
|---|---|
| Connection UI: picker, graceful cancel | 15 |
| Live data display updates correctly | 25 |
| Data logger: start/stop/accumulate | 20 |
| CSV export works | 10 |
| Clean disconnect | 5 |
| Demo video present and shows all features | 15 |
| `report.md` substantive | 10 |
| **Total** | **100** |

---

## Track 2 — PWA: Offline Field Logger

### Scenario

Build a complete Progressive Web App for field sample logging. Imagine a geochemist, environmental monitor, or field ecologist who needs to log structured observations without network connectivity.

Your app must work fully offline after the initial load.

### Required features

#### Feature 1 — Service worker with offline support (25 pts)

Write `sw.js` that:
- Caches all app assets (HTML, CSS, JS) on install.
- Serves cached assets on fetch when offline.
- Uses a network-first strategy for any `/api/` paths.
- Deletes stale caches on activate.

Verify: open the app, enable DevTools → Network → Offline, reload. The app should still work and show "offline mode" indicator.

#### Feature 2 — IndexedDB data layer (25 pts)

Build a complete data layer in `db.js`:
- `openDB()` — open/upgrade the database with a `samples` object store.
- `saveSample(db, data)` — store a record (returns a Promise of the new ID).
- `getAllSamples(db)` — returns all records, sorted by timestamp.
- `getSample(db, id)` — returns one record by ID.
- `deleteSample(db, id)` — delete one record.
- Samples must include at least: `id` (auto), `timestamp`, `latitude`, `longitude`, `notes`, `readings` (object), `synced` (boolean).

Test with DevTools → Application → IndexedDB — verify records appear there.

#### Feature 3 — Background Sync (20 pts)

When the user logs a sample while offline, register a Background Sync event. When connectivity returns, the service worker should:
- Fetch all unsynced samples from IndexedDB.
- POST each to `POST /api/samples` (mock endpoint — see below).
- Mark each as `synced = true` on success.

For the mock endpoint: use `https://httpbin.org/post` which echoes the POST body back as JSON — it's a real HTTPS endpoint that accepts anything. If your sync succeeds, you should see the sample data echoed back in the browser console.

#### Feature 4 — Web App Manifest + installability (10 pts)

Write `manifest.json` with:
- `name`, `short_name`, `description`.
- At least one icon (192×192 and 512×512 recommended). Generate icons from any tool.
- `display: "standalone"`.
- `start_url`, `background_color`, `theme_color`.

Verify: DevTools → Application → Manifest — no errors. The install button appears in the Chrome address bar.

#### Feature 5 — Data UI (20 pts)

The app must have a functional UI for:
- **Logging form**: latitude, longitude (auto-populate from `navigator.geolocation` if permitted), notes text area, and at least one numeric "reading" field (e.g., pH, temperature, mass).
- **Sample list**: shows all logged samples from IndexedDB, indicating which are synced (green ✓) and which are pending (orange ●).
- **Sample detail**: clicking a sample shows its full data.
- **Delete**: a delete button on each sample that removes it from IndexedDB and the UI.

### Deliverables

Submit a zip `HW13-<unityID>-track2.zip` containing:

```
HW13-<unityID>-track2/
├── index.html
├── app.js
├── sw.js
├── db.js
├── manifest.json
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── server.py       ← python3 server.py serves with COOP+COEP headers
├── report.md
├── demo.mp4 (or .webm or .gif)
└── AI-USAGE.md
```

The **demo video** (30–90 seconds) must show:
- Adding a sample while online.
- Enabling offline mode (DevTools).
- Adding another sample while offline — it appears locally.
- Disabling offline mode — Background Sync fires and marks the sample as synced.
- The install button appearing / the app installed as a standalone window.

In `report.md`:
- What field scenario does your app target? (Geochemist? Environmental scientist? Particle physics field survey?)
- What are the object store's indexes and why did you choose them?
- What does your service worker do differently for API calls vs. static assets?
- What would you add to make this production-ready?

### Grading rubric

| Component | Points |
|---|---|
| Feature 1: service worker + offline verified | 25 |
| Feature 2: complete IndexedDB layer | 25 |
| Feature 3: Background Sync fires + syncs to httpbin | 20 |
| Feature 4: manifest + install button | 10 |
| Feature 5: full UI with log/list/detail/delete | 20 |
| Demo video shows all features | included above |
| `report.md` substantive | included above |
| **Total** | **100** |

---

## AI usage policy for both tracks

AI may help with Web Serial/WebUSB/Bluetooth API syntax, IndexedDB callback patterns, WGSL shader debugging (Track 1 if applicable), and CSS layout. The architecture decisions — what to cache, how to structure the data model, what the instrument protocol looks like, what the science means — must be yours. Cite AI usage in `AI-USAGE.md`.

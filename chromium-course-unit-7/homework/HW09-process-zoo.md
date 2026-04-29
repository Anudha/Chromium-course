# HW9 — Process Zoo

**Assigned:** Week 9 · **Due:** End of Week 9 · **Weight:** ~2.3% of course grade

## Goal

Systematically catalog every Chromium process type visible on a real browser session, explain why each exists, verify sandbox status, and induce an OOPIF by loading a cross-site embedded frame.

## Background

In L17 we enumerated Chromium's process types and the navigation lifecycle that moves documents between them. This assignment asks you to observe them directly, rather than take the lecture's word for it.

## Deliverables

Submit a folder `HW9-<unityID>/` containing:

1. `screenshots/` — at least 4 annotated screenshots (described below)
2. `process-catalog.md` — the systematic catalog (described below)
3. `oopif.md` — the OOPIF exercise (described below)
4. `AI-USAGE.md`

## Part 1 — Open a controlled set of tabs

Before taking any screenshots, open **exactly these** tabs (in this order):

1. `https://google.com` (make a search, e.g., "chromium site isolation")
2. `https://youtube.com` (open any video)
3. `https://en.wikipedia.org/wiki/Chromium_(web_browser)`
4. `chrome://settings`
5. `chrome://newtab`
6. A local file: create `test.html` on your desktop containing `<h1>CSC591 Test</h1>` and open it via `File → Open`.

## Part 2 — Process catalog (`process-catalog.md`)

Open Chrome Task Manager (Shift+Esc) and `chrome://process-internals` simultaneously.

For **every process visible in Task Manager**, create a table entry in `process-catalog.md`:

| PID | Type | Name (as shown in Task Manager) | Memory (MB) | CPU % | Associated tab or purpose | Sandboxed? (from `chrome://sandbox`) | Why it exists |
|---|---|---|---|---|---|---|---|
| ... | renderer | Tab: google.com | 120 | 0.2 | google.com main frame | Yes | Runs Blink+V8 for google.com |
| ... | | | | | | | |

Minimum: every process must have a "Why it exists" entry that goes beyond "it's a renderer." Connect to what you know from L17:
- Which SiteInstance is it serving?
- Why isn't it sharing with another renderer?
- If it's not a renderer, what subsystem does it run?

Include a screenshot of Task Manager and `chrome://process-internals` side by side (or in two screenshots), taken at the same moment.

## Part 3 — Sandbox verification

Open `chrome://sandbox`. Screenshot it.

For each process type (renderer, GPU, network), state whether it is sandboxed and at what level. If any process shows "degraded" or "unsandboxed" status, explain why (some Linux configurations, some Chromium builds, etc.).

## Part 4 — Induce an OOPIF (`oopif.md`)

Create a local HTML file `oopif-demo.html`:

```html
<!DOCTYPE html>
<html>
<head><title>OOPIF Demo</title></head>
<body>
<h1>CSC 591 OOPIF Demo</h1>
<!-- embed a cross-site frame from a real site -->
<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"
        width="560" height="315"
        frameborder="0" allowfullscreen>
</iframe>
</body>
</html>
```

Open `oopif-demo.html` in Chrome (via `File → Open`).

Open `chrome://process-internals`. Screenshot the process list showing:
- The local file's main frame in one process.
- The YouTube iframe in a **different** process (a different PID).

In `oopif.md`, answer:
1. What are the PIDs of the two processes you observed?
2. What sites are each process locked to?
3. Why is the YouTube frame in a different process from the outer page?
4. If you opened a second tab with the same `oopif-demo.html`, would the YouTube iframe in the second tab use the same renderer process as in the first tab? Why or why not?
5. *Bonus*: modify `oopif-demo.html` to embed a **same-site** iframe (e.g., another file on `localhost` if you spin up a local server). Do they share a process? What does this tell you about the site boundary?

## Part 5 — Force a process crash and observe

In one of your tabs:
- Open the DevTools console.
- Run: `chrome.benchmarking.terminateRenderer();` (if available in a test build), or navigate to `chrome://crash` in that tab.

Screenshot the "Aw, snap!" page. Then screenshot Task Manager showing that tab's renderer process has disappeared while all other tabs remain unaffected.

In `process-catalog.md`, add a final section: "After crash," listing remaining processes and confirming which tab's process disappeared.

## Submission

Zip the folder as `HW9-<unityID>.zip`.

## Why this is AI-resistant

- PIDs are ephemeral and unique to your session.
- Memory usage, CPU usage, and sandbox status values are specific to your machine, browser version, and session.
- The OOPIF screenshot must show two distinct PIDs for the outer page and YouTube iframe — fabricating this is obvious.

## Grading rubric

| Component | Points |
|---|---|
| Process catalog: all processes identified | 20 |
| "Why it exists" explanations are substantive | 20 |
| Sandbox screenshot and analysis | 10 |
| OOPIF: correct two-process screenshot | 15 |
| OOPIF: questions answered correctly | 20 |
| Crash demo: screenshot + survivor analysis | 10 |
| Screenshots are clear and annotated | 5 |
| **Total** | **100** |

## AI usage policy

You may use AI to explain what a process type is or what "site" means in context. The observations (PIDs, memory figures, screenshots) must be from your own session. Cite in `AI-USAGE.md`.

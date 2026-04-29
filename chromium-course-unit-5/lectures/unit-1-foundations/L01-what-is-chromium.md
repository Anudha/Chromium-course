# Lecture 1 — What Is Chromium?

**A Tour of the Largest Open-Source Codebase You Use Every Day**

| | |
|---|---|
| **Unit** | I — Foundations |
| **Week** | 1 |
| **Duration** | 1.5 hours |
| **Demo** | Tour of `chrome://` internal pages |

## Learning objectives

Students can:

1. Distinguish Chromium from Chrome.
2. Name at least five downstream products built on Chromium.
3. Describe the scale and scope of the project in concrete terms.
4. Articulate why Chromium matters beyond "it's a browser."

## Opening hook (5 min)

Ask the class: *"Raise your hand if you used Chromium today."* Count the hands. Then: *"Keep your hand up if you used Google Chrome, Microsoft Edge, Brave, Opera, Arc, Vivaldi, Samsung Internet, or any Electron app — VS Code, Slack, Discord, Notion, Figma's desktop app, Spotify, Zoom's desktop client, 1Password, Postman, Obsidian."* By the end essentially every hand is up. Conclude: *"You all used Chromium today. Probably several times. Most of you never chose to."*

This is the frame for the course: Chromium is infrastructure, the way TCP/IP is infrastructure. Understanding it is understanding a large piece of how computing actually works in 2026.

## What exactly is "Chromium"? (10 min)

Draw on the board, left to right:

```
WebKit (Apple/KDE, 2001) ──fork──▶ Chromium (Google, 2008) ──┬──▶ Google Chrome
                                                              ├──▶ Microsoft Edge (2020+)
                                                              ├──▶ Brave, Opera, Vivaldi, Arc
                                                              ├──▶ Samsung Internet
                                                              └──▶ Electron, CEF, WebView
```

Key points:

- **Chromium is an open-source project** hosted at [chromium.org](https://www.chromium.org). BSD-licensed, with LGPL and MPL components pulled in via `third_party/`.
- **Chrome is Google's proprietary product built on Chromium**, with closed-source additions: auto-update, Widevine DRM, the Chrome branding, usage metrics, some sync components, Google-specific services. Building `chromium/src` yourself produces Chromium, not Chrome.
- **The fork from WebKit happened in 2013.** Google stopped taking WebKit patches and created Blink. Apple kept WebKit for Safari. So the rendering engine is *Blink*, which is a descendant of WebKit, which is a descendant of KHTML from KDE.
- **V8 is Google's JavaScript engine**, developed for Chromium starting in 2008, and now used by Node.js, Deno, Cloudflare Workers, and many others.

Write on the board: **"Chromium = Blink + V8 + the content layer + the Chrome embedder + third-party dependencies."** We'll unpack every one of those pieces over the semester.

## Scale — numbers that wake students up (10 min)

Students can verify all figures themselves as part of HW1.

- **~35+ million lines of code** in `chromium/src`, not counting third_party dependencies. Counting them pushes past 40M.
- **~2,000 commits per week** land in the main branch. Roughly 200 per day, weekdays.
- **~1,500+ active committers** across Google and external contributors (Microsoft, Intel, Igalia, Samsung, Opera, individual open-source contributors, and increasingly downstream fork maintainers).
- **A full build is ~100 GB on disk** (source + build outputs + debug symbols). A clean build on a decent laptop takes 3–6 hours.
- **Four-week release cadence** for Chrome stable since 2021. Canary, Dev, Beta, and Stable channels run in parallel.
- **Runs on Windows, macOS, Linux, ChromeOS, Android, iOS, Fuchsia.** iOS is special — Apple requires WebKit there, so iOS Chrome is a thin shell. That's changing following 2024 EU DMA rulings; we touch on this in Week 14.

Pause and let the numbers land. Ask: *"If you were put in charge of this codebase tomorrow, what would scare you most?"* (Answers usually: merge conflicts, review throughput, test flakiness, security, onboarding. All are real problems Chromium has solved or fought — we'll see how.)

## Why Chromium matters — four framings (15 min)

Pick the ones that resonate with your class mix. All four are worth hitting briefly.

### 1. Chromium is de facto web infrastructure

When Chromium ships a feature, it becomes part of the web platform for roughly 70% of users immediately. When Chromium *doesn't* ship a feature, it effectively isn't part of the web platform. This gives the Chromium team enormous soft power over web standards. We'll see this tension in Week 14 (Blink launch process, standards bodies).

### 2. Chromium is an operating system pretending to be an application

It has:

- A process scheduler (the browser process spawns and supervises renderer, GPU, network, utility processes).
- An IPC layer (Mojo).
- A permissions and sandbox system per OS.
- Its own graphics stack (Skia, the compositor, ANGLE, Dawn).
- Its own networking stack (`//net`).
- Its own storage layer.
- Its own UI toolkit on some platforms (Views).

This framing will matter when we get to process model (Week 9) and security (Week 10).

### 3. Chromium is a case study in large-scale software engineering

How do 1,500 engineers across many companies work on one binary without the whole thing catching fire? Code review, OWNERS, try bots, fuzzing, Finch, gradual rollout. For CS students: this is the most important thing you'll see all semester.

### 4. Chromium is increasingly the compute platform for science

For chem/ChemE students specifically: things that 15 years ago required specialized native apps — instrument control, molecular visualization, data analysis — are migrating into browsers. WebGL shipped in 2011, WebAssembly in 2017, WebGPU in 2023. Web Serial and WebUSB arrived over that span. A modern chemist's lab notebook is increasingly a PWA. Weeks 12–13 are devoted to this.

## Live demo — `chrome://internals` (15 min)

Open a Chrome window on the projector. Type `chrome://chrome-urls` and hit enter. Scroll through the list slowly — there are roughly 80 internal pages. Promise the class they'll see most of these by the end of the semester.

Then visit, in order, narrating each:

| URL | What to show |
|---|---|
| `chrome://version` | Chrome version, revision hash (clickable, goes to chromium.googlesource.com), OS, command-line flags, profile path, variations (field trials). Point out the V8 version and the user agent. |
| `chrome://credits` | Every third-party library Chromium links against. Scroll. Keep scrolling. "Chromium has 3,000+ dependencies." |
| `chrome://flags` | Experimental features. Show one benign one (e.g., "Enable experimental web platform features"). Explain the trust model. |
| `chrome://components` | Independently updatable pieces (Widevine, crl-set, etc.). Chrome updates more than just the browser binary. |
| `chrome://process-internals` | Preview of Week 9. Every site-instance, every frame, every process. |
| `chrome://tracing` | Just show the UI. We'll use this in earnest in Week 6 and Week 11. |
| `chrome://about` | Lists everything. |

## Discussion prompts (5–10 min if time)

1. Microsoft rewrote Edge on top of Chromium in 2020. What did they gain? What did they give up? Would you have made the same call?
2. Apple requires WebKit on iOS. Is that good or bad for the web?
3. Google pays for most Chromium development. Does that create a conflict of interest with the web as an open platform?

## Homework reminder

HW1 (Browser Forensics) assigned, due next Thursday.

## Reading for next lecture

- chromium.org: [Chromium Projects landing page](https://www.chromium.org/chromium-projects/)
- chromium.org: [Multi-process architecture design doc](https://www.chromium.org/developers/design-documents/multi-process-architecture/) (preview; covered in depth in Week 9)

## Instructor notes

- With a lot of non-CS students, spend more time on framings 2 and 4.
- With CS-heavy audiences, lean into framing 3.
- The `chrome://` tour is unexpectedly beloved. Don't rush it.

---

[← Unit I README](./README.md) · [Next: L2 — Browser as OS →](./L02-browser-as-os.md)

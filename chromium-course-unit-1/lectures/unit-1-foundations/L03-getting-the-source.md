# Lecture 3 — Getting the Source

**depot_tools, gclient, and the 100 GB Problem**

| | |
|---|---|
| **Unit** | I — Foundations |
| **Week** | 2 |
| **Duration** | 1.5 hours |
| **Demo** | `fetch chromium` and DEPS tour |

## Learning objectives

Students can:

1. Explain why `git clone` is insufficient for Chromium.
2. Use `depot_tools` commands (`fetch`, `gclient sync`, `gn`, `git cl`).
3. Describe what a `DEPS` file does.
4. Set up a working checkout on their own machine or a lab machine.

## Opening hook (5 min)

Put this on the projector:

```bash
git clone https://chromium.googlesource.com/chromium/src.git
```

Ask: *"What's wrong with this?"*

Let students guess. Reveal: *nothing* is wrong, in that it works — it downloads roughly 20 GB of the main source tree. But it's **insufficient**. You won't be able to build. You won't have V8. You won't have Skia, ANGLE, Dawn, ICU, BoringSSL, or any of the ~300 third-party dependencies. You won't have the build tools.

The command you actually want is:

```bash
fetch chromium
```

A `depot_tools` command. This lecture is what `depot_tools` does and why Chromium needs it.

## Why Chromium doesn't fit in one git repo (10 min)

Chromium's source is organized as **one main repository (`chromium/src`) plus hundreds of nested dependencies**, each in its own git repository, each pinned to a specific commit. The list lives in a file called `DEPS` at the root of `chromium/src`.

Show the file. Pull up the [DEPS file on Code Search](https://source.chromium.org/chromium/chromium/src/+/main:DEPS) on the projector. Scroll. Thousands of lines. Each entry looks like:

```python
'src/third_party/skia': {
  'url': 'https://skia.googlesource.com/skia.git@<commit-hash>',
  'condition': 'checkout_skia',
},
```

Why this structure?

- **Each dependency has its own upstream.** Skia, V8, ANGLE, Dawn, WebRTC — all have their own repos, issue trackers, release cycles. Chromium pulls in specific versions.
- **Pinning to exact commits gives reproducibility.** Checking out Chromium at commit X gives the exact Skia/V8/etc. revisions Chromium at X was built and tested against.
- **Atomic updates are impossible across repos anyway.** When the V8 team makes a breaking API change, the Chromium DEPS file is updated to point at the new V8, and any necessary adapter changes land in `chromium/src`. This is called a "V8 roll" and happens multiple times per day automatically. Same for Skia, ANGLE, etc.

Contrast with a true monorepo (Google-internal, Facebook-internal): Chromium-external is nearly but not quite a monorepo. It behaves like one thanks to `gclient`, but lives in many git repos.

## depot_tools: what's in the bag (15 min)

`depot_tools` is a small Python-ish toolkit distributed as a separate git repo. It contains:

| Command | What it does |
|---|---|
| `fetch` | One-shot bootstrapper. `fetch chromium` creates the working directory, clones `src`, runs `gclient sync`. |
| `gclient` | The meta-repo manager. Reads `DEPS`, checks out all dependencies at pinned commits, runs post-sync hooks. |
| `gn` | Build configuration tool (next lecture). |
| `ninja` / `autoninja` | Build executor (next lecture). |
| `git cl` | Gerrit code-review tool. Uploads CLs, syncs, rebases. Used in Week 14. |
| `git map`, `git rebase-update`, `git new-branch` | Quality-of-life wrappers over git that expect the Chromium workflow. |
| `goma` / `siso` / `reclient` | Distributed build clients. External contributors mostly use local builds. |

Write on the board: **"depot_tools is 'git, but with the muscle memory of the Chromium team baked in.'"**

Installation walkthrough — this is what HW2 is about:

```bash
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
export PATH="$PATH:/path/to/depot_tools"
# On Windows: prepend not append, and install the Google-provided toolchain via env var
```

Then:

```bash
mkdir ~/chromium && cd ~/chromium
fetch --nohooks chromium
cd src
./build/install-build-deps.sh      # Linux only, installs apt packages
gclient runhooks
```

Depending on network and disk speed, `fetch` alone takes 1–3 hours and uses 30–40 GB. `runhooks` adds another 20 GB of toolchains and prebuilts. First build will push total to ~100 GB.

## DEPS files, deeper (10 min)

Open `//DEPS` in Code Search again. Show:

- **`vars`** section at the top, defining variables used later.
- **`deps`** section — the pinned dependencies.
- **`hooks`** section — post-sync actions. Downloads prebuilt clang, sysroots, Node, etc. via Google Cloud Storage. Chromium does **not** use the system compiler by default; it uses a specific pinned clang.
- **`recursedeps`** — dependencies that themselves have `DEPS` files (e.g., `v8`), which `gclient` will also process.

Key concept: **rolls**. A "roll" is a CL that updates a DEPS entry to a newer commit. There are autorollers (bots) that roll Skia, V8, ANGLE, etc. constantly, run the CQ, and land them. When something breaks, humans step in.

If you poke at recent commits on [source.chromium.org](https://source.chromium.org/), maybe 20–30% are autoroller CLs. The browser you run tomorrow has a different V8 than the one you run today, even at the same Chrome version, if you're on Canary.

## The 100 GB problem — and what to do about it (10 min)

Realistic numbers for students to plan around:

| What | Disk | Time (first time) |
|---|---|---|
| `fetch chromium` (source + git history) | ~30–40 GB | 30 min – 2 hr |
| `gclient runhooks` (toolchains, prebuilts) | +15–20 GB | 15–30 min |
| First debug build (`is_debug=true`) | +40–60 GB | 3–6 hours on laptop |
| Release build (`is_debug=false is_component_build=true`) | +20–30 GB | 1–3 hours |

Strategies for this class:

1. **Lab machines.** The department has four workstations with fast SSDs dedicated to this course. Reserve slots via the course site. A full build is already done on each; students pull fresh and do incremental builds.
2. **Component build.** `is_component_build=true` makes targets into shared libraries. Incremental link times drop from minutes to seconds. Debug builds stay huge but are tractable for iterative work.
3. **V8 standalone.** For Weeks 7–8 HW, students build just V8 (~5 GB, 30 min). Covered in Lecture 13.
4. **`content_shell` target.** For Blink-only work, build `content_shell` instead of `chrome`. Much smaller, faster.
5. **No-op Blink edits.** Because of Chromium's careful header discipline, editing a `.cc` file in Blink and rebuilding only re-links the relevant shared library in a component build. Often <30 seconds.

Tell students: **HW2 is "do the big build once, take a screenshot." After that, we minimize rebuilds.**

## Live demo (15 min)

Ideally: a pre-prepared Chromium checkout on your instructor machine.

1. `cd ~/chromium/src` — show the tree. `ls` the top level: `base/`, `build/`, `chrome/`, `components/`, `content/`, `net/`, `services/`, `third_party/`, `tools/`, `ui/`, `v8/` (via DEPS), plus `DEPS`, `OWNERS`, `LICENSE`.
2. `cat DEPS | head -50` — skim.
3. `gclient sync --no-history` — watch it work. (If you don't want to wait, prepare a cached demo.)
4. Make a trivial edit: add `"HELLO 591"` to a `LOG(INFO)` in `third_party/blink/renderer/core/frame/local_frame.cc`. Don't rebuild yet — we do that next lecture. Stage the edit and show `git diff`.
5. Show `git cl upload -d` (dry-run). It would upload to Gerrit. Don't actually upload.

## Discussion / troubleshooting time (5 min)

Common issues students will hit with HW2:

- **Windows Defender scanning the tree during build** → exclude the checkout directory from antivirus.
- **macOS**: need Xcode installed and agreed-to-license.
- **Linux**: need `install-build-deps.sh` to run successfully; on non-Ubuntu/Debian there's pain. Arch/Fedora users should use the lab machines for the first build.
- **Corporate proxies / campus Wi-Fi**: `gclient sync` over university VPN sometimes times out. Use wired if possible.

## Reading for next lecture

- [GN Reference](https://gn.googlesource.com/gn/+/main/docs/reference.md)
- [GN Quick start](https://gn.googlesource.com/gn/+/main/docs/quick_start.md)
- [Ninja manual](https://ninja-build.org/manual.html)

## Instructor notes

- HW2 is assigned this lecture. Encourage students to start the fetch *tonight*, not the night before it's due.
- Lab machine sign-up sheet goes up on the course site.
- If you have students on Windows, have a dedicated TA office hour for build-deps. Windows is historically the most painful of the three.

---

[← L2](./L02-browser-as-os.md) · [Unit I README](./README.md) · [Next: L4 — GN, Ninja, Build →](./L04-gn-ninja-build.md)

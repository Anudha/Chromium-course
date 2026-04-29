# HW2 — The Build

**Assigned:** Week 2 · **Due:** End of Week 2 · **Weight:** ~2.3% of course grade

> **Start this on day 1.** A full Chromium build takes 3–6 hours on a laptop, and the initial checkout takes 1–3 hours. Do not start this on Wednesday night.

## Goal

Complete a full Chromium build from source on your own machine or a lab machine. This is the single highest-effort assignment in the course, and it is a prerequisite for almost everything that follows.

## Requirements

- At least **100 GB of free disk space** on a fast SSD (mechanical disk will make the build miserable).
- At least **16 GB of RAM** recommended; 8 GB works but is slow.
- A multi-core CPU — more cores directly speeds the build.
- On Windows: Visual Studio + Windows SDK per the official instructions.
- On macOS: Xcode + agreed-to license.
- On Linux: Ubuntu 22.04+ or Debian recommended; `install-build-deps.sh` works there.

If you don't have this at home: **reserve a lab workstation** via the course site.

## Instructions

### Step 1 — Install depot_tools

Follow the official instructions in the [Chromium source tree docs](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/) for your platform.

### Step 2 — Fetch the source

```bash
mkdir ~/chromium && cd ~/chromium
fetch chromium
```

This takes 1–3 hours.

### Step 3 — Install build dependencies

Linux only:

```bash
cd src
./build/install-build-deps.sh
```

### Step 4 — Configure the build

```bash
gn args out/Default
```

In the editor that opens, paste:

```
is_debug = true
is_component_build = true
symbol_level = 1
enable_nacl = false
```

Save and close.

### Step 5 — Build

```bash
autoninja -C out/Default chrome
```

Take a coffee. Take a nap. This is a 3–6 hour operation on a laptop.

### Step 6 — Run

```bash
out/Default/chrome
```

A window opens. Congratulations — you built Chromium.

## Deliverables

Submit a PDF or markdown file containing:

### 1. A screenshot of your custom-built Chromium

The window title bar should be visible, and you should have navigated to a page whose `<title>` is your unityID. (Create a local file: `<html><title>YOUR-UNITYID</title><body>hello</body></html>` and open it.)

### 2. Total wall-clock build time

Report how long the build took. Include your hardware spec (CPU, RAM, disk type).

### 3. Output of `autoninja -C out/Default chrome -d explain` for a trivial edit

After the build succeeds:

```bash
# Make a trivial change to force one file to recompile
touch base/logging.cc
autoninja -C out/Default chrome -d explain 2>&1 | head -50 > explain.txt
```

Include `explain.txt` in your submission. This shows Ninja correctly identifying the changed file and reasoning about what needs to rebuild.

### 4. A brief reflection (1 paragraph)

What surprised you about the build? What was the hardest part? If you used a lab machine, what would have stopped you from doing this on your personal machine?

## Submission

Submit as a zip file `HW2-<unityID>.zip` containing:

- `report.pdf` or `report.md`
- `screenshot.png`
- `explain.txt`
- `AI-USAGE.md`

## Why this is AI-resistant

AI cannot fabricate a successful build. The `-d explain` output is specific to your filesystem state. The screenshot shows your unityID in a window built from your source checkout.

## Grading rubric

| Component | Points |
|---|---|
| Successful build (screenshot proves it) | 60 |
| Build time + hardware reported | 10 |
| `-d explain` output captured | 20 |
| Reflection | 10 |
| **Total** | **100** |

## AI usage policy

You may use AI to debug build errors — that's genuinely useful here. Cite which errors you resolved with AI help in `AI-USAGE.md`.

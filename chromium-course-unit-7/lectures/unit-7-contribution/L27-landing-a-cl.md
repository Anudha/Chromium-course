# Lecture 27 — Landing a Real CL: The Ladder of Contribution

| | |
|---|---|
| **Unit** | VII — Contribution & Ecosystem |
| **Week** | 14 |
| **Duration** | 1.5 hours |
| **Demo** | Live walk of a crbug → CL lifecycle; HAR file dataset creation workflow |

## Learning objectives

Students can:

1. Navigate crbug.com to find bugs suitable for a first contribution.
2. Execute the full CL lifecycle: branch → edit → upload → iterate → land.
3. Describe the "ladder of contribution" from lowest to highest effort and impact.
4. Engage meaningfully with W3C, WHATWG, WICG, TC39, and related communities.
5. Create useful non-code contributions: HAR file datasets, WPT tests, DevTools extensions, documentation.
6. Identify the right community for a given type of contribution.

## Opening hook (5 min)

Ask the class: *"By the end of this course, most of you have spent 50+ hours thinking about Chromium. You know more about its internal architecture than 99.9% of the web developers who use Chrome every day. What do you do with that knowledge?"*

Pause. Then: *"The web platform is maintained by people — many of whom were once exactly where you are right now. They didn't arrive knowing everything. They arrived curious, found a bug, fixed a typo, filed a report, wrote a test. And they kept going."*

This lecture is the map from "student who knows Chromium" to "contributor to the web platform."

---

## The Ladder of Contribution (full walkthrough — 40 min)

The ladder has nine rungs. Each rung is genuinely valuable; none is a prerequisite for the next one. Students pick their entry point based on time, interest, and skills.

Draw the ladder vertically on the board. Leave it up all lecture. Add rungs as you reach them.

---

### Rung 1 — File a good bug report (Effort: 20 min, Impact: real)

**Where**: [crbug.com/new](https://crbug.com/new) (now routing through Google Issue Tracker / Buganizer public tracker).

A good Chromium bug report:
- Has a **one-sentence summary** that would make sense to someone who didn't see the bug.
- Has **minimal reproduction steps** — the fewest clicks to trigger the bug.
- Has **actual vs. expected behavior**.
- Has a **screenshot or screen recording** for visual bugs.
- Has the **Chrome version** (`chrome://version`) and OS.

Bad: "YouTube is broken."
Good: "Video playback stutters on YouTube when PiP is enabled while using a screen reader, reproducible in Chrome 124 on macOS 14."

The second bug will get triaged and fixed. The first will sit untouched.

**For this class specifically**: every student in this room has seen the insides of Chromium. If you find a rendering artifact during HW6 or an unexpected DevTools behavior during HW11, that's a real bug. File it. Include a netlog or trace if relevant. Senior engineers on the Chrome team read every triaged bug.

**Where bugs go next**: triage → component assignment (e.g., `Blink>Layout`, `V8`, `Internals>Network`) → priority → fix or won't-fix. Stars on a bug increase its visibility. If you file a bug and five classmates star it, it gets bumped.

---

### Rung 2 — Star, comment, and add repros to existing bugs (Effort: 5–30 min each, Impact: cumulative)

**Where**: crbug.com search filters. Try:
- `label:GoodFirstBug is:open` for newcomer-friendly bugs.
- `component:Blink>Layout status:Untriaged` for recently-filed layout bugs.
- Search for behaviors you've observed during this course.

If you can **reproduce a bug on your machine**, say so in a comment with your Chrome version. "Reproducible on Chrome 124, macOS 14, Intel GPU" is genuinely useful data. It confirms the bug isn't machine-specific and narrows the search.

If you can **add a minimal repro** — a 10-line HTML file that triggers the bug — you've done 20% of a developer's debugging work for them. Attach it to the bug.

Starring a bug costs one click and signals demand. The Chrome team does look at star counts when prioritizing.

---

### Rung 3 — Contribute to web-platform-tests (WPT) (Effort: 1–8 hours, Impact: high)

**Where**: [github.com/web-platform-tests/wpt](https://github.com/web-platform-tests/wpt) — the largest cross-browser test suite in the world, testing the HTML, CSS, WebAPI, and JS specifications. Every browser team runs it. Tests here are primary-source quality — they are the spec made executable.

**Why this rung matters**: every missing WPT test is a potential interoperability gap. A feature that Chrome implements one way and Firefox another way with no test to catch it will eventually cause a developer somewhere to lose a day debugging.

**How to contribute**:
1. Find a feature you used in this course that has incomplete test coverage. Go to [wpt.fyi](https://wpt.fyi) and search for the feature.
2. Write tests using the [testharness.js](https://web-platform-tests.org/writing-tests/testharness.html) framework:

```html
<!DOCTYPE html>
<!-- /webgpu/compute-basic.html -->
<title>WebGPU: basic compute shader runs without errors</title>
<script src="/resources/testharness.js"></script>
<script src="/resources/testharnessreport.js"></script>
<script>
promise_test(async t => {
    const adapter = await navigator.gpu.requestAdapter();
    const device  = await adapter.requestDevice();

    const shader = device.createShaderModule({ code: `
        @compute @workgroup_size(1)
        fn main() {}
    ` });

    const pipeline = await device.createComputePipelineAsync({
        layout: 'auto',
        compute: { module: shader, entryPoint: 'main' }
    });

    assert_true(pipeline instanceof GPUComputePipeline,
        'pipeline should be a GPUComputePipeline');
}, 'createComputePipeline for trivial compute shader succeeds');
</script>
```

3. Open a PR against the `wpt` repo. Reviewers are active and helpful.

**For chemists and ChemE students**: write WPT tests for the device APIs you used in L25. Web Serial, WebUSB, and Web Bluetooth have known coverage gaps. Tests using the virtual device infrastructure (no physical hardware needed) are especially welcome.

---

### Rung 4 — Contribute to Chromium documentation (Effort: 30 min–2 hours, Impact: multiplier)

**Where**: the `//docs/` directory in `chromium/src`, or the DevTools documentation at [developer.chrome.com](https://developer.chrome.com/docs/).

Chromium's in-tree docs are markdown files. Finding a doc that is out of date, has a broken link, or describes something you had to figure out the hard way — and fixing it — helps every developer who comes after you.

**First-timer-friendly doc CLs**:
- Fix a broken link.
- Update a file path that changed.
- Add an example to an existing doc.
- Fix a typo or unclear sentence.
- Add a missing section (e.g., "How to do X on Windows" when the doc only covers Linux).

A doc CL has the same lifecycle as a code CL — branch, edit, upload, review, land. The reviewers are usually faster and kinder than on code CLs. This is a genuinely good way to learn the CL workflow before touching code.

**DevTools documentation** at [developer.chrome.com/docs/devtools](https://developer.chrome.com/docs/devtools/) is maintained via GitHub PRs. No depot_tools required.

---

### Rung 5 — Create and publish a HAR dataset (Effort: 2–8 hours, Impact: research-grade)

This is the rung your professor suggested, and it's genuinely underserved. Let me explain what it is and why it matters.

**What a HAR file is**: HAR (HTTP Archive) is a JSON format capturing a complete network session — every request, response, timing, headers, cookies, priorities. Chrome exports them from DevTools → Network panel → "Export HAR."

**Why HAR datasets matter**:
- Web performance researchers use real-world HAR captures to benchmark optimizations.
- Browser teams use HAR captures to reproduce network-related bugs.
- Privacy researchers use HAR captures to study tracking behavior.
- ML researchers train models to predict page load time, detect web extension behavior, identify malicious traffic patterns.

**Scenarios worth capturing that have no good public datasets**:

| Scenario | Scientific value |
|---|---|
| Chrome with various extensions installed (ad blockers, password managers, developer tools) vs. clean profile | Quantify extension overhead on page load, measure request interception patterns |
| WebGPU compute-heavy scientific pages (molecular viewers, simulation dashboards) | GPU command timing, compute shader dispatch patterns |
| Web Serial / WebUSB instrument acquisition sessions | Protocol overhead vs. native serial; timing jitter at different baud rates |
| Progressive Web App offline→online sync cycles | Background Sync timing, IndexedDB write patterns |
| Sites using HTTP/3 vs. forced HTTP/2 fallback | QUIC connection establishment overhead, real-world h3 adoption |
| Scientific data platforms (PubChem, RCSB PDB, CAS SciFinder, ICPD) under various network conditions | Resource loading patterns for large molecular data payloads |
| Browser extensions interacting with lab instrument web apps | IPC overhead, content script injection timing |

**How to build a dataset**:

```bash
# Step 1: Instrument Chrome with a specific profile
chrome --user-data-dir=/tmp/har-profile --auto-open-devtools-for-tabs

# Step 2: Use Playwright to automate + capture HAR
python3 << 'EOF'
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(record_har_path='session.har')
    page    = context.new_page()

    # Your scenario here
    page.goto('https://www.rcsb.org/structure/1CRN')  # crambin PDB entry
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(3000)   # wait for lazy-loaded 3D viewer

    context.close()
    browser.close()

print('HAR saved to session.har')
EOF

# Step 3: Validate + anonymize (remove auth headers, personal cookies)
python3 anonymize_har.py session.har
```

**Publishing**: GitHub + Zenodo (for a citable DOI), with a README describing the collection methodology. Use a permissive license (CC0 or CC-BY). Tag with `har`, `web-performance`, `chromium`.

**The chemistry angle specifically**: a HAR dataset of NMR processing web apps (e.g., MNova Web, JCAMP-DX viewers), molecular dynamics viewers, or chemistry education platforms would be novel and useful to both the web performance and computational chemistry communities. This is publishable as a data paper in a journal like *Scientific Data*.

---

### Rung 6 — Fix a "Good First Bug" in Chromium (Effort: 4–40 hours, Impact: you're in the CONTRIBUTORS file)

**Where**: [crbug.com](https://crbug.com) with filter `label:GoodFirstBug`.

Good first bugs tend to be:
- Documentation fixes (Rung 4 but in code).
- Test additions (adding a missing test to an existing file).
- Small behavior fixes (a missing null check, a wrong default value, a UI string update).
- DevTools improvements (DevTools is written in TypeScript, lower barrier than C++).

**The actual CL workflow** (students know this from L6 and HW work):

```bash
# 1. Find bug e.g. crbug.com/12345678
# 2. Comment "I'm working on this"
git checkout -b fix-bug-12345678 origin/main

# 3. Find the relevant code (Code Search is your friend)
# 4. Make the minimal change to fix the bug

# 5. Add or update a test
autoninja -C out/Default blink_tests   # or unit_tests, depending on area

# 6. Run the test locally
out/Default/content_shell --run-layout-test \
    path/to/your/test.html

# 7. Upload
git add -A && git commit -m "Blink: fix null check in FooBarHandler

Previously, FooBarHandler::HandleThing could crash when called
with an empty parameter due to a missing null check. This adds
the check and returns early with an error.

Bug: 12345678
"
git cl upload

# 8. Request review — git cl will suggest OWNERS
# 9. Address review comments, re-upload patchsets
# 10. CQ+2 → land
```

**Calibrate expectations**: a typical first-time contributor's CL takes 2–6 weeks from first upload to landing, including review cycles, multiple patchsets, and CQ runs. This is normal. The reviewers are not hostile — they are thorough.

**DevTools is the fastest entry point**: the DevTools frontend lives at [github.com/ChromeDevTools/devtools-frontend](https://github.com/ChromeDevTools/devtools-frontend) and accepts GitHub PRs (not Gerrit). TypeScript, not C++. Has a more active newcomer pipeline than the main Chromium repo.

---

### Rung 7 — Engage with standards bodies (Effort: varies, Impact: shapes the web)

This is where the course's interdisciplinary angle matters most. The standards bodies that define the web platform actively want diverse perspectives — especially from scientists, educators, and domain experts.

#### W3C Community Groups (free to join, no fee)

Go to [w3.org/community/groups](https://www.w3.org/community/groups/). Anyone with a W3C account (free) can join any Community Group. No company membership required.

Relevant groups for this course's alumni:

| Community Group | Why it matters for you |
|---|---|
| **Web Incubator CG (WICG)** — [wicg.io](https://wicg.io) | Where new browser APIs are proposed. Web Serial started here. Web Bluetooth started here. If you have an idea for a new lab API (e.g., Web Spectrometer, Web XRF), this is where to propose it. |
| **GPU for the Web CG** — [github.com/gpuweb/gpuweb](https://github.com/gpuweb/gpuweb) | WebGPU's home. File issues, comment on proposals, write test cases. Scientific computing use cases are underrepresented and welcome. |
| **WebAssembly CG** — [webassembly.org](https://webassembly.org) | WASM future features (GC, threads, SIMD extensions, WASI). If you have a use case for WASM in scientific computing (e.g., "I need 64-bit SIMD for DFT"), this is where to bring it. |
| **Web Performance WG** — [w3.org/webperf](https://www.w3.org/webperf/) | Performance Observer, PerformanceTimeline, Long Tasks API. Chromium performance work lives here. |
| **Device and Sensors WG** | Web Serial, WebUSB, Accelerometer, Gyroscope, Ambient Light specs. If you built an instrument interface in HW13, you have firsthand expertise to contribute. |

**Practical first step**: join WICG on GitHub ([github.com/WICG](https://github.com/WICG)). File an issue on an existing proposal — a use case from your research that the spec currently doesn't handle well. Issue comments from domain experts are read by spec authors.

#### WHATWG (HTML, DOM, Fetch, URL, Streams)

WHATWG maintains the HTML Living Standard and several companion specs. Development happens on GitHub ([github.com/whatwg](https://github.com/whatwg)). Contributions welcome:
- File issues for spec ambiguities.
- Open PRs for editorial fixes.
- Comment on open issues with use-case examples.
- Participate in the Discourse forum at [whatwg.org/forums](https://whatwg.org/forums).

**The barrier**: WHATWG repos move fast and the process is more streamlined than W3C. PRs can land in days if they fix clear spec bugs.

#### TC39 (JavaScript / ECMAScript)

TC39 ([tc39.es](https://tc39.es)) defines ECMAScript. It operates through a staged proposal process (Stage 0 → Stage 4). Formal participation requires joining Ecma as a member, but the community can contribute:
- Comment on proposals ([github.com/tc39/proposals](https://github.com/tc39/proposals)).
- File issues on Stage 1–3 proposals.
- Write test262 tests ([github.com/tc39/test262](https://github.com/tc39/test262)) — the ECMAScript conformance suite.
- Participate in the TC39 Discord server.

**Scientific computing angle**: TC39 is actively working on proposals that matter for scientific code: `Float16Array`, decimal arithmetic, explicit resource management, fixed-layout structs. Your V8 knowledge from Unit III gives you genuine insight here.

#### IETF (HTTP, QUIC, TLS)

The IETF defines QUIC, HTTP/3, and TLS. Working groups meet online and in person:
- **QUIC WG**: [quicwg.org](https://quicwg.org). Errata on RFC 9000/9114 are welcome.
- **HTTPBIS WG**: HTTP semantics and framing.
- IETF participation is free for individuals; subscribe to the mailing list.

---

### Rung 8 — Build public tooling on top of Chromium (Effort: weeks–months, Impact: used by thousands)

Tools built on Chromium's public APIs that developers rely on:

**Lighthouse** ([github.com/GoogleChrome/lighthouse](https://github.com/GoogleChrome/lighthouse)): the performance/accessibility auditing tool inside Chrome DevTools. Written in JavaScript, uses CDP. Contributions welcome — especially new audits for scientific web apps, WebGPU performance, or Web Serial connection patterns.

**Playwright** / **Puppeteer**: the automation libraries built on CDP. If you add a new CDP command in a Chromium CL, you can also add the corresponding Playwright/Puppeteer API. This doubles your CL's visible impact.

**Chrome extensions with published datasets or tooling**: the Chrome Web Store has a science-adjacent niche waiting to be served. A DevTools panel that profiles WebGPU shader performance, or a browser extension that generates HAR captures with scientifically-annotated metadata, would be genuinely novel.

**Electron-based scientific tools**: build a desktop scientific app on Electron, open-source it. Porting an existing CLI molecular dynamics viewer to Electron — giving it a GUI, WebGPU visualization, and local IndexedDB storage — is a multi-semester capstone project that produces something real.

---

### Rung 9 — Propose or shepherd a new web platform feature (Effort: months–years, Impact: ships to billions)

The highest rung. The process for adding a new API to the web platform:

1. **Use case documentation**: write up the problem in a GitHub issue on WICG. Who needs it? What's the use case? Why can't existing APIs solve it?
2. **Explainer**: a markdown document explaining the API design, alternatives considered, and security/privacy implications. ([WICG explainer template](https://github.com/WICG/proposals/blob/main/PROPOSAL_TEMPLATE.md))
3. **Intent to Prototype** (I2P): posted to `blink-dev@chromium.org`. This announces Chromium's intent to begin implementing the feature behind a flag. Three LGTM from API owners required.
4. **Implementation + Origin Trial**: implement behind a flag. Enable for an origin trial — real developers can opt in.
5. **Intent to Ship** (I2S): posted to `blink-dev@chromium.org`. Requires evidence of web developer interest, security review, privacy review, compatibility risk assessment, three LGTM from API owners.
6. **Ship**: feature enabled by default. Enters Chrome stable.

**Examples of features that started exactly this way from outside Google**:
- Web Serial (Igalia contributed significantly).
- WebCodecs (Igalia, Microsoft, Apple).
- Container Queries (authored by Igalia for Google).
- CSS `:has()` selector (shipped in Chrome 105).

**For ChemE/Chemistry students**: the most impactful thing you could do is champion a "Web Spectrometry API" or "Web Chromatography API" — a standardized interface for analytical chemistry instruments beyond what Web Serial provides. This would require: instrument manufacturer buy-in, a WICG explainer, and prototype implementation in Chromium. It's a PhD-thesis-scale project. But the path exists.

---

## The professional community — channels and rhythms (10 min)

### Where Chromium developers communicate

| Channel | What happens there |
|---|---|
| `chromium-dev@chromium.org` | General Chromium development discussion. Subscribe and lurk. |
| `blink-dev@chromium.org` | Where Intent to Prototype/Ship/Experiment are posted. The governance layer. |
| `chrome-accessibility@chromium.org` | Accessibility-specific discussions. |
| `net-dev@chromium.org` | Network stack discussions. |
| `devtools-dev@chromium.org` | DevTools discussions. |
| crbug.com | Issues, bug reports, design discussions. |
| chromium-review.googlesource.com | Code reviews. |
| [chromium.slack.com](https://chromium.slack.com) | Informal Slack, invite-based after first CL lands. |

**Lurking is fine and encouraged.** Subscribe to `blink-dev`. Read the Intents. Comment when you have something to add. Announce yourself when your first CL lands.

### Conference and event cadence

| Event | What it is | Where to find it |
|---|---|---|
| **BlinkOn** | Annual Chromium contributor conference (virtual + in-person). Talks on rendering, V8, security, features. | chromium.googlesource.com/chromium/src/+/HEAD/docs/blinkon.md |
| **W3C TPAC** | Annual W3C all-hands. Working groups meet in person. Community members can attend. | w3.org/2024/09/TPAC/ |
| **Web Engines Hackfest** | Annual gathering of browser engine developers. Igalia-organized, invitation-based. | webengineshackfest.org |
| **FOSDEM** | Free Open Source Software developer meeting, Brussels, each February. Web and browser track. | fosdem.org |
| **ChromiumU / ChromeU** | Google-internal, but talks are often published externally. Watch Chrome team YouTube. | youtube.com/@ChromiumDev |

---

## Live demo — HAR dataset workflow (15 min)

Walk through building a small but useful HAR dataset live. Scenario: **"WebGPU scientific page HAR captures with and without hardware acceleration."**

```python
# Step 1: Install Playwright (students should have this from HW11)
# pip install playwright && playwright install chromium

from playwright.sync_api import sync_playwright
import json, os, time

SCENARIOS = [
    ('webgpu-nbody', 'https://austin-eng.com/webgpu-samples/samples/particles'),
    ('pubchem-3d',   'https://pubchem.ncbi.nlm.nih.gov/compound/2244#section=3D-Conformer'),
    ('rcsb-viewer',  'https://www.rcsb.org/3d-view/7UJH'),
]

def capture_har(url, name, disable_gpu=False):
    with sync_playwright() as p:
        args = ['--disable-gpu'] if disable_gpu else []
        ctx  = p.chromium.launch(args=args).new_context(
            record_har_path=f'hars/{name}.har'
        )
        page = ctx.new_page()
        page.goto(url, wait_until='networkidle')
        time.sleep(5)   # let any async rendering settle
        ctx.close()
    print(f'Captured: {name}.har')

os.makedirs('hars', exist_ok=True)
for name, url in SCENARIOS:
    capture_har(url, f'{name}-gpu',    disable_gpu=False)
    capture_har(url, f'{name}-nogpu',  disable_gpu=True)

# Step 2: Parse and compare HAR files
def har_summary(path):
    with open(path) as f:
        har = json.load(f)
    entries = har['log']['entries']
    total   = len(entries)
    size    = sum(e['response']['bodySize'] for e in entries if e['response']['bodySize'] > 0)
    time_ms = sum(e['time'] for e in entries)
    return {'requests': total, 'bytes': size, 'total_ms': time_ms}

print('\nHAR comparison:')
print(f"{'Scenario':<30} {'Req (GPU)':>10} {'Req (no GPU)':>12} {'ms (GPU)':>10} {'ms (no GPU)':>12}")
for name, _ in SCENARIOS:
    gpu   = har_summary(f'hars/{name}-gpu.har')
    nogpu = har_summary(f'hars/{name}-nogpu.har')
    print(f"{name:<30} {gpu['requests']:>10} {nogpu['requests']:>12} "
          f"{gpu['total_ms']:>10.0f} {nogpu['total_ms']:>12.0f}")
```

Run it. Show the output. Point out: even a simple 15-minute script producing 6 HAR files around a real research question — "how does hardware GPU acceleration affect scientific web app loading?" — is a publishable dataset. Add a methodology section and post to GitHub + Zenodo.

This is the HAR rung made concrete. Students can take exactly this script, choose three scientific web apps in their domain, and produce a dataset worth sharing.

## Reading for next lecture

- chromium.org: [Blink launch process](https://www.chromium.org/blink/launching-features/)
- chromestatus.com — browse; read an Intent to Ship from the past month
- wicg.io — browse active proposals; pick one to comment on

## Instructor notes

- This lecture is for motivation as much as instruction. Some students will contribute; many won't right away. Plant the seed.
- The HAR dataset angle is the most novel rung on the ladder. Spend time on it — it's something students can do this week, not "someday."
- Students who are doing Track 1 (CL) for the final project should already be at Rung 6. This lecture gives them context for what comes next.
- Chemistry/ChemE students should hear explicitly: your domain knowledge is scarce in these communities. A chemist who shows up in the WebGPU CG saying "here's what scientific computing needs" is unusual and valuable.

---

[← Unit VII README](./README.md) · [Next: L28 — The Ecosystem →](./L28-ecosystem-future.md)

# Lecture 4 — GN, Ninja, and the Build System

| | |
|---|---|
| **Unit** | I — Foundations |
| **Week** | 2 |
| **Duration** | 1.5 hours |
| **Demo** | Incremental rebuild timing; `ninja -d explain` |

## Learning objectives

Students can:

1. Explain what GN is and why it exists.
2. Read a simple `BUILD.gn` file.
3. Run `gn gen`, `autoninja`, and understand what each produces.
4. Distinguish debug vs. release vs. component builds.
5. Time and profile a build.

## Opening hook (5 min)

Ask: *"What's the fastest way to build Chromium?"*

Take guesses. Real answer: **don't rebuild.** Second-best: **rebuild the smallest thing that answers your question.** Third-best: **parallelize aggressively.**

A full clean Chromium build has roughly **50,000–80,000 compile actions** and tens of thousands of link actions. If each compile took one second, a single-core build would take most of a day. Real builds are 1–6 hours because of parallelism. This lecture is about making that work.

## Why two tools — GN and Ninja? (10 min)

A build system has two jobs:

1. **Figure out what needs building and how** (the *configuration* problem). "Compile `foo.cc` into `foo.o` with these flags, link these objects into `libbar.so`, here are the dependencies." Output: a build graph.
2. **Execute the build graph in parallel, incrementally, correctly** (the *execution* problem). Given the graph, do the minimum work needed.

Older systems (Make, CMake, Bazel) do both in one tool. Chromium splits them:

- **GN (Generate Ninja)** solves #1. Declarative language (Python-flavored, not actually Python) describing targets, sources, dependencies, flags, visibility. GN *generates* Ninja files.
- **Ninja** solves #2. Minimalist build executor. Reads generated `.ninja` files and runs the graph. Ruthlessly optimized — startup is tens of milliseconds on a huge graph.

Why split? (1) is a hard language-design problem (expressiveness, correctness, fast evaluation); (2) is a hard systems problem (fast graph traversal, correct incremental builds, parallelism). One tool doing both compromises one or both. CMake is infamous for this.

Historical note: Chromium originally used **GYP**, an earlier Google-internal tool in Python. Slow to evaluate at Chromium scale (gyp-gen took minutes). GN was written to replace it starting ~2013, migration finished ~2018. GYP is dead.

## GN in 15 minutes (15 min)

Open [`base/BUILD.gn`](https://source.chromium.org/chromium/chromium/src/+/main:base/BUILD.gn) on the projector.

Walk through what students see:

```python
import("//build/config/...")  # shared config

component("base") {
  sources = [
    "at_exit.cc",
    "at_exit.h",
    # ... many more
  ]

  public_deps = [
    "//base/allocator:...",
  ]

  deps = [
    "//build:...",
  ]

  defines = [ "BASE_IMPLEMENTATION" ]

  if (is_win) {
    sources += [ "win/..." ]
  }
  if (is_linux) {
    sources += [ "linux/..." ]
  }
}
```

Explain each piece:

- **Target types**: `executable`, `shared_library`, `static_library`, `source_set`, `component`, `group`, `action`. `component` is "static_library in release, shared_library in debug/component builds" — the magic trick that speeds incremental linking.
- **`sources`**: files that belong to this target.
- **`deps` vs `public_deps`**: `deps` are private — users of this target don't inherit them. `public_deps` are transitive — users can `#include` headers from them. Crucial for build hygiene.
- **`defines`, `cflags`, `ldflags`**: passed to the compiler/linker for this target.
- **Conditionals** (`if (is_win)`, `if (is_android)`, `if (use_ozone)`): GN has first-class platform/feature flags.
- **Labels**: `//base`, `//chrome/browser:sources`. `//` means "relative to source root." Colon introduces a target within a `BUILD.gn`.
- **Args**: configurable at `gn gen` time via `--args`. Defined in `//build/config/BUILDCONFIG.gn` and `.gni` files.

Then run live:

```bash
gn args out/Default
# opens an editor; put:
# is_debug = true
# is_component_build = true
# symbol_level = 1
# enable_nacl = false
```

Explain each arg:

| Arg | Meaning |
|---|---|
| `is_debug = true` | Debug assertions on, no optimizations, bigger binaries, DCHECKs active. |
| `is_component_build = true` | The "fast linker" trick. Essential for iterative work. |
| `symbol_level = 1` | Functions and file names but not full variable info. `2` is full debug info (huge). `0` is none. |
| `enable_nacl = false` | Turn off Native Client; legacy, skipping saves time. |

`gn gen out/Default` generates the Ninja files. On a big checkout: 5–60 seconds. Show the output directory:

```bash
ls out/Default/
# args.gn  build.ninja  build.ninja.d  toolchain.ninja  ...
```

`args.gn` is the persisted config. Re-edit with `gn args out/Default` anytime.

## Ninja and `autoninja` (10 min)

Now the fun part:

```bash
autoninja -C out/Default chrome
```

**`autoninja`** is a wrapper that picks reasonable parallelism (roughly `ncores` locally; automatically configures RBE if available) and invokes Ninja. On a laptop, roughly `ninja -j 8`; on a desktop, 16–32.

Ninja does three things very fast:

1. Parse the generated `.ninja` files.
2. Stat every input file to compute a freshness-annotated dependency graph.
3. Schedule up to `-j` parallel actions respecting dependencies.

Show Ninja output during the build. The `[X/Y]` prefix is "X actions done of Y total." The total Y is your build graph size — usually 60k–100k.

Useful Ninja invocations:

| Command | Purpose |
|---|---|
| `ninja -t graph chrome \| dot -Tpng > chrome.png` | Literal picture of your build graph (subset). |
| `ninja -t targets` | List every target. |
| `ninja -t deps foo.o` | What does `foo.o` depend on? |
| `ninja -t commands chrome \| head` | Show exact command lines. |
| `ninja -d explain chrome` | Why is each action being re-run? **The single most useful debugging flag.** |

## Release vs. debug vs. component vs. official (10 min)

Four common build modes:

| Mode | `is_debug` | `is_component_build` | `is_official_build` | When to use |
|---|---|---|---|---|
| Dev/debug | true | true | false | Default for iterating |
| Dev/release | false | true | false | Profiling, closer to shipping perf |
| Full release | false | false | false | Benchmarks, perf regressions |
| Official | false | false | true | What Google ships; LTO, PGO, huge, slow |

**Official builds use LTO (link-time optimization) and PGO (profile-guided optimization).** What actually ships to users. 2–4× longer to build and hostile to iteration. Students will never need one in this class.

## Live demo — incremental build behavior (10 min)

The "aha" demo. Pre-prepared: a built-once checkout on your machine.

1. `time autoninja -C out/Default chrome` with no changes. Should take <5 seconds. "No work to do." Ninja stat'd everything and concluded nothing changed.
2. `touch base/at_exit.cc` (no actual change). `time autoninja -C out/Default chrome`. Rebuilds `base` and re-links dependents. Component build: seconds to a minute. Static build: several minutes. Show both if time allows.
3. Edit a single `.cc` in `third_party/blink/renderer/core/`. `time autoninja -C out/Default content_shell`. Often <30 seconds in a component build.
4. Edit a header included everywhere (e.g., something in `base/logging.h`). Rebuild. Watch the cascade: hundreds or thousands of files recompile. The "header inclusion is a superpower *and* a footgun" moment.
5. `ninja -d explain -C out/Default chrome` after a small edit — show the explanations.

Key lesson: **header hygiene matters enormously.** One reason Chromium is moving toward modules, forward declarations, and `#include` discipline is iterative build time.

## Reading for next lecture

- chromium.org: [Get Around the Chromium Source Code Directory Structure](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/getting_around_the_chrome_source_code.md)
- Browse `//DEPS` and top-level directories in Code Search for ~20 min before class

## Instructor notes

- HW2 spans this week. Offer office hours.
- Keep an "args.gn cheat sheet" on the course site. Copy-paste values are forgiving; typos (`is_debug=True` instead of `true`) cause cryptic errors.
- If a student reports "my build is 8 hours" — check for accidentally enabled `symbol_level=2`, full static build, non-component. Fix their `args.gn` before they suffer more.

---

[← L3](./L03-getting-the-source.md) · [Unit I README](./README.md) · [Next: L5 — Directory Archaeology →](./L05-directory-archaeology.md)

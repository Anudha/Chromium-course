# Lecture 6 — Coding Standards, Reviews, and the CL Lifecycle

| | |
|---|---|
| **Unit** | I — Foundations |
| **Week** | 3 |
| **Duration** | 1.5 hours |
| **Demo** | `git cl upload --dry-run` walkthrough |

## Learning objectives

Students can:

1. Describe the full CL lifecycle from local edit to landed commit.
2. Explain what OWNERS files do and why.
3. Interpret CQ bot results.
4. Describe the role of tryjobs and presubmit.
5. Articulate why Chromium's review culture is the way it is.

## Opening hook (5 min)

Pose the question: *"How does a codebase with 2,000 commits per week from 1,500 people not immediately collapse into chaos?"*

Let students offer theories (tests, code review, modularity, OWNERS). All correct. This lecture is how those mechanisms work in practice.

## The CL lifecycle, end to end (15 min)

**CL** = Change List (Google parlance; equivalent to a GitHub "pull request"). Chromium uses **Gerrit**, not GitHub, for code review. GitHub has a mirror ([github.com/chromium/chromium](https://github.com/chromium/chromium)) but all real development happens on [chromium-review.googlesource.com](https://chromium-review.googlesource.com/).

Draw the pipeline:

```
1. Local edit (git)
     │
     ▼
2. `git cl upload` → Gerrit (chromium-review.googlesource.com)
     │
     ▼
3. Presubmit checks (PRESUBMIT.py scripts)
     │
     ▼
4. Reviewers assigned (OWNERS-based)
     │
     ▼
5. Review cycles (comments, patchsets)
     │
     ▼
6. Code-Review +2 (approval) from OWNERS
     │
     ▼
7. CQ (Commit Queue) — runs tryjobs on all bots
     │   (Windows, Mac, Linux, Android, iOS, ChromeOS;
     │    debug + release; ASan + TSan + MSan; Blink
     │    layout tests; unit tests; integration tests)
     │
     ▼
8. If green → auto-land to main; if red → sent back
```

Key properties:

- **The CQ is not optional.** You can't force-push to main. There's no "I know what I'm doing" override. Every commit lands via CQ.
- **The CQ runs on dozens of configurations.** A CL that breaks on Android but passes on Linux gets rejected.
- **Flaky tests are the perennial enemy.** The CQ has retry logic and flake detection. When it's broken, the whole project slows down.
- **Rolls are also CLs.** Autorollers are bots that produce CLs; they go through the CQ.

## OWNERS (10 min)

Open any file in Code Search, e.g., `base/strings/string_util.cc`. Navigate up to its OWNERS file.

```
# base/strings/OWNERS
foo@chromium.org
bar@chromium.org
# ...
per-file string16*=baz@chromium.org
```

Rules:

- Every directory has an `OWNERS` file (possibly inherited from a parent). It lists emails authorized to `+2` changes in that directory.
- **Every CL needs at least one `+2` from an owner of every directory it touches.** A CL touching `base/`, `chrome/browser/`, and `third_party/blink/` needs owner signoff from all three.
- Some directories have **"global approvers"** — OWNERS files at the root for security-critical or infra-critical areas.
- There are special OWNERS for IPC (`ipc/`, `mojo/`) — Mojo changes often need security review.
- **Line-level OWNERS exist too** via `per-file`.

Why OWNERS? In a 1,500-contributor project, you cannot rely on "whoever reviewed it knew what they were doing." OWNERS encode local expertise. The author's job is to find owners; `git cl owners` suggests reviewers automatically.

## Presubmit (5 min)

Before a CL lands on Gerrit, a **presubmit check** runs locally (and again on the server). `PRESUBMIT.py` files live alongside code.

Presubmit catches:

- Style violations (clang-format, lint).
- Missing copyright headers.
- Banned API usage (e.g., `std::vector<bool>`, certain C headers).
- Missing tests for new files.
- DEPS violations (disallowed `#include`s).
- Doc/spec requirements.

Students see presubmit output when they run `git cl upload`. It can block upload.

## The CQ and tryjobs (10 min)

When a reviewer clicks "Commit Queue +2", Gerrit schedules **tryjobs** — builds on dedicated bots:

| Bot type | Purpose |
|---|---|
| Compile bots | Does the CL build on every supported configuration? |
| Unit test bots | Do all unit tests pass? |
| Integration / browser test bots | Do all integration tests pass? |
| Blink layout test bots | Do the ~70,000 web-platform tests (WPT) and legacy layout tests pass? |
| Sanitizer bots | ASan (address), TSan (thread), MSan (memory), UBSan (undefined-behavior). Slow, critical for security. |
| Fuzzer bots | Continuously fuzz. Usually post-submit, not on CQ. |
| Performance bots | Regression detection. Usually post-submit, but perf-critical CLs get pre-submit runs. |

A CL green on Linux-release can easily be red on Windows-debug-ASan. The CQ catches this before the CL lands.

To see the machinery, browse [ci.chromium.org](https://ci.chromium.org/). Every bot's current status, recent build, green/red streak is public.

**Chromium's test infrastructure is itself a research-grade distributed system.** It's what lets the project scale.

## The code review culture (10 min)

The soft part of the lecture but important, especially for non-CS students who may submit CLs for the final project.

Observable norms:

- **Reviews are rigorous.** Senior Chromium reviewers will ask for changes on CLs that GitHub maintainers would merge without comment. Expect multiple patchsets.
- **Nits are real.** Reviewers comment on naming, comment quality, function decomposition. Not mean, but exacting.
- **DCHECK / CHECK / NOTREACHED discipline.** Reviewers insist on invariants being expressed in code.
- **Small CLs are preferred.** A CL touching 20 files will get pushed back: "split this into a refactor and a feature CL." A CL over ~500 lines of new code is hard to get reviewed.
- **Tests are required.** Adding a feature without tests rarely lands. "Where's the test?" is the most common review comment.
- **Documentation for design decisions.** Non-trivial CLs should link to a design doc.

Show one real landed CL on [chromium-review.googlesource.com](https://chromium-review.googlesource.com/). Pick something recent, medium-sized, with a visible review cycle (multiple patchsets, substantive comments). Walk through:

- Description format (bug number, summary, rationale, testing notes).
- Reviewers and their comments.
- How the author responded.
- Final +2 and CQ run.

Leave this open as students read along.

## Live demo — `git cl upload` dry-run (10 min)

Using your demo checkout from Lecture 3:

```bash
git new-branch my-first-cl
# edit a file — e.g., fix a typo in a comment
git commit -am "base: fix a typo in foo comment"
git cl upload --dry-run
```

Show the presubmit output. Remove `--dry-run` but **do not hit enter**. Explain what would happen: a Gerrit CL created, reviewers auto-suggested based on OWNERS, students could view at a URL.

If you have a safe sandbox, actually upload to a private review:

```bash
git cl upload --private
```

Show the Gerrit page. Exactly what students do for the final project Track 1.

## Midterm 1 preview (10 min)

Midterm 1 is Thursday of Week 6 — two weeks out. Cover format, topics (Units I and II), practice strategy:

- Part A is factual recall — know directory structure, build commands, pipeline stages.
- Part B is reading real code. **Practice with Code Search now.** Open a random Blink file every day and try to understand it.
- Part C is pipeline tracing. We'll do this all the way through Week 6; it'll make sense by midterm.

Study resources:

- Rewatch the `chrome://version` demo from L1.
- The directory-structure tour from L5.
- The layer diagram from L5.

## Reading for next lecture

- web.dev: [Inside look at modern web browser](https://developer.chrome.com/blog/inside-browser-part1) — 4-part series by Mariko Kosaka. Best lay introduction to the rendering pipeline. Sets up Week 4.
- chromium.org: [How Blink works](https://docs.google.com/document/d/1aitSOucL0VHZa9Z2vbRJSyAIsAz24kX8LFByQ5xQnUg/) — published Google Doc explainer.

## Instructor notes

- Some students, especially non-CS, will be overwhelmed by the review culture section. Reassure them: Track 2 and Track 3 final projects don't require landing a CL.
- HW3 due this week; HW4 assigned.
- Everyone needs a Gerrit-linkable identity (gmail, Google Workspace, or a work address). Set up [chromium-review.googlesource.com](https://chromium-review.googlesource.com/) accounts this week.

---

[← L5](./L05-directory-archaeology.md) · [Unit I README](./README.md) · **End of Unit I** · Next: Unit II coming soon

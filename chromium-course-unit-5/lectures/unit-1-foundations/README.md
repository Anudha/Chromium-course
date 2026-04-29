# Unit I — Foundations

**Weeks 1–3 · Lectures 1–6**

This unit establishes what Chromium is, how it is organized, how to build it, and how its engineering culture works. By the end of Week 3, every student has:

- A working Chromium checkout on their own machine or a lab workstation
- A successful first build
- A working Chromium Code Search workflow
- A mental model of the multi-process architecture
- Familiarity with the CL / Gerrit / OWNERS lifecycle

## Lectures

| # | Title | Demo |
|---|---|---|
| [L1](./L01-what-is-chromium.md) | What Is Chromium? | Tour of `chrome://` internal pages |
| [L2](./L02-browser-as-os.md) | Browser as Operating System | Task Manager + forced process crashes |
| [L3](./L03-getting-the-source.md) | depot_tools and the 100 GB Problem | `fetch chromium` walkthrough |
| [L4](./L04-gn-ninja-build.md) | GN, Ninja, and the Build System | Incremental rebuild timing |
| [L5](./L05-directory-archaeology.md) | Directory Archaeology | End-to-end `navigator.userAgent` trace |
| [L6](./L06-coding-standards-reviews.md) | Coding Standards, Reviews, the CL Lifecycle | `git cl upload --dry-run` |

## Unit learning outcomes

Students who complete Unit I can:

1. Distinguish Chromium from Chrome and name major downstream consumers.
2. Sketch the multi-process architecture and predict which process handles a given user action.
3. Use `depot_tools`, `gclient`, `gn`, and `autoninja` to build Chromium from source.
4. Navigate the top-level directory structure and use Code Search to trace code paths.
5. Prepare and dry-run-upload a CL through Gerrit.

## Associated homework

- HW1 — Browser Forensics (assigned L1, due end of Week 1)
- HW2 — The Build (assigned L3, due end of Week 2)
- HW3 — Code Archaeology (assigned L5, due end of Week 3)

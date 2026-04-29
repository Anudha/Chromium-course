# Unit III — V8 and JavaScript

**Weeks 7–8 · Lectures 13–16**

This unit goes deep on V8, Chromium's JavaScript and WebAssembly engine. V8 is the single most consequential piece of Chromium for most application developers, and understanding its internals is the difference between writing code that runs at 1x speed and code that runs at 100x.

This is the most technical unit of the course. Students should expect to read actual machine output, reason about memory layouts, and trace IC state transitions. The payoff is understanding *why* the performance advice they've heard for years actually works.

## Lectures

| # | Title | Demo |
|---|---|---|
| [L13](./L13-v8-architecture.md) | V8 Architecture: The Tiered Compilation Pipeline | `d8 --print-bytecode` and `--trace-opt` |
| [L14](./L14-hidden-classes-ics.md) | Hidden Classes, Inline Caches, and the Shape of Fast JS | Monomorphic → polymorphic → megamorphic IC transitions |
| [L15](./L15-garbage-collection.md) | Garbage Collection: Orinoco, Oilpan, and Generational Marking | `--trace-gc` on allocation-heavy workloads |
| [L16](./L16-embedding-v8.md) | Embedding V8: The API That Runs Half the Internet | 40-line C++ program that embeds V8 |

## Unit learning outcomes

Students who complete Unit III can:

1. Describe all four V8 execution tiers and the conditions that trigger tier-up and deoptimization.
2. Read Ignition bytecode and reason about what it does.
3. Explain hidden classes (V8 Maps) as concrete data structures with transitions.
4. Identify monomorphic, polymorphic, and megamorphic IC states from observation.
5. Describe Orinoco's generational collector and Oilpan's tracing collector.
6. Embed V8 in a small C++ program: create an isolate, a context, run JS, expose a C++ function, handle exceptions.

## Associated homework

- [HW7 — V8 Under the Microscope](../../homework/HW07-v8-microscope.md) (assigned L13, due end of Week 7)
- [HW8 — Embedding V8](../../homework/HW08-embedding-v8.md) (assigned L15, due end of Week 8)

## Setup for this unit

Students need a built `d8` binary. Two paths:

1. **Full Chromium checkout from HW2**: `d8` is already in `out/Default/d8`.
2. **V8 standalone**: faster to build, ~5 GB. Follow [v8.dev "Building V8 from source"](https://v8.dev/docs/build). Takes 30–60 min.

Either way, by the end of Week 7, everyone needs a working `d8`.

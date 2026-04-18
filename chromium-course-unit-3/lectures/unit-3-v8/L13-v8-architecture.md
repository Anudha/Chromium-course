# Lecture 13 — V8 Architecture: The Tiered Compilation Pipeline

| | |
|---|---|
| **Unit** | III — V8 and JavaScript |
| **Week** | 7 |
| **Duration** | 1.5 hours |
| **Demo** | `d8 --print-bytecode` and `--trace-opt` on hand-written functions |

## Learning objectives

Students can:

1. Name V8's four execution tiers and describe what each does differently.
2. Explain why a JIT has multiple tiers instead of one.
3. Read simple Ignition bytecode.
4. Describe what triggers tier-up between tiers and what triggers deoptimization.
5. Identify Isolates, Contexts, and the overall process/memory model of V8.

## Opening hook (5 min)

Run this on the projector with `d8`:

```javascript
function add(a, b) { return a + b; }

// warm-up phase
for (let i = 0; i < 100; i++) add(i, i + 1);

// measure
const t0 = performance.now();
for (let i = 0; i < 100_000_000; i++) add(i, i + 1);
const t1 = performance.now();
console.log((t1 - t0).toFixed(2), 'ms');
```

On a laptop, this runs in roughly 50–100 ms — **one hundred million function calls**.

Now change line 1:

```javascript
function add(a, b) { return a + b; }
add(1, 2);
add("hello", "world");   // ← add this
```

Re-run. The warm-up now includes a string addition, which pollutes the type feedback V8 uses to optimize `add`. The second benchmark will be measurably slower, often 2–5×.

*Why?* The function is the same. The measured loop runs on identical integers. What changed?

The rest of this lecture and Lecture 14 answer that question. Short version: V8 speculatively compiles specialized machine code assuming the types it has seen. When the types are stable (integers only), that code is near-C performance. When V8 has seen mixed types, it generates more defensive code. This lecture is the tier system that manages speculation.

## Why a JIT has tiers (10 min)

A JIT compiler faces a dilemma.

**Compile fast, run slow.** Generate machine code quickly so the user doesn't wait — but generate it naively, so the code itself is slow. Every single property access still has to look up the property dynamically, every `+` has to check both operand types.

**Compile slow, run fast.** Spend milliseconds per function doing proper analysis, inlining, register allocation, type specialization — and generate machine code that rivals C++. But now the user waits for compilation.

For JavaScript specifically, this dilemma is brutal: a typical page has tens of thousands of functions, most of which run a handful of times. Fully optimizing them all is pure waste. But some run millions of times and need peak performance.

**The answer is tiers.** Start cheap. Collect information about how code actually behaves. Promote hot code to better compilers. If a promoted function later misbehaves (sees unexpected types), bail out back down the tiers.

V8's tier structure, as of 2025:

```
     Parse / AST
          │
          ▼
     ┌──────────┐
     │ IGNITION │  ← interpreter. Universal. Runs everything once.
     └────┬─────┘
          │  (function called ~8× with stable feedback)
          ▼
     ┌──────────┐
     │SPARKPLUG │  ← baseline JIT. Generates machine code in a single linear pass.
     └────┬─────┘
          │  (function called ~500× with stable feedback)
          ▼
     ┌──────────┐
     │  MAGLEV  │  ← mid-tier optimizer. Fast compile, ~2× faster output than Sparkplug.
     └────┬─────┘
          │  (function very hot, feedback extremely stable)
          ▼
     ┌──────────┐
     │ TURBOFAN │  ← top-tier optimizer. Slow compile, peak speed.
     │(Turboshaft│   Turboshaft is the newer backend, replacing parts of TurboFan.
     │ backend) │
     └──────────┘
```

Arrows down = **tier-up.** Arrows up (not drawn, but they exist) = **deoptimization**, when speculation fails.

## Each tier, in detail (20 min)

### Ignition — the interpreter (5 min)

Introduced in Chrome M59 (2017) with TurboFan as the replacement for the old Full-codegen + Crankshaft pair. See [Launching Ignition and TurboFan](https://v8.dev/blog/launching-ignition-and-turbofan).

**What Ignition is:** a register-based bytecode interpreter. JavaScript source is parsed to AST, then Ignition walks the AST and emits **bytecode**. The bytecode is what runs.

**Why bytecode and not just AST-walk?** Bytecode is compact (2–4× smaller than AST nodes), it's a more efficient interpretation target, and it provides a stable IR for downstream compilers — Sparkplug, Maglev, and TurboFan all consume Ignition bytecode, not AST.

**What register-based means:** unlike stack-based interpreters (JVM, CPython until 3.11), Ignition has an implicit accumulator register plus a fixed set of named registers per function frame. Most operations read operands from registers and write results to the accumulator. This design was chosen because it matches hot-path code well and makes bytecode shorter.

**The accumulator:** many Ignition ops implicitly read from or write to a register called the accumulator (notated `a` or `<accu>` in dumps). `LdaSmi [5]` means "load small int 5 *into the accumulator*." `Star2` means "store *the accumulator* into register r2."

A concrete example. Given:

```javascript
function add(a, b) { return a + b; }
```

`d8 --print-bytecode` will produce something like:

```
[generated bytecode for function: add (0x... <SharedFunctionInfo add>)]
Parameter count 3
Register count 0
Frame size 0 bytes
   11 S> 0x... @    0 : 0b 04             Ldar a1          // load parameter 'b' into accumulator
   13 E> 0x... @    2 : 38 03 00          Add a0, [0]      // accu = a0 + accu, using feedback slot 0
   15 S> 0x... @    5 : a9                Return           // return accumulator
```

Breakdown:

- **`Ldar a1`**: `Ldar` = "Load accumulator from register." `a1` is the second parameter (`b`). After this instruction, accumulator holds `b`.
- **`Add a0, [0]`**: add register `a0` (first parameter, `a`) to the accumulator, writing back to the accumulator. The `[0]` is a **feedback slot** — an index into a FeedbackVector where V8 records observed operand types for this `Add`. Crucial for Lecture 14.
- **`Return`**: return accumulator.

The `S>` markers are source-position annotations used for debugging and stack traces.

Point students at [`src/interpreter/bytecodes.h`](https://source.chromium.org/chromium/chromium/src/+/main:v8/src/interpreter/bytecodes.h) in the V8 tree. The macro `BYTECODE_LIST` enumerates every bytecode in V8. Roughly 200 of them. Most are specializations of load, store, arithmetic, comparison, property access, call, and control flow.

### Sparkplug — the baseline JIT (5 min)

Introduced in Chrome M91 (2021). See [Sparkplug — a non-optimizing JavaScript compiler](https://v8.dev/blog/sparkplug).

**What Sparkplug does:** walks the bytecode linearly, emitting a small, fixed piece of machine code for each bytecode operation. No intermediate representation. No control-flow graph. No register allocation. No optimization.

The genius: **Sparkplug reuses Ignition's stack frame layout.** A Sparkplug frame looks essentially identical to an Ignition frame. This means:

- Switching from Ignition to Sparkplug mid-execution is trivial — the frame is already compatible.
- Sparkplug code can call back into the Ignition interpreter for complex operations without frame translation.
- Deoptimization from Sparkplug is also trivial.

**Why this matters:** Sparkplug compiles an order of magnitude faster than a traditional optimizing JIT because it skips everything traditional JITs do. It just spits out a predictable sequence of machine ops per bytecode op. The generated code is maybe 2× faster than interpreted bytecode — not great, but applied to every function with almost no compile cost, it's a large win across a page.

### Maglev — the mid-tier optimizer (5 min)

Shipped in Chrome M117 (September 2023). See [Maglev — V8's Fastest Optimizing JIT](https://v8.dev/blog/maglev).

**What Maglev does differently from Sparkplug:**

- Builds a proper SSA (Static Single Assignment) control-flow graph from the bytecode.
- Consumes **feedback** from the FeedbackVector — the type observations Ignition and Sparkplug accumulated.
- Emits specialized code: e.g., if feedback says property `.x` has always been at offset 12 in the same hidden class, emit a direct offset-12 load instead of a generic property lookup.
- Inlines small hot functions.
- Unboxes numbers to raw machine floats or ints when it can prove safety.

**What Maglev skips (relative to TurboFan):**

- No loop unrolling.
- No escape analysis.
- No advanced load elimination.
- Simpler graph IR, faster compile.

Maglev sits in the sweet spot: compile time 10× slower than Sparkplug but 10× faster than TurboFan, runtime performance 2–3× better than Sparkplug.

### TurboFan — the top-tier optimizer (5 min)

Introduced 2017 as part of the Ignition+TurboFan pair. Still the final tier.

**Key properties:**

- Aggressive type speculation based on FeedbackVector data.
- Full optimization suite: constant folding, dead code elimination, redundancy elimination, loop-invariant code motion, inlining with heuristics, register allocation.
- Historically used a **Sea of Nodes** IR.
- **Turboshaft** is a newer, CFG-based IR that V8 has been gradually migrating TurboFan to since ~2022. See [Land ahoy: leaving the Sea of Nodes](https://v8.dev/blog/leaving-the-sea-of-nodes). As of Chrome 120+, Turboshaft handles the CPU-agnostic backend of TurboFan. WebAssembly compilation runs entirely through Turboshaft now.

Students don't need to know the Turboshaft/TurboFan distinction in depth — know that Turboshaft exists, know that the broad characterization "TurboFan is the top-tier optimizer" is still correct.

**When TurboFan activates:** when a function is genuinely hot and its feedback is extremely stable. The thresholds are tuned per-V8-version and aren't worth memorizing. The concept — "you have to earn TurboFan" — is what matters.

## Feedback, tier-up, and tier-down (10 min)

### The FeedbackVector

Every function has a **FeedbackVector** attached to it (via the SharedFunctionInfo and the function's FeedbackCell). The vector has one slot per operation site that benefits from feedback: property accesses, binary ops, calls, constructors.

Each slot records what the operation has seen. For a property access `obj.x`, slots hold the hidden classes of `obj` encountered and the property offsets. For a binary op like `a + b`, slots hold the types (small int, heap number, string, etc.).

When Maglev or TurboFan compile the function, they read the FeedbackVector and specialize. When feedback changes — a new hidden class appears at a site that had only seen one — the compiled code eventually gets invalidated and V8 recompiles or deoptimizes.

The code:

- FeedbackVector: [`src/objects/feedback-vector.h`](https://source.chromium.org/chromium/chromium/src/+/main:v8/src/objects/feedback-vector.h)
- Tier-up logic: [`src/execution/tiering-manager.cc`](https://source.chromium.org/chromium/chromium/src/+/main:v8/src/execution/tiering-manager.cc)

### Tier-up triggers

Approximate thresholds (these shift release-to-release):

| From | To | Rough trigger |
|---|---|---|
| Ignition | Sparkplug | After ~8 invocations with a live FeedbackVector |
| Sparkplug | Maglev | After ~500 invocations with stable feedback |
| Maglev | TurboFan | Much hotter, very stable feedback |

The tiering manager runs after each function returns and decides whether to queue a compile job on a background thread. Compilation for Maglev and TurboFan happens **concurrently** — on a worker thread — while the current tier keeps executing. When the higher-tier code is ready, the next call (or next loop iteration via **on-stack replacement**, OSR) uses it.

### Deoptimization

The reverse direction. When speculatively-compiled code discovers its assumptions were wrong, it **deoptimizes**: abandons its machine code, reconstructs the interpreter frame state, and resumes in Ignition (or Sparkplug).

Deopt triggers include:

- A property access site hits a hidden class it hadn't seen.
- A binary op sees a type it hadn't compiled for (e.g., JIT'd for int+int, now sees string+int).
- An array's elements kind changes (e.g., SMI_ELEMENTS → DOUBLE_ELEMENTS → HOLEY_ELEMENTS).
- A global's writability assumption is violated.
- A built-in method is monkey-patched.

**Mechanism:** the compiled code is full of *deoptimization points* — places where the compiler knows it can safely bail. At each point, there's metadata describing how to reconstruct the interpreter state (which machine registers/stack slots map to which interpreter registers). When a deopt triggers, V8's deoptimizer reads this metadata and builds a matching Ignition frame, then jumps to the interpreter.

Deopts are expensive — typically 2–20× the cost of one interpreter iteration, because the compiled code has to be discarded and the function re-tiered. Frequent deopts (a "deopt loop") are a performance disaster. Lecture 14's IC content explains how to avoid them.

## The process/memory model: Isolates and Contexts (10 min)

V8's concurrency and isolation model is distinct from most VMs.

### Isolate

An **Isolate** is a self-contained V8 instance. It has:

- Its own heap.
- Its own set of compilation tiers and caches.
- Its own built-in functions.
- **One-thread-at-a-time access.** Two threads can share an Isolate only if they mutually exclude each other with an `Isolate::Scope`/`Locker`.

Isolates are independent: you can have multiple Isolates in a single process (one per thread), and they share no state. This is how Chromium gives each renderer one or more Isolates without worrying about cross-isolate bugs.

### Context

A **Context** is a JavaScript execution environment within an Isolate:

- Its own global object.
- Its own built-in object instances (each Context has its own `Array` constructor, its own `Object.prototype`, etc.).
- Created cheaply relative to an Isolate.

**Why both?** An Isolate is heavyweight — it has a heap, compilation state, and GC. A Context is lightweight — it's essentially a freshly-reset global environment sharing the Isolate's heap. Multiple Contexts coexist cheaply in one Isolate.

Chromium's usage:

- Each renderer process has a single Isolate (for the main JS execution) plus more for workers.
- Each frame (main frame + iframes from same origin post-Site Isolation) gets its own Context in that Isolate.
- `window` is the Context's global object.

The code:

- Isolate: [`src/execution/isolate.h`](https://source.chromium.org/chromium/chromium/src/+/main:v8/src/execution/isolate.h)
- Context: [`src/objects/contexts.h`](https://source.chromium.org/chromium/chromium/src/+/main:v8/src/objects/contexts.h)

### Handles

V8 objects live in the GC heap. C++ code that embeds V8 cannot hold raw pointers — they'd be invalidated by GC. V8's API uses **Handles**, which are pointers to pointers held in a side table (the HandleScope) that the GC updates on moves.

`Local<Value>` = a handle valid only while the current `HandleScope` is alive.
`Global<Value>` = a handle that outlives HandleScopes, manually managed.

HW8 (Embedding V8) exercises this.

## A tiny code excerpt — a bytecode handler (5 min)

Open [`src/interpreter/bytecode-generator.cc`](https://source.chromium.org/chromium/chromium/src/+/main:v8/src/interpreter/bytecode-generator.cc) and/or the interpreter loop.

Ignition bytecode handlers are implemented not in hand-coded assembly but in **CodeStubAssembler** (CSA) or **Torque** — a DSL that compiles down through TurboFan to produce efficient handler code for every target CPU architecture.

Show students the enum:

```cpp
// src/interpreter/bytecodes.h
#define BYTECODE_LIST(V, V_TSA)                                           \
  /* Extended width operands */                                           \
  V(Wide, ImplicitRegisterUse::kNone)                                     \
  V(ExtraWide, ImplicitRegisterUse::kNone)                                \
                                                                          \
  /* Loading the accumulator */                                           \
  V(LdaZero, ImplicitRegisterUse::kWriteAccumulator)                      \
  V(LdaSmi, ImplicitRegisterUse::kWriteAccumulator, OperandType::kImm)    \
  V(LdaUndefined, ImplicitRegisterUse::kWriteAccumulator)                 \
  V(LdaNull, ImplicitRegisterUse::kWriteAccumulator)                      \
  V(LdaTheHole, ImplicitRegisterUse::kWriteAccumulator)                   \
  V(LdaTrue, ImplicitRegisterUse::kWriteAccumulator)                      \
  V(LdaFalse, ImplicitRegisterUse::kWriteAccumulator)                     \
  V(LdaConstant, ImplicitRegisterUse::kWriteAccumulator, ...)             \
  /* ... many more ... */
```

Every `V(...)` is one bytecode. The macro expansion generates the handler boilerplate. Point out: `Lda` = load accumulator; `Sta` = store accumulator; `Mov` = move between registers. The naming is consistent and short.

## Live demo — bytecode, opt trace, deopt (20 min)

### Demo setup

You need `d8`. Either:

```bash
# From a Chromium checkout:
./out/Default/d8 --help

# Or standalone V8:
cd /path/to/v8/v8
./out.gn/x64.release/d8 --help
```

Create a file `demo.js`:

```javascript
function add(a, b) {
  return a + b;
}

// Force optimization
for (let i = 0; i < 100000; i++) add(i, i + 1);
```

### Demo 1 — bytecode

```bash
d8 --print-bytecode demo.js
```

Show the bytecode dump for `add`. Point out:

- `Ldar a1` — load `b` into accumulator
- `Add a0, [0]` — add `a` to accumulator, using feedback slot 0
- `Return`

Explain each operand. Show students the feedback slot number — we'll see it used in Lecture 14.

### Demo 2 — see optimization happen

```bash
d8 --trace-opt demo.js
```

Output will include a line like:

```
[marking add ... for optimization]
[compiling method add ... using TurboFan]
[completed compiling method add ...]
```

(Exact wording varies by V8 version.) Point out: the function was interpreted initially, then TurboFan was invoked. Note that Sparkplug and Maglev compile concurrently and may not show up in `--trace-opt` alone; use `--trace-opt --trace-maglev` for more detail.

### Demo 3 — see optimized code

```bash
d8 --print-opt-code demo.js
```

Enormous output — the generated assembly for `add`. Scroll through. Point out:

- It's actual x86-64 / ARM machine code.
- There are **checkpoints** for deoptimization (look for labels containing "deopt" or "lazy_deopt").
- The code is specialized for small-integer addition.

Don't try to read the whole thing. The point is: that is *compiled machine code for `add`*, produced by TurboFan.

### Demo 4 — trigger a deopt

Modify the file:

```javascript
function add(a, b) {
  return a + b;
}

// Warm up with integers — TurboFan compiles for int+int
for (let i = 0; i < 100000; i++) add(i, i + 1);

// Now call with strings — feedback violated!
console.log(add("hello", "world"));
```

Run:

```bash
d8 --trace-opt --trace-deopt demo.js
```

You'll see the compile, followed by something like:

```
[bailout (kind: deopt-eager, reason: not a Smi): ...  (opt #0) @5, FP to SP delta: N]
```

The deoptimization unwound the optimized frame and restarted `add` in the interpreter. Narrate: *the machine code assumed integers. It got strings. It bailed.*

### Demo 5 — inspect objects

```bash
d8 --allow-natives-syntax
```

Interactive session:

```javascript
function Point(x, y) { this.x = x; this.y = y; }
var p = new Point(1, 2);
%DebugPrint(p);
```

Output will dump V8's internal representation of `p`, including its **Map** (hidden class). Note the Map pointer. Lecture 14 is entirely about what this means.

## Summary / cheat sheet

Put on the board for students to copy:

```
Ignition     — interpreter        — cheap, universal
Sparkplug    — baseline JIT       — 2× faster, near-free compile
Maglev       — mid optimizer      — ~4× faster than Sparkplug, fast compile
TurboFan     — top optimizer      — peak perf, slow compile
(Turboshaft) — TurboFan's new backend, gradually replacing

Tier-up     : hot + stable feedback
Tier-down   : speculation failed (deopt)
Isolate     : V8 instance (heap, one thread at a time)
Context     : global environment within an Isolate
FeedbackVector: per-function observation table
```

## Reading for next lecture

- v8.dev: [Fast properties in V8](https://v8.dev/blog/fast-properties)
- v8.dev: [Adventures in the land of substrings and regexps](https://v8.dev/blog/speeding-up-regular-expressions) — not directly next lecture, but a great tour
- v8.dev: [Elements kinds in V8](https://v8.dev/blog/elements-kinds)

## Instructor notes

- HW7 is assigned this lecture.
- The "tiers" concept is the unifying frame for the whole unit. Drill it.
- `--print-bytecode` is visceral. Many students have never seen bytecode before. Give them time to just read it.
- If students can't build `d8`, there's a hosted alternative at [chromestatus.com](https://chromestatus.com) — but the real learning comes from a local `d8`. Prioritize getting it built.

---

[← Unit III README](./README.md) · [Next: L14 — Hidden Classes & ICs →](./L14-hidden-classes-ics.md)

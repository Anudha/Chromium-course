# HW7 — V8 Under the Microscope

**Assigned:** Week 7 · **Due:** End of Week 7 · **Weight:** ~2.3% of course grade

## Goal

Observe V8's compilation pipeline firsthand: capture bytecode, watch tier-up to TurboFan, trigger a deoptimization, and interpret the output.

## Background

In L13 we saw the tier hierarchy (Ignition → Sparkplug → Maglev → TurboFan) and the mechanisms of tier-up and deoptimization. This assignment asks you to use `d8` flags to observe each step on code you write.

## Requirements

- A working `d8` binary (from your Chromium HW2 checkout in `out/Default/d8`, or from a standalone V8 build). If you don't have one, **request a lab machine by the second day of the week**.

## Deliverables

Submit a folder `HW7-<unityID>/` containing:

1. `functions.js` — the JavaScript you wrote
2. `bytecode.txt` — output of `d8 --print-bytecode`
3. `opt-trace.txt` — output of `d8 --trace-opt --trace-maglev`
4. `opt-code.txt` — output of `d8 --print-opt-code` (at least the relevant section)
5. `deopt-trace.txt` — output of `d8 --trace-opt --trace-deopt`
6. `report.md` — analysis (described below)
7. `AI-USAGE.md`

## Step 1 — write two functions

Write two JavaScript functions in `functions.js`:

- **`hot(a, b)`**: a small arithmetic function that, when called in a loop with consistent types, will reach TurboFan. Keep it under 5 lines. Example: `function hot(a, b) { return a * b + a - b; }`.
- **`unstable(x)`**: a function that, when called with changing argument types, will trigger a deoptimization after initial optimization. Keep it small.

## Step 2 — capture bytecode

```bash
d8 --print-bytecode functions.js > bytecode.txt
```

In `report.md`, for the `hot` function's bytecode:

1. **Paste** the bytecode (5-15 lines).
2. **Explain each instruction**. For each line, state what it does in plain English (e.g., `Ldar a1` → "load the second parameter into the accumulator").
3. **Identify every feedback slot** (the `[N]` operands) and explain what type of feedback each slot collects.

## Step 3 — trigger optimization

Expand `functions.js` so that `hot` is called in a warm-up loop:

```javascript
function hot(a, b) { return a * b + a - b; }
for (let i = 0; i < 100000; i++) hot(i, i + 1);
```

Run with optimization tracing:

```bash
d8 --trace-opt --trace-maglev functions.js > opt-trace.txt 2>&1
```

In `report.md`:

1. **Paste** the lines that mention `hot` getting compiled.
2. **Identify which tier(s)** compiled `hot` (Sparkplug, Maglev, TurboFan — you may see several).
3. **Answer**: approximately how many iterations of the warm-up were needed before TurboFan kicked in? (Hint: add counters or use multiple warm-ups of different lengths.)

## Step 4 — inspect the optimized code

```bash
d8 --print-opt-code functions.js > opt-code.txt 2>&1
```

In `report.md`:

1. **Paste** (or reference) a small segment of the machine code for `hot`. (It's long; point to it rather than copy all of it.)
2. **Identify** at least one deoptimization checkpoint in the output (look for labels like `Deoptimization bailout`, or lines referring to `deopt`).
3. **Answer**: which architecture is this assembly for? How can you tell?

## Step 5 — trigger a deopt

Modify `functions.js` so `unstable` is first warmed up with one type, then called with another:

```javascript
function unstable(x) { return x + 1; }

// warm up with ints — TurboFan optimizes for int
for (let i = 0; i < 100000; i++) unstable(i);

// now break the assumption
unstable("oops");
```

Run:

```bash
d8 --trace-opt --trace-deopt functions.js > deopt-trace.txt 2>&1
```

In `report.md`:

1. **Paste** the deopt lines.
2. **Explain the deopt reason** (what did the string break?).
3. **Answer**: after the deopt, does V8 re-optimize `unstable`? Why or why not?

## Step 6 — a thoughtful question

Answer in 4–6 sentences in `report.md`:

> **Question:** You're building a library whose hot path takes a callback from user code. Based on what you saw in this HW, what's your design advice for the library author if they want to keep their library's hot path fast?

Good answers touch on: the user-callback can deopt the library's function via polymorphism or mixed types; consider passing primitives rather than objects; consider separate callsites for separate types; warn users in the API docs.

## Submission

Zip the folder as `HW7-<unityID>.zip`.

## Why this is AI-resistant

- The bytecode and machine code output are version-specific and enormous. AI routinely hallucinates these.
- The opt-trace and deopt-trace lines have version-specific formats and specific timings.
- The grader verifies file outputs are real by checking for V8 version strings and plausible formatting.

## Grading rubric

| Component | Points |
|---|---|
| `functions.js` defines both functions correctly | 5 |
| Bytecode captured and correctly explained instruction-by-instruction | 25 |
| Optimization trace captured, tier identified | 15 |
| Optimized code captured, deopt checkpoint identified | 15 |
| Deopt triggered and captured | 15 |
| Deopt reason explained correctly | 10 |
| Thoughtful question answered substantively | 15 |
| **Total** | **100** |

## Hints

- `d8 --help` lists all tracing flags. There are dozens.
- `--trace-opt-verbose` gives more detail if `--trace-opt` is sparse.
- If `--print-opt-code` produces too much output, pipe through `grep -A 200 'hot'` to find the relevant section.
- If you can't trigger a deopt, try more creative type-changes — a hidden-class shift also works: optimize the function for one object shape, then pass a different shape.

## AI usage policy

You may use AI to interpret V8 trace formats and explain what a bytecode does. **The `functions.js` must be written by you** and the outputs must come from your own runs of `d8`. Cite usage in `AI-USAGE.md`.

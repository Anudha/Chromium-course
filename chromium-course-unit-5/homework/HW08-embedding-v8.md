# HW8 — Embedding V8

**Assigned:** Week 8 · **Due:** End of Week 8 · **Weight:** ~2.3% of course grade

## Goal

Build a working V8 embedder: a C++ program that creates an Isolate, runs JavaScript, exposes a C++ function to JS, and handles exceptions gracefully.

## Background

Node.js, Deno, Cloudflare Workers, and Chromium itself are all V8 embedders. They all use the same fundamental C++ API we saw in L16. This HW asks you to write your own.

## Requirements

- A V8 checkout with a **monolithic** build completed. (The course site has a script that builds V8 with the right args. On a lab machine the build is pre-done.)
- Comfort with C++ or a pair-programming partner who has it.
- Working C++ toolchain (`g++` 10+, `clang++` 14+, or MSVC 2022).

## Deliverables

Submit a folder `HW8-<unityID>/` containing:

1. `embedder.cc` — your C++ source
2. `Makefile` or `build.sh` — how to build it
3. `script.js` — the JavaScript your embedder runs (read from disk)
4. `README.md` — build/run instructions specific to your setup
5. A **screen recording or `asciinema` cast** of your program running end-to-end (`demo.mp4`, `.webm`, `.gif`, or `.cast`)
6. `report.md` — short reflection (described below)
7. `AI-USAGE.md`

## Required features of your embedder

### Feature 1 — read JS from a file

Your embedder must take a path to a `.js` file as a command-line argument and run its contents. Example:

```bash
./embedder script.js
```

Not hardcoded. Your program must open the file, read the contents, and pass to V8 as the script source.

### Feature 2 — expose a C++ function to JS

Expose a function called `input(prompt)` that:

- Takes a string prompt.
- Prints the prompt to stdout.
- Reads a line from stdin.
- Returns the line as a JS string.

From JS, this should work:

```javascript
const name = input("What's your name? ");
print("Hello, " + name);  // you may also need to expose `print` or use a built-in
```

You may expose helper functions (`print`, etc.) as needed.

### Feature 3 — expose a C++ function that returns a number

Expose a function called `timeMs()` that returns the current time in milliseconds as a number (use C++'s `std::chrono::steady_clock` or similar). From JS:

```javascript
const t0 = timeMs();
// ... something
const t1 = timeMs();
print("Elapsed: " + (t1 - t0) + " ms");
```

### Feature 4 — handle uncaught exceptions

If the JS throws an uncaught exception, your embedder must:

- **Not crash.**
- Print the exception message, filename, and line number to stderr.
- Print the JS stack trace.
- Exit with non-zero status.

Use a `v8::TryCatch` and a proper `ReportException` helper as shown in L16.

### Feature 5 — exit cleanly

All V8 resources disposed in the correct order. No sanitizer warnings when run under ASan (if you can build with ASan, great; if not, state so in `README.md`).

## `script.js` demonstration

Your `script.js` must demonstrate all four features in one run:

- Call `input` at least once.
- Call `timeMs` at least twice.
- **Deliberately throw** an uncaught exception near the end to prove the exception handler works.

Example:

```javascript
const name = input("What's your name? ");
print("Hello, " + name + "!");

const t0 = timeMs();
let s = 0;
for (let i = 0; i < 1_000_000; i++) s += i;
const t1 = timeMs();

print("Computed " + s + " in " + (t1 - t0) + " ms");

// Now crash, to exercise exception handling:
throw new Error("Intentional: end-of-script demonstration.");
```

## Report

In `report.md`, answer (2–4 sentences each):

1. **Where did you put your `HandleScope`s?** You need at least one in `main()`. Did you need any inside your `input` or `timeMs` callbacks? Why or why not?
2. **What happens if you skip `Isolate::Scope`?** Try it (or explain what V8 would do). What does this tell you about V8's threading model?
3. **Describe one bug you introduced and fixed** during development. (Students always have one; lying is obvious.) What was the symptom? How did you diagnose it?
4. **If you were building a real scripting runtime** (like a little game engine with JS scripting), what's one feature from this HW that's insufficient for real use, and how would you improve it?

## Screen recording

15–60 seconds. Show:

- Your build command succeeding.
- Running the embedder with `./embedder script.js`.
- Typing input in response to the `input()` prompt.
- The timing output.
- The exception output at the end.

`asciinema rec demo.cast` is a clean lightweight way to record terminal sessions.

## Build hints

Recommended V8 `args.gn`:

```
is_debug = false
v8_monolithic = true
v8_use_external_startup_data = false
use_custom_libcxx = false
is_clang = true
```

Build command:

```bash
autoninja -C out/embedder v8_monolith d8
```

Link command (adjust paths):

```bash
g++ -std=c++20 -pthread -Iv8/include \
    embedder.cc \
    v8/out/embedder/obj/libv8_monolith.a \
    -o embedder -ldl
```

## Submission

Zip the folder as `HW8-<unityID>.zip`.

## Why this is AI-resistant

- Your recording shows a real program running on your machine.
- Build errors are incredibly idiosyncratic to the V8 version, OS, and toolchain you use. AI-generated embedder code will almost always fail to build without at least some hand-fixing.
- The four report questions require reflection on your specific journey.

## Grading rubric

| Component | Points |
|---|---|
| Program builds without warnings | 10 |
| Feature 1: reads JS from a file | 10 |
| Feature 2: `input()` works | 15 |
| Feature 3: `timeMs()` works | 10 |
| Feature 4: uncaught exceptions handled gracefully | 20 |
| Feature 5: clean shutdown | 5 |
| Screen recording shows all features | 10 |
| Report: thoughtful answers to all four questions | 20 |
| **Total** | **100** |

## AI usage policy

This is a C++ assignment with a notoriously finicky API. AI help is welcome for API syntax and tracking down linker errors. **The design decisions in your embedder — layout of functions, error handling choices, what you put in `main` vs. helpers — must be yours.** Cite AI usage in `AI-USAGE.md`, including which specific errors you resolved with AI help.

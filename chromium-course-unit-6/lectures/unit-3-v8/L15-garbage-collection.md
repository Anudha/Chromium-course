# Lecture 15 — Garbage Collection: Orinoco, Oilpan, and Generational Marking

| | |
|---|---|
| **Unit** | III — V8 and JavaScript |
| **Week** | 8 |
| **Duration** | 1.5 hours |
| **Demo** | `--trace-gc` on allocation-heavy workloads; heap snapshots in DevTools |

## Learning objectives

Students can:

1. Describe generational GC and the weak generational hypothesis.
2. Distinguish V8's young-generation (scavenger) and old-generation (mark-sweep-compact) collectors.
3. Explain tri-color marking and why incremental/concurrent marking is necessary.
4. Describe Oilpan's role in Blink and how it differs from Orinoco.
5. Interpret `--trace-gc` output and heap snapshots.

## Opening hook (5 min)

Run:

```bash
d8 --trace-gc -e "
for (let i = 0; i < 100; i++) {
  const big = new Array(100000).fill(i);
}
"
```

Output will look roughly like:

```
[...:0x... Mark-sweep 0.5 (2.0) -> 0.4 (2.0) MB, 3.2 / 0.0 ms  (average mu = 0.998, current mu = 0.998) allocation failure; GC in old space requested]
[...:0x... Scavenge 2.0 (3.0) -> 1.0 (3.0) MB, 1.1 / 0.0 ms  (average mu = 0.999, current mu = 0.999) allocation failure]
...
```

Ask: *"What are `Scavenge` and `Mark-sweep`? Why do we get so many of them for a hundred allocations? What's `mu`?"*

By end of lecture students can read every field. For now, note: **V8 has at least two GC algorithms running concurrently**, each for a different purpose. Understanding why is most of the lecture.

## The fundamental problem (5 min)

JavaScript code allocates objects freely and doesn't free them. The runtime must figure out which objects are no longer reachable and reclaim their memory. This is garbage collection.

Naive GC: stop the world, walk all objects from roots (global, stack, registers), mark the reachable ones, free the rest. Simple, correct, and catastrophic for user experience — a GC pause of 100 ms feels like a freeze.

Modern GCs split this problem into techniques that trade complexity for pause reduction:

- **Generational**: collect young objects more often than old, because most die young.
- **Incremental**: break the mark/sweep work into chunks interleaved with execution.
- **Concurrent**: do GC work on background threads while the main thread runs.
- **Parallel**: use multiple threads during the stop-the-world phases.

V8 does all four.

## The weak generational hypothesis (5 min)

> **Most objects die young.**

This is the oldest and most robust empirical observation in GC research. A function allocates an object, uses it for a few lines, returns, and the object is garbage. Closures, temporaries, intermediate values — all short-lived. Long-lived objects are a minority.

Implication: **it's worth having a fast, specialized collector just for young objects.** Let it collect 90% of garbage at 10% of the cost. Keep old objects separate and collect them less often.

V8's heap reflects this:

```
V8 heap
┌──────────────────────────────────────────────────┐
│ Young generation (new space)    ~8 MB by default │
│ ┌──────────────────┬──────────────────┐          │
│ │   from-space     │    to-space      │          │
│ │   (current)      │    (empty)       │          │
│ └──────────────────┴──────────────────┘          │
│                                                  │
│ Old generation (old space)     grows as needed   │
│ ┌────────────────────────────────────────────┐   │
│ │ Objects that survived ≥2 young-gen GCs     │   │
│ └────────────────────────────────────────────┘   │
│                                                  │
│ Large object space             for big objects   │
│ Code space                     for JIT code      │
│ Map space                      for hidden classes│
│ (several other specialized spaces)               │
└──────────────────────────────────────────────────┘
```

Every allocation starts in young generation (unless the object is huge or known to be long-lived). When young-gen fills, the **scavenger** runs.

## The scavenger (Cheney's algorithm, with tweaks) (15 min)

Young generation is split into two equal-sized semispaces: **from-space** and **to-space**. Allocations only happen in to-space. from-space is empty, waiting.

Wait — those labels look swapped. Yes, and here's the trick: **they swap names every GC.** The "to-space" is always where new things go. After a scavenge, the old to-space becomes the new from-space. Confusing initially; it's consistent if you read carefully.

### Algorithm (called scavenging, or Cheney's copying collector)

Starting state: to-space is full, from-space is empty.

1. Swap semispaces: the full one becomes from-space, the empty one becomes to-space.
2. For each GC root (global, stack, registers): if the root points into from-space, **copy** the object to to-space. Update the root pointer to the new location. Leave a **forwarding pointer** in the from-space original.
3. For each object copied to to-space (processed in order): scan its fields. For each field that points into from-space:
   - If the pointed-to object has a forwarding pointer (already copied), update our field to the forwarded address.
   - Else, copy the object to to-space, install a forwarding pointer, update our field to the new address.
4. When all objects in to-space have been scanned, done. from-space is now garbage — reclaim all of it en masse.

### Why this is fast

- **Only live objects are touched.** Dead objects are never visited. The cost is proportional to live data, not total allocated data.
- **Copying compacts automatically.** Live objects are packed contiguously in to-space; no fragmentation.
- **Allocation is bumping a pointer.** To-space has a simple "next free" pointer. Allocation is `ptr += size; return old_ptr;`. Faster than most malloc implementations.

### Promotion

Objects that survive 2 scavenges (configurable, approximately) are **promoted** to old generation — copied from young to old instead of to-space. They're now considered long-lived and won't be bothered by subsequent scavenges.

### The cost

Scavenges **pause the main thread** — they're stop-the-world. But they're cheap because they only touch live data and only touch the (small) young generation. Typical scavenge: 1–3 ms. In V8 these are called **minor GCs**.

V8 also parallelizes scavenging across threads. Multiple threads walk and copy in parallel.

## The old-generation collector — mark-sweep-compact (15 min)

When old generation grows beyond a threshold, V8 runs a **major GC**. Old-gen objects are long-lived and numerous, so a full walk is expensive. The algorithm is mark-sweep-compact, but made incremental and concurrent to avoid catastrophic pauses.

### Tri-color marking

The basic mark-sweep algorithm is conceptually:

```
mark:
  color all objects WHITE
  color roots GRAY
  while there are GRAY objects:
    pick one, color it BLACK
    color all its children GRAY (if currently WHITE)
  all GRAY → BLACK means: BLACK = reachable, WHITE = garbage

sweep:
  free all WHITE objects
```

This is **tri-color marking** (Dijkstra, 1978). The invariant at the end: every BLACK object is reachable, every WHITE object is not. GRAY is the work queue.

### Incremental marking — why tri-color matters

Doing this "to completion" is long-paused. V8's approach: **do marking incrementally, interleaved with JS execution.** But JS running between marking steps can mutate the object graph, violating the mark invariant.

Specifically, the danger: suppose object A is BLACK (marked reachable) and object B is WHITE (not yet seen). JS runs: `A.ref = B`. Now A, a BLACK object, points to a WHITE object that has no other reference. The marker would miss B and we'd sweep it despite being reachable.

**The write barrier fixes this.** Every assignment `obj.field = other` in generated code includes a check:

```
if (obj is BLACK && other is WHITE):
    color other GRAY
```

This is the **Dijkstra-style write barrier**. The compiler inserts it on every pointer store in optimized code. Small runtime cost, but makes incremental marking correct.

### Concurrent marking

Even incremental marking on the main thread takes time. V8 takes this further: marking runs on **background threads** concurrently with JS. See [Concurrent marking in V8](https://v8.dev/blog/concurrent-marking).

This is harder — the mutator and marker race on shared memory — but the payoff is significant: main-thread GC pauses drop by ~60–70% on typical workloads. The write barrier is slightly more complex (must synchronize with the concurrent marker), but the pause budget frees up.

### The sweep and compact phases

Once marking completes, the collector needs to:

1. **Sweep** — walk the heap, free WHITE objects, add their space to free lists.
2. **Compact** (sometimes) — move live objects to defragment the heap, update all pointers to moved objects.

Sweeping can be concurrent (free lists are per-chunk; background threads can sweep while main thread runs). Compaction requires a stop-the-world moment to update pointers atomically, but only compacts fragmented pages rather than everything.

### Costs summary

| GC type | Pauses main thread? | How often | How long |
|---|---|---|---|
| Scavenge (minor) | Yes, briefly | Frequently (every few MB of young-gen alloc) | 1–3 ms typical |
| Incremental mark slice | Yes, briefly | During major GC buildup | < 1 ms per slice |
| Concurrent mark | No (background thread) | During major GC | — |
| Final mark / sweep / compact | Yes, briefly | Once per major GC | 5–30 ms typical |

The whole system is tuned so the main thread rarely pauses > 16 ms (one frame at 60 Hz).

## Orinoco — the name (3 min)

V8's modern GC is branded **Orinoco** (after a river in South America; they liked the name). "Orinoco" refers to the whole system: scavenger + major GC + concurrent marking + parallel scavenging + background sweeping.

See [Trash talk: the Orinoco garbage collector](https://v8.dev/blog/trash-talk) for the original overview and follow-up posts.

Name trivia aside, the relevant file trees in V8:

- [`src/heap/`](https://source.chromium.org/chromium/chromium/src/+/main:v8/src/heap/) — the whole heap implementation
- `src/heap/scavenger.cc` — the minor GC
- `src/heap/mark-compact.cc` — the major GC
- `src/heap/incremental-marking.cc` — incremental marker
- `src/heap/concurrent-marking.cc` — concurrent marker

## Oilpan — Blink's C++ tracing collector (15 min)

This is the part that surprises students.

**Problem:** Blink is a huge C++ codebase. DOM nodes, CSS rules, layout objects — millions of C++ objects with complex reference graphs. C++ has `shared_ptr`, but reference counting fails on cycles (a parent node points to children, children point back to parent — circular). Memory leaks everywhere.

**Solution:** Oilpan, a **tracing garbage collector for C++**. Blink objects that participate use Oilpan instead of manual memory management or shared_ptr.

### How Oilpan works

- C++ objects that want to be GC-managed inherit from `GarbageCollected<T>`.
- References between such objects use `Member<T>` (strong) or `WeakMember<T>` (weak), not raw pointers.
- Each class declares a `Trace(Visitor*)` method that visits all its Oilpan-managed members.
- Oilpan's GC periodically walks roots (specific C++ globals, stack), traces through `Trace` methods, marks reachable objects, sweeps the rest.

Example from Blink:

```cpp
class Node : public GarbageCollected<Node> {
 public:
  void Trace(Visitor* visitor) const {
    visitor->Trace(parent_);
    visitor->Trace(first_child_);
    visitor->Trace(next_sibling_);
  }
 private:
  Member<Node> parent_;
  Member<Node> first_child_;
  Member<Node> next_sibling_;
};
```

When Oilpan GC runs, it calls `Trace` on every reachable Oilpan object, discovers what they reference, marks those, recursively.

### Why a separate GC for C++?

Because Blink's objects have JS-side counterparts. A JS `Node` is a wrapper around a C++ `Node`. They must be collected in sync — neither should outlive the other wrongly. V8's heap and Oilpan's heap coordinate during GC through **cross-heap references**. When V8's GC runs, it tells Oilpan which JS wrappers are live, and vice versa.

Without Oilpan, Blink would leak DOM nodes constantly. Cycles between JS and DOM used to be a major source of memory leaks in old browsers.

See:
- v8.dev: [Oilpan library](https://v8.dev/blog/oilpan-library)
- Source: [`v8/include/cppgc/`](https://source.chromium.org/chromium/chromium/src/+/main:v8/include/cppgc/)

### Why "Oilpan"?

An oil pan catches dripping oil under an engine. Catches memory leaks. Got it.

## A tiny code excerpt — the write barrier (5 min)

The write barrier is inserted on every pointer store. In V8's generated code, it compiles down to approximately:

```
// pseudo-assembly after: obj.field = other
  mov [obj + offset], other    ; the actual store

  ; write barrier — skip if not needed
  test byte ptr [chunk_flags_of(obj)], kInNewSpace
  jnz  skip                    ; if obj is in new space, no old→new tracking needed
  test byte ptr [chunk_flags_of(other)], kInNewSpace
  jz   maybe_incremental       ; if other is old, only matters during marking

  ; record old→new edge for scavenger
  call RecordWriteIntoRememberedSet

skip:
  ; done
```

Two responsibilities:
1. **Remembered sets** for the scavenger: when an old-gen object points to a young-gen object (old→new pointer), record it so the scavenger knows to treat it as a root. Without this, scavenging couldn't be generational.
2. **Tri-color invariant** for concurrent marking: ensure WHITE objects reachable from BLACK don't slip through.

The full implementation is [`src/heap/heap-write-barrier.h`](https://source.chromium.org/chromium/chromium/src/+/main:v8/src/heap/heap-write-barrier.h). Incredible amount of engineering in a few hundred lines that runs on every pointer store.

## Live demo — `--trace-gc` and heap snapshots (15 min)

### Demo 1 — reading `--trace-gc` output

Run:

```bash
d8 --trace-gc <<'EOF'
for (let outer = 0; outer < 10; outer++) {
  const temp = [];
  for (let i = 0; i < 500000; i++) temp.push({x: i});
}
EOF
```

Output will interleave many `Scavenge` lines with occasional `Mark-sweep` lines. Walk through a single line:

```
[12345:0x00007f...] 234 ms: Scavenge 5.4 (8.0) -> 2.1 (8.0) MB, 1.8 / 0.0 ms  (average mu = 0.995, current mu = 0.994) allocation failure
        │      │          │                 │                    │    │           │                                    │
       pid   isolate       │                 │                    │    │           │                                    trigger
                         time since start    │                    │    │           mu = fraction of time spent in mutator (vs GC)
                                         before -> after heap size │    background GC time
                                                                   main thread pause in ms
```

Point out: pause is 1.8 ms, the heap shrank from 5.4 MB to 2.1 MB, `mu = 0.995` means 99.5% of recent time has been in real work, 0.5% in GC. Good.

### Demo 2 — force a major GC

Run:

```bash
d8 --trace-gc --expose-gc <<'EOF'
let survivors = [];
for (let outer = 0; outer < 10; outer++) {
  for (let i = 0; i < 50000; i++) {
    const keep = {x: i};
    if (i % 100 === 0) survivors.push(keep);   // promote every 100th
  }
}
gc();   // force major GC
EOF
```

Now you'll see the survivors promoted to old generation across scavenges, and the final `gc()` calling a major collection with `Mark-sweep` in the output. Point out the pause time is longer but still manageable.

### Demo 3 — DevTools heap snapshot

Open DevTools on a real page (an interesting SPA like google.com/search results, or your university homepage).

- Memory tab → Heap snapshot → Take snapshot.
- Browse the view. Groups show:
  - **(compiled code)** — JIT code
  - **(closure)**, **(array)**, **(system)**, **(map)** — internals
  - Named constructor groups (e.g., `HTMLDivElement`, `Object`, `Array`)

Sort by retained size. Drill into the top group. Show students:

- **Shallow size** — the memory the object itself occupies.
- **Retained size** — memory freed if this object and all its dominated descendants were collected.
- **Distance** — shortest path from root.

Then the **Comparison** view: take two snapshots (one before, one after an action like clicking a button) and diff them. Find new objects, deleted objects, leaks.

### Demo 4 — `--trace-gc-verbose`

For the deeply curious:

```bash
d8 --trace-gc --trace-gc-verbose -e "for(let i=0;i<1e6;i++) [].push(i);"
```

Fire hose of output. Shows per-space breakdowns, free list fragmentation, incremental marking state. Don't try to explain everything; point out that all this machinery is making the simple-sounding "allocate some objects" work fast.

## Practical guidance for JS authors (5 min)

Put on the board:

1. **Most allocations die young and are free.** Don't prematurely optimize object allocation.
2. **Watch for unintentionally-long-lived objects.** Caching an object in a module-level variable gives it eternal life. Is that what you meant?
3. **Avoid large allocations in hot loops.** Large objects go to large-object-space directly and can't use the fast scavenger path.
4. **Tight loops that allocate and discard are fine.** Scavenger handles these well.
5. **Leaks show up in heap snapshots.** When you suspect one, take two snapshots around the suspected leak and compare.

## Reading for next lecture

- v8.dev: [Embedder's Guide](https://v8.dev/docs/embed)
- V8 source: [`samples/`](https://source.chromium.org/chromium/chromium/src/+/main:v8/samples/) directory — working embedder examples

## Instructor notes

- HW8 is assigned this lecture.
- Tri-color marking is the hardest abstract concept of the unit. Use the write-barrier demo to make it concrete.
- Students often ask "why not just use Rust?" — answer: JS exists, the web exists, Chromium has to run JS at high speed. The question is how.
- Heap snapshots in DevTools are underused. Make time for the demo.

---

[← L14](./L14-hidden-classes-ics.md) · [Unit III README](./README.md) · [Next: L16 — Embedding V8 →](./L16-embedding-v8.md)

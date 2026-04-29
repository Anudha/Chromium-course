# Lecture 14 — Hidden Classes, Inline Caches, and the Shape of Fast JS

| | |
|---|---|
| **Unit** | III — V8 and JavaScript |
| **Week** | 7 |
| **Duration** | 1.5 hours |
| **Demo** | Observed IC state transitions: monomorphic → polymorphic → megamorphic |

## Learning objectives

Students can:

1. Describe V8's hidden class (Map) as a concrete in-memory data structure.
2. Trace hidden-class transitions for a sequence of property additions.
3. Distinguish monomorphic, polymorphic, and megamorphic inline cache states.
4. Predict performance differences from object-construction patterns.
5. Identify the optimization implications of Elements Kinds on arrays.

## Opening hook (5 min)

Put this on the projector and run it:

```javascript
// Version A
function makeA(n) {
  const a = {};
  a.x = n;
  a.y = n + 1;
  return a;
}

// Version B
function makeB(n) {
  const b = {};
  b.y = n + 1;
  b.x = n;
  return b;
}

function sumX(arr) {
  let s = 0;
  for (const o of arr) s += o.x;
  return s;
}

// Measure
function bench(make, label) {
  const arr = [];
  for (let i = 0; i < 1_000_000; i++) arr.push(make(i));
  for (let i = 0; i < 5; i++) sumX(arr);   // warm up
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) sumX(arr);
  console.log(label, (performance.now() - t0).toFixed(2), 'ms');
}

bench(makeA, 'A:');
// bench(makeB, 'B:');   // uncomment to compare
```

Run. Now swap: comment out `bench(makeA, ...)`, uncomment `bench(makeB, ...)`. Same output same number of operations. Same **data** — every object has `.x` and `.y` with the same values.

Report both timings. They'll be roughly identical (both are monomorphic — same hidden class across their array).

**Now the trick.** Run both benchmarks in the same script, with the same `sumX`:

```javascript
const arrA = []; const arrB = [];
for (let i = 0; i < 500_000; i++) { arrA.push(makeA(i)); arrB.push(makeB(i)); }
const mixed = arrA.concat(arrB);  // objects with DIFFERENT hidden classes

// benchmark sumX over `mixed`
```

`sumX(mixed)` is **slower** than `sumX(arrA)` or `sumX(arrB)` separately, despite doing the same work on the same data. Often 3–10× slower.

*Why?* The `o.x` in `sumX` sees two different hidden classes — `{x,y}` from A and `{y,x}` from B. The inline cache transitions from monomorphic to polymorphic, and the generated code from TurboFan gets a deopt. This lecture explains exactly what happens.

## Hidden classes (Maps) — the data structure (20 min)

### The problem

JavaScript objects are dictionaries: any property can be added at any time with any name. Naïve implementation: store each object as a hash table. Every property access is a hash lookup. Slow — probably 20–50 ns per access, every access.

C++ or Java objects are *fixed layout*: the compiler knows `x` is at offset 0, `y` is at offset 8. Property access is a single `mov` instruction. Fast — 1 ns.

V8's solution: **hidden classes**. Group objects with the same "shape" (same property names, same order) and store them in fixed-offset layout. When you access `o.x`, V8 checks *"is this object of a known shape where x is at offset 12?"* — if yes, direct memory load. If no, fall back to slower path.

The hidden class is called a **Map** in V8's code (confusingly, unrelated to `Map` the JS language feature — every V8 document has to clarify this). You'll see "Map" used throughout the V8 codebase.

### The actual layout

Every V8 heap object has a **Map pointer** as its first word. It looks like:

```
Object on heap:
┌────────────────┐
│  Map pointer   │  → points to the hidden class describing layout
├────────────────┤
│  Properties    │  → in-object or points to separate properties store
├────────────────┤
│  Elements      │  → indexed properties (array-ish)
├────────────────┤
│  In-object     │
│  property 0    │  ← if fast
│  (e.g., .x)    │
├────────────────┤
│  In-object     │
│  property 1    │
│  (e.g., .y)    │
└────────────────┘
```

The Map describes:
- The object's type (is it an ordinary object? array? function? …)
- The sequence of property names it has (its **descriptor array**).
- For each property, the storage location (in-object offset N, or in the separate properties backing store, or a dictionary slot).
- The object's size.
- Links to "transition Maps" — what Map to move to when properties are added.

### Transitions — how shapes evolve

This is the key concept. Watch what happens when you construct an object property-by-property:

```javascript
const a = {};           // step 1: empty object
a.x = 1;                // step 2: add property 'x'
a.y = 2;                // step 3: add property 'y'
```

V8 builds a **chain of Maps**, connected by transitions:

```
   Map0: {}                          ← empty object, no properties
   │  transition on adding 'x'
   ▼
   Map1: {x}                         ← one property 'x' at offset 12
   │  transition on adding 'y'
   ▼
   Map2: {x, y}                      ← two properties, x@12, y@16
```

After step 3, `a`'s Map pointer points to `Map2`. `Map2` knows `x` is at offset 12 and `y` at offset 16.

Now a second object:

```javascript
const b = {};       // uses Map0
b.x = 1;            // transitions to Map1 (reused!)
b.y = 2;            // transitions to Map2 (reused!)
```

`b` ends up pointing to the *same* Map2 as `a`. This is the magic: if you construct objects in the same order with the same properties, they share a hidden class. Code that access `.x` on Map2 can be specialized to "load from offset 12" and it works for every object sharing Map2.

### Order matters — the opening hook explained

```javascript
const c = {};
c.y = 2;       // Map0 → Map1': {y} (different from Map1)
c.x = 1;       // Map1' → Map2': {y, x}  (different from Map2!)
```

Now `c`'s hidden class is **Map2'**, a different Map from Map2, even though `c` has the same properties as `a` and `b`. In `Map2'`, `y` is at offset 12 and `x` is at offset 16. Different layout. Different Map pointer.

Code optimized for `Map2` doesn't work for `Map2'`. That's why version A and version B in the opening hook each work well alone (each consistent), but mixed they break monomorphism.

### The rule of thumb for fast object code

**Initialize objects with the same properties in the same order.** Either:

- Use a constructor function / class (V8 detects this pattern and builds shared Maps).
- Assign properties in a fixed order in plain object literals or sequences.

This is *the* performance rule for V8 object code, and it's why rule holds.

### What triggers "slow mode" (dictionary mode)

If an object:

- Gets too many properties (hundreds).
- Has properties deleted with `delete obj.x`.
- Has non-integer indexed keys mixed in.
- Has properties defined with `Object.defineProperty` with non-default descriptors.

…V8 may convert it to **dictionary mode** — an actual hash table. Properties are stored in a hash map, accesses cost a hash lookup each, no shared hidden class. You'll see this in DevTools as "slow" property access.

This is rare in well-written code but catastrophic when it happens. Watch for `delete`.

## Elements: the array story (10 min)

Array-indexed properties (`arr[0]`, `arr[1]`, ...) are stored separately from named properties, in the **elements** backing store. V8 specializes the storage based on what's in it — the **Elements Kind**.

The main elements kinds form a lattice that can only move in one direction (toward more general). A backing store goes from specific to general, never back:

```
           PACKED_SMI_ELEMENTS          [1, 2, 3]            ← small ints only, no holes
                  │
                  ▼
           HOLEY_SMI_ELEMENTS           [1, , 3]             ← small ints with holes
                  │
                  ▼
           PACKED_DOUBLE_ELEMENTS       [1.1, 2.2, 3.3]      ← doubles only, no holes
                  │
                  ▼
           HOLEY_DOUBLE_ELEMENTS        [1.1, , 3.3]
                  │
                  ▼
           PACKED_ELEMENTS              [1, "hi", {}]        ← arbitrary tagged values
                  │
                  ▼
           HOLEY_ELEMENTS               [1, , {}]            ← arbitrary + holes
                  │
                  ▼
           DICTIONARY_ELEMENTS          (sparse)             ← hash table
```

Why this matters:

- **PACKED_SMI_ELEMENTS** stores raw 32-bit ints unboxed. Access is a single machine load.
- **PACKED_DOUBLE_ELEMENTS** stores raw 64-bit doubles unboxed.
- **PACKED_ELEMENTS** stores tagged pointers; every access may need to un-tag.
- **HOLEY_*** variants must check each slot for the "hole" value before using — extra branch.
- **DICTIONARY_ELEMENTS** is full hash lookup — slow.

**Operations that transition downward include:**

- Inserting an element of a broader type (`[1,2,3]; arr.push("oops")` → PACKED_ELEMENTS).
- Creating holes (`const a = []; a[0] = 1; a[2] = 3;` → HOLEY_SMI_ELEMENTS).
- `delete arr[1]` → holey.
- Sparse writes (`arr[100000] = 1`) → may flip to DICTIONARY.

### Performance implications

```javascript
// Fast — stays PACKED_SMI_ELEMENTS
const a = [];
for (let i = 0; i < 1000; i++) a.push(i);

// Slow — HOLEY_ELEMENTS from the start (preallocated with holes)
const b = new Array(1000);
for (let i = 0; i < 1000; i++) b[i] = i;
```

The first one grows and stays packed. The second one allocates an array of 1000 holes, gradually filling them — but the elements kind is HOLEY from the start and stays holey.

Reading: [Elements kinds in V8](https://v8.dev/blog/elements-kinds).

## Inline caches — where hidden classes meet compiled code (15 min)

An **inline cache (IC)** is a fast-path check at a property access site, remembering what hidden class it has seen so it can skip the slow lookup.

### Monomorphic IC

First time a property access site `o.x` runs, V8:

1. Looks up `x` on whatever `o` is (slow path).
2. Remembers: "I saw Map M, x is at offset 12."
3. On next access, if `o.Map == M`, directly load offset 12. Else, fall back.

This is **monomorphic** — the site has seen exactly one Map. Generated machine code looks like:

```asm
  cmp [o], <Map M>       ; compare object's map pointer to cached Map
  jne slow_path
  mov rax, [o + 12]      ; load x — one instruction!
```

This is why fast JS is fast. One compare, one conditional jump, one load. That's it.

### Polymorphic IC

If the site sees a second Map:

1. IC becomes **polymorphic** — stores up to 4 Maps and their offsets.
2. Generated code checks each cached Map in sequence.

```asm
  cmp [o], <Map M1>
  je  load_offset_12
  cmp [o], <Map M2>
  je  load_offset_16
  cmp [o], <Map M3>
  je  load_offset_12
  cmp [o], <Map M4>
  je  load_offset_20
  jmp slow_path
```

Cost: 2–4 compares instead of one. Still fast, but measurably slower than monomorphic. Maybe 1.5–2× the cost.

### Megamorphic IC

5 or more Maps seen. The IC gives up caching per-Map and goes **megamorphic**: it falls back to a generic lookup table keyed by `(Map, property name)`.

- Lookup time: small constant but ~5–10× slower than monomorphic.
- Critically: TurboFan won't specialize megamorphic sites. Your function stays in lower tiers.

### State transitions

```
   ┌──────┐   sees new Map   ┌──────────┐   >4 Maps    ┌─────────────┐
   │ MONO │ ────────────────▶│   POLY   │ ────────────▶│ MEGAMORPHIC │
   └──────┘                  └──────────┘              └─────────────┘
                                                              │
                                                              │  stable for a while
                                                              ▼
                                                       (stays megamorphic —
                                                        no backing-off)
```

**Transitions are one-way.** Once a site is megamorphic, it doesn't recover. Your hot code paths must stay monomorphic or low-poly to stay fast.

### What this means for you

If you have code like:

```javascript
function getName(obj) { return obj.name; }
```

and you call `getName` with people, animals, cars, and widgets, each with different shapes — `getName`'s IC goes mega. The function stays slow forever (in that execution).

The fix is either:
- Give all those types the same shape (constructor function, same property order).
- Write separate helpers per type so each is monomorphic.
- Accept the cost if it's not hot.

## A tiny code excerpt — V8's IC state machine (5 min)

Open [`src/ic/ic.h`](https://source.chromium.org/chromium/chromium/src/+/main:v8/src/ic/ic.h) and search for `InlineCacheState`:

```cpp
enum InlineCacheState {
  NO_FEEDBACK,
  UNINITIALIZED,   // never executed
  MONOMORPHIC,     // one map
  RECOMPUTE_HANDLER,
  POLYMORPHIC,     // up to ~4 maps
  MEGAMORPHIC,     // too many maps, generic lookup
  GENERIC,
};
```

These states correspond exactly to what we just drew. The transitions are implemented across the IC files — stubs for the fast paths, runtime calls for state transitions.

## Live demo — observing IC transitions (20 min)

This is the heart of the lecture. Run these with `d8 --allow-natives-syntax`.

### Demo 1 — Map inspection

```javascript
function Point(x, y) { this.x = x; this.y = y; }
const p1 = new Point(1, 2);
const p2 = new Point(3, 4);
const p3 = new Point(5, 6);

%HaveSameMap(p1, p2);   // true — monomorphic construction
%HaveSameMap(p1, p3);   // true

%DebugPrint(p1);
```

The `%DebugPrint` output shows the Map pointer. Run it on p1, p2, p3 — note all three have the *same* map pointer.

### Demo 2 — order destroys sharing

```javascript
function MakeA() { const o = {}; o.x = 1; o.y = 2; return o; }
function MakeB() { const o = {}; o.y = 2; o.x = 1; return o; }

const a1 = MakeA();
const b1 = MakeB();

%HaveSameMap(a1, b1);   // false!
%DebugPrint(a1);
%DebugPrint(b1);
```

Different Map pointers. Point them out explicitly.

### Demo 3 — add a property in different orders after the fact

```javascript
function Point() {}
const p1 = new Point();
const p2 = new Point();

p1.x = 1;
p1.y = 2;

p2.y = 2;   // different order!
p2.x = 1;

%HaveSameMap(p1, p2);   // false
```

Even though `Point` is shared, the *instances* have diverged because properties were added in different orders. The Map chain branches.

### Demo 4 — IC state progression

This takes a bit of care because `d8` doesn't easily expose IC state directly. One workaround is `--trace-ic`:

```bash
d8 --trace-ic demo-ic.js
```

where `demo-ic.js` is:

```javascript
function get(o) { return o.x; }

// Phase 1: monomorphic
for (let i = 0; i < 20; i++) get({x: 1, y: 2});

// Phase 2: polymorphic — second Map
for (let i = 0; i < 20; i++) get({x: 1, y: 2, z: 3});

// Phase 3: megamorphic — many Maps
for (let i = 0; i < 20; i++) {
  const obj = {x: 1};
  obj['k' + i] = i;   // unique shape per iteration
  get(obj);
}
```

`--trace-ic` output will show lines like:

```
[LoadIC in ~get ...]: 0->0.MONOMORPHIC
[LoadIC in ~get ...]: 0.MONOMORPHIC->0.POLYMORPHIC
[LoadIC in ~get ...]: 0.POLYMORPHIC->0.MEGAMORPHIC
```

Walk through these with students. Each line is an IC state transition at a specific source location.

### Demo 5 — Elements Kind transitions

```javascript
const a = [1, 2, 3];              // PACKED_SMI_ELEMENTS
%DebugPrint(a);

a[10] = 11;                        // holes introduced
%DebugPrint(a);                    // now HOLEY_SMI_ELEMENTS

a[0] = 1.5;                        // double sneaks in
%DebugPrint(a);                    // now HOLEY_DOUBLE_ELEMENTS

a[1] = "str";                      // heterogeneous
%DebugPrint(a);                    // now HOLEY_ELEMENTS
```

The `DebugPrint` output includes `elements kind`. Point out each transition.

### Demo 6 — the opening hook, with measurement

Return to the opening benchmark. This time, add after each phase:

```javascript
const uniqSet = new Set(mixed.map(o => %GetObjectHash(o)));  // or similar
```

Or more practically, split into two arrays deliberately and time `sumX` on each alone vs. on the concatenation. Explain the 3–10× slowdown as "the IC at `o.x` in `sumX` went from MONO to POLY."

## Closing guidance — fast JS rules (5 min)

Put on the board:

1. **Construct objects in the same order.** Use classes or factory functions. Don't add properties ad-hoc.
2. **Avoid `delete`.** It forces dictionary mode. Set to `undefined` if you must "remove."
3. **Don't pre-allocate sparse arrays.** Avoid `new Array(N)`; use `[]` and `.push`.
4. **Keep arrays homogenous.** Don't mix ints with strings with objects in a hot array.
5. **Avoid monkey-patching built-ins after the fact.** Patching `Array.prototype.map` deopts a lot of code.
6. **Hot functions should see few shapes.** If your hot function accepts objects of many shapes, split it.

These rules aren't folklore. They correspond directly to mechanisms we saw: transitions, elements kinds, IC state.

## Reading for next lecture

- v8.dev: [Trash talk: the Orinoco garbage collector](https://v8.dev/blog/trash-talk)
- v8.dev: [Concurrent marking in V8](https://v8.dev/blog/concurrent-marking)
- v8.dev: [Oilpan library](https://v8.dev/blog/oilpan-library)
- v8.dev: [Pointer compression in V8](https://v8.dev/blog/pointer-compression)

## Instructor notes

- This is the densest lecture of the course. Pace yourself.
- The opening hook benchmark is great — practice it before class so numbers come out convincingly.
- If students don't have `d8` working, push office hours. The demos don't work without it.
- HW7 is due end of this week — it exercises `--print-bytecode`, `--print-opt-code`, and `--trace-deopt` directly.

---

[← L13](./L13-v8-architecture.md) · [Unit III README](./README.md) · [Next: L15 — GC →](./L15-garbage-collection.md)

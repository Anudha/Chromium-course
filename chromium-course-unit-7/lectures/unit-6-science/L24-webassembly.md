# Lecture 24 — WebAssembly: Near-Native in the Browser

| | |
|---|---|
| **Unit** | VI — The Web Platform for Science |
| **Week** | 12 |
| **Duration** | 1.5 hours |
| **Demo** | Atomify (LAMMPS-in-browser); compiling a custom C Verlet integrator to WASM with Emscripten |

## Learning objectives

Students can:

1. Describe what WebAssembly is at the binary format level — a portable, typed, stack-based VM.
2. Explain V8's WASM compilation tiers: Liftoff (baseline) and TurboFan (optimizing).
3. Use Emscripten to compile a C/C++ function and call it from JavaScript.
4. Explain why `crossOriginIsolated` (COOP + COEP) is required for WASM threads and how to enable it.
5. Use WASM SIMD intrinsics to parallelize a loop.
6. Describe when to use WASM vs. WebGPU for a scientific computation.

## Opening hook (5 min)

Open [andeplane.github.io/atomify](https://andeplane.github.io/atomify/) in a browser on the projector.

Type the following LAMMPS script into the editor and hit Run:

```lammps
# Lennard-Jones fluid, argon at 90K
units lj
dimension 3
boundary p p p
atom_style atomic
lattice fcc 0.8442
region box block 0 6 0 6 0 6
create_box 1 box
create_atoms 1 box
mass 1 1.0
pair_style lj/cut 2.5
pair_coeff 1 1 1.0 1.0 2.5
velocity all create 1.44 87287 loop geom
fix 1 all nvt temp 1.44 1.44 0.1
thermo 100
run 10000
```

A real-time molecular dynamics simulation of liquid argon starts running and visualizing in the browser. 864 atoms. LAMMPS, one of the world's most-used MD codes, running at 50% of native speed as WebAssembly. No installation. No CUDA. No MPI. Just a URL.

Ask: *"How does this work? LAMMPS is 1.5 million lines of C++. How does it run in a browser tab?"*

## What WebAssembly is (15 min)

### The binary format

WebAssembly (WASM) is a **binary instruction format for a stack-based virtual machine**. Key properties:

- **Portable**: the same `.wasm` binary runs on x86-64, ARM64, RISC-V, WebAssembly hosts on all platforms.
- **Typed**: functions have explicit typed signatures. Values are one of `i32`, `i64`, `f32`, `f64`, `v128` (SIMD), `funcref`, `externref`.
- **Memory-safe**: WASM code operates in a bounded linear memory (`WebAssembly.Memory`). All memory accesses are bounds-checked. There's no unguarded pointer arithmetic into arbitrary addresses.
- **Sandboxed**: WASM cannot call OS APIs directly. It can only call functions imported from JavaScript (or the embedding host).

### The text format (WAT)

WASM binary has a human-readable text format called WAT (WebAssembly Text Format). A function that adds two f32 values:

```wat
(module
  (func $add_f32 (export "add_f32")
        (param $a f32) (param $b f32)
        (result f32)
    local.get $a
    local.get $b
    f32.add)
)
```

You'd never write this by hand — compilers produce WASM. But reading WAT is like reading assembler — it tells you exactly what the machine executes.

### Linear memory

WASM programs have access to a **linear memory** — a flat, contiguous byte array. C/C++ programs compiled to WASM use this memory like they use RAM: stack, heap, global variables. In JavaScript:

```javascript
const memory = new WebAssembly.Memory({ initial: 256 });  // 256 × 64KB = 16 MB
// After module instantiation, access via ArrayBuffer:
const heap = new Float64Array(memory.buffer);
heap[0] = 3.14159;  // write into WASM's memory from JS
```

This shared `ArrayBuffer` is the primary bridge between JavaScript and WASM code: JS writes inputs, WASM reads and processes, JS reads results.

### Security: the WASM sandbox

WASM code cannot:
- Access memory outside its linear memory bounds (bounds checks on every load/store).
- Call arbitrary functions — only functions it imported explicitly.
- Access the DOM, network, filesystem — those require JS-exported functions as bridges.
- Escape its process sandbox — WASM is a guest in the renderer, which is already sandboxed (L18).

From Chromium's security model: a WASM module is a slightly weaker attacker than JavaScript, because it can't call eval or eval-like mechanisms. But it runs at much higher speed.

## V8's WASM compilation pipeline (10 min)

WASM, like JavaScript, goes through V8's tiered compilation. But the tiers are different because WASM is already typed and validated — V8 doesn't need to infer types.

```
.wasm binary
    │
    ▼
Decode + Validate   ← type checking, control-flow validation, import checks
    │
    ▼
Liftoff (baseline JIT)
    │  ← compiles immediately, one pass, no optimization
    │    generates ~2× slower code than native
    │    allows JS↔WASM to start running quickly
    │
    ▼  (in background)
TurboFan (optimizing JIT) ← now via Turboshaft backend
    │  ← more analysis, register allocation, SIMD lowering
    │    generates ~1.1–1.5× slower than native C for compute-heavy code
    │
    ▼
Native machine code (x86-64 / ARM64 / etc.)
```

Unlike JavaScript's tiers, WASM's Liftoff is not "interpreted" — it still JITs to machine code. And unlike JS, there's no feedback collection loop (types are known statically). TurboFan's WASM path optimizes based on static analysis alone.

**Reference**: v8.dev: [Liftoff: a baseline compiler for WebAssembly in V8](https://v8.dev/blog/liftoff).

### Performance expectation

For compute-bound scientific code with no I/O:
- WASM is typically **1.1–2× slower** than native compiled C++ with `-O3`.
- Some codebases achieve <10% overhead after TurboFan.
- WASM SIMD (`v128` type) allows using SSE2/AVX/NEON instructions, dramatically narrowing the gap.

For Atomify's LAMMPS: ~50% of native speed is consistent with the published benchmark. For simpler kernels (pure arithmetic loops), WASM can reach 90% of native.

## Emscripten — the compiler (15 min)

**Emscripten** ([emscripten.org](https://emscripten.org)) is the standard toolchain for compiling C/C++ to WASM. It wraps Clang, uses the WASM backend, and provides:

- C standard library (`libc`) implemented for WASM.
- POSIX-like filesystem emulation (using JS as the "OS").
- Bindings generator for calling JS from C and vice versa.
- Output: a `.wasm` file + a `.js` glue file.

### Compiling a custom Verlet integrator

Let's compile a real C function — a Velocity Verlet integrator for a simple harmonic oscillator (a mass on a spring, the textbook starting point for any particle physics simulation).

```c
// verlet.c
#include <emscripten/emscripten.h>
#include <math.h>
#include <string.h>

// Simple harmonic oscillator: F = -k*x
// State: positions x, velocities v, forces f — packed as float arrays

EMSCRIPTEN_KEEPALIVE
void verlet_step(
    float* x, float* v, float* f,
    int n, float k, float m, float dt
) {
    // Compute forces: F_i = -k * x_i (restoring force to origin)
    for (int i = 0; i < n * 3; i++) {
        f[i] = -k * x[i];
    }

    // Velocity Verlet integration:
    // v(t + dt/2) = v(t) + (f(t)/m) * (dt/2)
    // x(t + dt)   = x(t) + v(t + dt/2) * dt
    // f(t + dt)   = -k * x(t + dt)
    // v(t + dt)   = v(t + dt/2) + (f(t+dt)/m) * (dt/2)

    float half_dt = dt * 0.5f;
    float inv_m   = 1.0f / m;

    for (int i = 0; i < n * 3; i++) {
        v[i]  += f[i] * inv_m * half_dt;   // half kick
        x[i]  += v[i] * dt;                // drift
        f[i]   = -k * x[i];               // new force
        v[i]  += f[i] * inv_m * half_dt;   // second half kick
    }
}

EMSCRIPTEN_KEEPALIVE
float compute_kinetic_energy(float* v, float* masses, int n) {
    float ke = 0.0f;
    for (int i = 0; i < n; i++) {
        float vx = v[i*3], vy = v[i*3+1], vz = v[i*3+2];
        ke += 0.5f * masses[i] * (vx*vx + vy*vy + vz*vz);
    }
    return ke;
}
```

Compile:

```bash
emcc verlet.c \
     -O3 \
     -msimd128 \                          # enable WASM SIMD
     -s WASM=1 \
     -s EXPORTED_RUNTIME_METHODS='["cwrap","getValue","setValue"]' \
     -s ALLOW_MEMORY_GROWTH=1 \
     -o verlet.js
# Output: verlet.js (glue) + verlet.wasm
```

Flags explained:
- `-O3`: full optimization (equivalent to -O3 in native C).
- `-msimd128`: enable WASM SIMD — compiler auto-vectorizes loops where possible.
- `ALLOW_MEMORY_GROWTH`: the linear memory can grow at runtime (needed if simulation grows).
- `EXPORTED_RUNTIME_METHODS`: JS utilities for calling C from JS.

### Calling from JavaScript

```javascript
// Load the generated glue script
// In browser: <script src="verlet.js"></script>

// Wait for WASM to initialize
const Module = await new Promise(resolve => {
    createVerletModule({ onRuntimeInitialized: resolve })
        .then(m => resolve(m));
});

// Wrap C functions with cwrap
const verletStep = Module.cwrap('verlet_step', null,
    ['number', 'number', 'number', 'number', 'number', 'number', 'number']);
const computeKE  = Module.cwrap('compute_kinetic_energy', 'number',
    ['number', 'number', 'number']);

// Allocate particle arrays inside WASM linear memory
const N = 1000;
const nbytes = N * 3 * 4;  // float32
const ptrX = Module._malloc(nbytes);
const ptrV = Module._malloc(nbytes);
const ptrF = Module._malloc(nbytes);
const ptrM = Module._malloc(N * 4);

// Write initial conditions from JavaScript into WASM memory
const xView = new Float32Array(Module.HEAPF32.buffer, ptrX, N * 3);
const vView = new Float32Array(Module.HEAPF32.buffer, ptrV, N * 3);
const mView = new Float32Array(Module.HEAPF32.buffer, ptrM, N);

for (let i = 0; i < N; i++) {
    xView[i*3]   = (Math.random() - 0.5) * 10;  // initial position (Å)
    xView[i*3+1] = (Math.random() - 0.5) * 10;
    xView[i*3+2] = (Math.random() - 0.5) * 10;
    mView[i] = 39.948;  // argon mass (Da)
}

const k  = 0.5;   // spring constant
const dt = 0.001; // timestep (ps)

// Run 1000 timesteps
for (let step = 0; step < 1000; step++) {
    verletStep(ptrX, ptrV, ptrF, N, k, mView[0], dt);

    if (step % 100 === 0) {
        const ke = computeKE(ptrV, ptrM, N);
        console.log(`Step ${step}: KE = ${ke.toFixed(4)} kcal/mol`);
    }
}

// Cleanup
Module._free(ptrX); Module._free(ptrV);
Module._free(ptrF); Module._free(ptrM);
```

Walk through the pointer arithmetic. `Module.HEAPF32` is a `Float32Array` view into WASM's linear memory — reading and writing it from JavaScript modifies WASM's "RAM." `ptrX` is a byte offset into that memory. This is the bridge.

## WASM SIMD — vectorizing the inner loop (10 min)

The `-msimd128` flag tells Emscripten to enable the WASM `v128` type, which maps to SSE2/SSE4.1 on x86, NEON on ARM. For a loop like:

```c
for (int i = 0; i < n; i++) f[i] = -k * x[i];
```

With SIMD, the compiler auto-vectorizes this to process **4 floats simultaneously** (128-bit SIMD width = 4 × 32-bit floats). On a modern CPU, that's a 4× throughput gain for this loop.

Manual WASM SIMD using C intrinsics (`<wasm_simd128.h>`):

```c
#include <wasm_simd128.h>

void compute_forces_simd(float* f, float* x, int n, float neg_k) {
    v128_t vk = wasm_f32x4_splat(neg_k);   // broadcast neg_k into 4 lanes

    int i = 0;
    for (; i <= n - 4; i += 4) {
        v128_t vx = wasm_v128_load(&x[i]);  // load 4 floats
        v128_t vf = wasm_f32x4_mul(vk, vx); // multiply: 4 forces at once
        wasm_v128_store(&f[i], vf);          // store 4 results
    }
    // Handle remainder
    for (; i < n; i++) f[i] = neg_k * x[i];
}
```

This compiles to a WASM `v128.mul` instruction which the browser JIT maps to an SSE/NEON instruction. A loop that processes 1 float per cycle now processes 4. For N=100,000 particles with 3D forces, this is a measurable 3–4× speedup.

V8 reference: [WASM SIMD in V8](https://v8.dev/features/simd).

## WASM threads and `crossOriginIsolated` (10 min)

### What WASM threads enable

WASM has a threads proposal (based on SharedArrayBuffer and Atomics.wait/Atomics.notify). Multiple Web Workers can share the same WASM linear memory, enabling true parallel computing:

```javascript
// Main thread: create shared memory
const sharedMem = new WebAssembly.Memory({
    initial: 1024, shared: true   // <- key: shared memory
});

// Spin up 4 workers, each gets the same memory
for (let i = 0; i < 4; i++) {
    const worker = new Worker('wasm-worker.js');
    worker.postMessage({ mem: sharedMem, threadId: i, nThreads: 4 });
}
```

Each worker runs a subset of the particles. Force computation is embarrassingly parallel (read-only positions, write-only forces). This can use all CPU cores for near-native parallel MD.

### The `crossOriginIsolated` requirement

`SharedArrayBuffer` was **disabled for all pages in 2018** because it's a high-resolution timer that enables Spectre attacks (L19). It was re-enabled only for pages that opt into strong isolation via headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

When both are set, `document.crossOriginIsolated === true`, and `SharedArrayBuffer` is available.

This means: **to use WASM threads, your server must send these two HTTP response headers.** This is a real deployment requirement, not optional. Many university compute portals have added them specifically for WebAssembly scientific applications.

To verify in a page:

```javascript
if (crossOriginIsolated) {
    console.log("WASM threads available");
} else {
    console.log("WASM single-threaded only — server needs COOP+COEP headers");
}
```

## WASM vs. WebGPU — decision guide (5 min)

Put on the board. Students need this for HW design decisions.

| Dimension | WebAssembly | WebGPU Compute |
|---|---|---|
| **Parallelism** | Multi-core CPU (with WASM threads) | Thousands of GPU cores |
| **Requires COOP+COEP** | Yes (for threads) | Yes (for SharedArrayBuffer) |
| **Latency to first result** | Very low | Higher (GPU queue, map/unmap) |
| **Algorithm types** | Anything — sequential, recursive, graph traversal | Data-parallel, regular access patterns |
| **Existing code** | Port C/C++/Rust/Fortran directly | Rewrite in WGSL |
| **Floating point** | f32, f64, i32, i64, SIMD | f32, f16, u32 (limited f64) |
| **Memory model** | Familiar C heap | GPU buffers, explicit upload/download |
| **N-body MD** | Great for N < 10,000 | Great for N > 1,000 |
| **DFT/FFT** | Good | Excellent (GPU FFT) |
| **Ab initio QM** | Feasible for small molecules | Harder (requires custom kernels) |

**Rule of thumb**: if you have existing C/C++ scientific code and you want it in the browser — use WASM. If you need massive parallelism over uniform data (particle forces, matrix ops, FFT, ray casting) — use WebGPU. They compose: WASM for setup and control logic, WebGPU for the inner compute kernel.

## A tiny code excerpt — WASM in V8 (5 min)

Open [`v8/src/wasm/`](https://source.chromium.org/chromium/chromium/src/+/main:v8/src/wasm/) in Code Search. Show:

- `module-decoder.cc` — validates the WASM binary format (magic bytes, section structure, type checking).
- `baseline-compiler.cc` — Liftoff: the single-pass baseline compiler.
- `turboshaft-compiler.cc` — TurboFan/Turboshaft: the optimizing compiler.
- `wasm-engine.cc` — coordinates compilation, compilation caching, instantiation.

The magic number for WASM files: `0x00 0x61 0x73 0x6D` which is `\0asm` in ASCII. V8 immediately validates this on load.

## Live demo (15 min)

### Demo 1 — Atomify

Show [andeplane.github.io/atomify](https://andeplane.github.io/atomify/) running. Try:
- The default LJ fluid — watch atoms diffuse.
- Change temperature in the script to 0.1 (below freezing point of LJ argon ~0.694) — watch crystallization.
- Increase N by changing the lattice size — watch it get slower as N².

Show the browser DevTools Performance panel running during a simulation. The main thread is doing WASM execution and rendering; observe the JS/WASM frames.

### Demo 2 — Compile your own Verlet

This requires `emcc` installed. If not available in the classroom, show the pre-compiled output:

```bash
emcc verlet.c -O3 -msimd128 -s WASM=1 \
     -s EXPORTED_RUNTIME_METHODS='["cwrap"]' \
     -s ALLOW_MEMORY_GROWTH=1 \
     -o verlet.js

ls -lh verlet.wasm verlet.js
# verlet.wasm: ~2KB
# verlet.js: ~20KB (glue)
```

Open `verlet.wasm` in a hex editor. Show the magic bytes (`00 61 73 6D`). Show the function section. Students see: this is real binary, not JavaScript.

Then open a browser, load the JS glue, call `verletStep`, log KE over 1000 steps. Show conservation of energy — a diagnostic every physicist knows — as a sanity check.

### Demo 3 — crossOriginIsolated check

```javascript
console.log('crossOriginIsolated:', crossOriginIsolated);
try {
    new SharedArrayBuffer(1024);
    console.log('SharedArrayBuffer: available!');
} catch(e) {
    console.log('SharedArrayBuffer: blocked —', e.message);
}
```

Show the output on a site that doesn't serve COOP+COEP (blocked), then on a site that does (if available). Students see the COOP+COEP requirement in action.

## Reading for next lecture

- W3C Web Serial specification: [wicg.github.io/serial](https://wicg.github.io/serial/)
- W3C WebUSB specification: [wicg.github.io/webusb](https://wicg.github.io/webusb/)
- W3C Web Bluetooth specification: [webbluetoothcg.github.io/web-bluetooth](https://webbluetoothcg.github.io/web-bluetooth/)
- developer.chrome.com: [Read from and write to a serial port](https://developer.chrome.com/docs/capabilities/serial)

## Instructor notes

- Atomify is the crowd-pleasing demo. Have it loaded before class — it takes a moment to start.
- The `crossOriginIsolated` gotcha is worth repeating from L19. Students often forget that the headers are a server responsibility.
- The WASM vs. WebGPU decision guide comes up in every HW12/HW13 design discussion.
- If Emscripten isn't installed, use the [Emscripten Online Explorer](https://wasdk.github.io/WasmFiddle/) or pre-compile the demo binary.
- Chemistry students: the Atomify demo script above is real LAMMPS syntax. They can port scripts from their coursework.

---

[← L23](./L23-webgpu.md) · [Unit VI README](./README.md) · [Next: L25 — Device APIs →](./L25-device-apis.md)

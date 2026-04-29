# Lecture 23 — GPU in the Browser: WebGL and WebGPU

| | |
|---|---|
| **Unit** | VI — The Web Platform for Science |
| **Week** | 12 |
| **Duration** | 1.5 hours |
| **Demo** | Lennard-Jones molecular dynamics on the GPU; real-time atom sphere renderer |

## Learning objectives

Students can:

1. Distinguish WebGL (graphics-first, repurposed for compute) from WebGPU (compute-first).
2. Describe the WebGPU object model: adapter, device, queue, buffer, pipeline, bind group.
3. Write a basic WGSL compute shader and explain workgroups and invocations.
4. Implement a parallel Lennard-Jones force calculation as a compute shader.
5. Round-trip data between JavaScript and the GPU via `GPUBuffer` and `mapReadAsync`.
6. Describe how Chromium's Dawn layer translates WebGPU to Metal/D3D12/Vulkan.

## Opening hook (5 min)

Put this on the board:

```
Lennard-Jones potential:
V(r) = 4ε [ (σ/r)¹² − (σ/r)⁶ ]

Force on particle i from particle j:
F_ij = −∂V/∂r_ij = 24ε/r² [ 2(σ/r)¹² − (σ/r)⁶ ] · r̂_ij
```

For N particles: computing all pairwise forces naively requires O(N²) force evaluations per timestep. For N = 10,000 particles: **100 million** evaluations, each involving square roots, exponentials, and divisions.

On the CPU: probably 10–30 seconds per timestep in JavaScript. On a GPU with WebGPU: potentially under 10 milliseconds — well within one animation frame.

The question: can we really do computational chemistry in a browser tab? This lecture shows you how.

## WebGL vs. WebGPU — brief history (10 min)

### WebGL (2011)

Based on OpenGL ES 2.0, which was designed in 1992 for rasterizing triangles. WebGL exposes:
- **Vertex shaders** — transform 3D geometry to 2D screen positions.
- **Fragment shaders** — compute the color of each pixel.

Developers figured out a trick: store your data in a texture (a 2D array the GPU understands), use fragment shaders as a compute engine, and read results back via `readPixels`. This repurposing of graphics hardware for GPGPU is painful but was the only option for years.

Pain points: no writable storage buffers in shaders, no global synchronization between shader invocations, awkward data encoding, no direct compute path.

### WebGPU (shipped Chrome 113, May 2023)

Designed from scratch for modern GPU architectures (Metal, D3D12, Vulkan). Adds:
- **Compute shaders** — programs that run on the GPU without drawing anything.
- **Storage buffers** — large read/write buffers shaders can access directly.
- **Workgroup memory** — fast shared memory within a workgroup (like CUDA's shared memory).
- **Atomic operations** — for safe concurrent writes.
- **Timestamp queries** — nanosecond-resolution GPU timing.
- **f16 support** — half-precision floats for ML and some simulation workloads.

WebGPU is what CUDA programmers have wanted in the browser for a decade.

### Chromium's implementation: Dawn

Inside Chromium, WebGPU is implemented by **Dawn** (`//third_party/dawn/`). Dawn is a standalone library that translates WebGPU calls into platform-specific GPU API calls:

- **macOS/iOS**: Metal
- **Windows**: D3D12 (with D3D11 fallback)
- **Linux/Android**: Vulkan
- **Some devices**: OpenGL ES via ANGLE fallback

Dawn also validates the WebGPU commands for correctness and security before sending them to the GPU process. This is critical — GPU drivers are complex and unforgiving. An invalid command in native code can crash the driver or worse; WebGPU's validation layer prevents this.

Dawn also exists as a standalone C++ library used by non-Chrome projects (e.g., wgpu for Firefox/Rust, various game engines). Primary source: [dawn.googlesource.com](https://dawn.googlesource.com/dawn).

## The WebGPU object model (10 min)

Walk through the object hierarchy that every WebGPU program follows. Draw on the board:

```
navigator.gpu
    │
    ├── GPUAdapter          ← represents your physical GPU
    │       │
    │       └── GPUDevice   ← logical device; owns all resources
    │               │
    │               ├── GPUQueue            ← submits command buffers
    │               ├── GPUBuffer           ← raw GPU memory
    │               ├── GPUTexture          ← 2D/3D pixel data
    │               ├── GPUShaderModule     ← compiled WGSL shader
    │               ├── GPUComputePipeline  ← shader + layout
    │               ├── GPUBindGroup        ← maps buffers to shader bindings
    │               └── GPUCommandEncoder   ← records commands
    │                         │
    │                         └── GPUComputePassEncoder
```

A WebGPU program always does:

1. `adapter = await navigator.gpu.requestAdapter()` — find a GPU.
2. `device = await adapter.requestDevice()` — create a logical device.
3. Create buffers, shader module, pipeline, bind group.
4. Encode commands into a command buffer.
5. Submit: `device.queue.submit([commandBuffer])`.
6. Read results back via `buffer.mapAsync(GPUMapMode.READ)`.

Everything is **asynchronous** and **stateless**. No global state; every resource is explicitly created and destroyed.

## WGSL — the WebGPU Shading Language (10 min)

WebGPU's shading language is **WGSL** (WebGPU Shading Language). Syntactically Rust-flavored; semantically close to HLSL. Compiled to platform-specific IR (SPIR-V, MSL, HLSL) by Dawn.

A minimal compute shader:

```wgsl
// Compute shader: add two arrays, element-wise
@group(0) @binding(0) var<storage, read>  a      : array<f32>;
@group(0) @binding(1) var<storage, read>  b      : array<f32>;
@group(0) @binding(2) var<storage, read_write> c : array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= arrayLength(&a)) { return; }
    c[i] = a[i] + b[i];
}
```

**Execution model** — the single most important concept for scientific computing students:

```
GPU launch call: (N / 64) workgroups, each with 64 invocations
                 │
                 ├── Workgroup 0: invocations 0–63
                 │       each invocation runs main() with its own gid
                 ├── Workgroup 1: invocations 64–127
                 ├── ...
                 └── Workgroup N/64-1: invocations N-64 to N-1
```

- **Invocation**: one execution of `main()`. Has its own registers and local variables.
- **Workgroup**: a block of invocations (here: 64) that execute on the same multiprocessor. They can share **workgroup memory** (`var<workgroup>` in WGSL) — fast scratchpad RAM that's local to the workgroup.
- **Global invocation ID** (`global_invocation_id`): uniquely identifies one invocation across the entire dispatch. This maps to "which particle am I?" in a physics simulation.

The workgroup size of 64 is a common choice — it's a multiple of the GPU warp size (32 on NVIDIA) and wavefront size (64 on AMD). Powers of two, usually 64 or 256.

## Lennard-Jones molecular dynamics on the GPU — full walkthrough (25 min)

This is the central demo of the lecture. Students should code along if possible.

### The physics

Lennard-Jones potential (used for noble gases, coarse-grained models, and as a pedagogical baseline):

```
V(r) = 4ε [ (σ/r)¹² − (σ/r)⁶ ]
```

Force on particle i from particle j:

```
F_ij = 24ε/r² [ 2(σ/r)¹² − (σ/r)⁶ ] · r̂_ij
```

where r̂_ij = (r_i − r_j)/|r_i − r_j|.

With N particles, force summation is:

```
F_i = Σ_{j≠i} F_ij    (O(N²) operations)
```

Perfect for GPU parallelism: each particle i can compute its total force independently.

### The WGSL compute shader for force calculation

```wgsl
// lj_forces.wgsl
struct Particle {
    pos : vec3f,
    _pad: f32,         // alignment
    vel : vec3f,
    _pad2: f32,
    force : vec3f,
    _pad3: f32,
};

struct Params {
    n_particles : u32,
    epsilon     : f32,  // LJ epsilon (well depth), e.g. 0.238 kcal/mol for Ar
    sigma       : f32,  // LJ sigma (diameter), e.g. 3.4 Angstroms for Ar
    cutoff_sq   : f32,  // r_cutoff² for neighbor cutoff, typically (2.5σ)²
};

@group(0) @binding(0) var<storage, read_write> particles : array<Particle>;
@group(0) @binding(1) var<uniform>             params    : Params;

@compute @workgroup_size(64)
fn compute_forces(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= params.n_particles) { return; }

    let pos_i = particles[i].pos;
    var force_acc = vec3f(0.0);

    let eps24  = 24.0 * params.epsilon;
    let sig2   = params.sigma * params.sigma;

    for (var j: u32 = 0u; j < params.n_particles; j++) {
        if (j == i) { continue; }

        let dr   = pos_i - particles[j].pos;
        let r2   = dot(dr, dr);

        // Apply cutoff — ignore pairs beyond r_cutoff
        if (r2 >= params.cutoff_sq || r2 < 0.01) { continue; }

        // Lennard-Jones force magnitude scaled by 1/r²:
        // F/r = 24ε/r² * [ 2(σ/r)¹² − (σ/r)⁶ ]
        let sr2   = sig2 / r2;         // (σ/r)²
        let sr6   = sr2 * sr2 * sr2;   // (σ/r)⁶
        let sr12  = sr6 * sr6;          // (σ/r)¹²
        let fmag  = eps24 / r2 * (2.0 * sr12 - sr6);

        // Accumulate force vector on particle i
        force_acc += fmag * dr;
    }

    particles[i].force = force_acc;
}
```

Walk through every line. Explain:

- **Struct alignment**: the `_pad` fields exist because WGSL requires vec3 fields to be aligned to 16 bytes. Always pad vec3 to vec4 in GPU structs.
- **Cutoff**: without a cutoff, every particle interacts with every other. With cutoff `r_c = 2.5σ`, we discard 97%+ of pairs (the force is negligible beyond 2.5σ for LJ). This is the same approximation used in CPU MD codes.
- **SIMD-friendliness**: the inner loop computes `sr2 = sig2/r2`, then raises it to the 6th and 12th power via squarings. The GPU can pipeline these arithmetic ops across many invocations simultaneously.

### The JavaScript host code

```javascript
// --- 1. Initialize WebGPU ---
const adapter = await navigator.gpu.requestAdapter();
const device  = await adapter.requestDevice();

const N = 1000;   // number of argon atoms

// --- 2. Create particle data on CPU ---
// Pack: pos.x, pos.y, pos.z, pad, vel.x, vel.y, vel.z, pad, fx, fy, fz, pad
const FLOATS_PER_PARTICLE = 12;
const cpuData = new Float32Array(N * FLOATS_PER_PARTICLE);

// Initialize random positions in a 30Å × 30Å × 30Å box
for (let i = 0; i < N; i++) {
    const base = i * FLOATS_PER_PARTICLE;
    cpuData[base + 0] = Math.random() * 30;   // x (Angstroms)
    cpuData[base + 1] = Math.random() * 30;   // y
    cpuData[base + 2] = Math.random() * 30;   // z
    // vel, force all zero initially
}

// --- 3. Upload to GPU ---
const gpuBuffer = device.createBuffer({
    size:  cpuData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(gpuBuffer, 0, cpuData);

// --- 4. Parameter uniform buffer ---
const params = new Float32Array([N, 0.238, 3.4, (2.5 * 3.4) ** 2]);
const paramsBuffer = device.createBuffer({
    size:  params.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
});
new Float32Array(paramsBuffer.getMappedRange()).set(params);
paramsBuffer.unmap();

// --- 5. Load and compile the shader ---
const shaderModule = device.createShaderModule({ code: WGSL_SHADER_SOURCE });

// --- 6. Build the compute pipeline ---
const bindGroupLayout = device.createBindGroupLayout({
    entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' } },
    ],
});
const pipeline = device.createComputePipeline({
    layout:  device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    compute: { module: shaderModule, entryPoint: 'compute_forces' },
});
const bindGroup = device.createBindGroup({
    layout:  bindGroupLayout,
    entries: [
        { binding: 0, resource: { buffer: gpuBuffer } },
        { binding: 1, resource: { buffer: paramsBuffer } },
    ],
});

// --- 7. Encode and submit ---
const t0 = performance.now();
const encoder = device.createCommandEncoder();
const pass    = encoder.beginComputePass();
pass.setPipeline(pipeline);
pass.setBindGroup(0, bindGroup);
pass.dispatchWorkgroups(Math.ceil(N / 64));   // one thread per particle
pass.end();

// Readback buffer (cannot map STORAGE buffers directly)
const readBuffer = device.createBuffer({
    size:  cpuData.byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
});
encoder.copyBufferToBuffer(gpuBuffer, 0, readBuffer, 0, cpuData.byteLength);
device.queue.submit([encoder.finish()]);

// --- 8. Read results back ---
await readBuffer.mapAsync(GPUMapMode.READ);
const result = new Float32Array(readBuffer.getMappedRange().slice(0));
readBuffer.unmap();
console.log(`Forces computed in ${(performance.now() - t0).toFixed(2)} ms`);

// Extract forces (at offset 8 in each 12-float block)
for (let i = 0; i < Math.min(5, N); i++) {
    const base = i * FLOATS_PER_PARTICLE;
    const fx = result[base + 8], fy = result[base + 9], fz = result[base + 10];
    console.log(`Atom ${i}: F = (${fx.toFixed(4)}, ${fy.toFixed(4)}, ${fz.toFixed(4)}) kcal/(mol·Å)`);
}
```

### Extension: leapfrog integrator

Once forces are computed, a second dispatch integrates positions and velocities:

```wgsl
@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= params.n_particles) { return; }

    let dt    = params.dt;        // timestep, e.g. 0.001 ps
    let mass  = params.mass;      // e.g. 39.948 Da for Ar

    // Leapfrog Verlet:
    // v(t + dt/2) = v(t - dt/2) + a(t) · dt
    // x(t + dt)   = x(t) + v(t + dt/2) · dt
    let accel = particles[i].force / mass;
    particles[i].vel += accel * dt;
    particles[i].pos += particles[i].vel * dt;

    // Simple periodic boundary (cubic box, box_size in params):
    particles[i].pos = particles[i].pos % vec3f(params.box_size);
}
```

Two dispatches per timestep: `compute_forces` then `integrate`. No data leaves the GPU between them — maximum throughput.

## Rendering atoms: WebGPU render pipeline (10 min)

The compute results can feed directly into a render pipeline — no CPU roundtrip required.

A sphere imposter shader (drawing each atom as a billboard quad that looks like a sphere via ray-sphere intersection in the fragment shader):

```wgsl
// vertex shader: expand each particle position into a quad
@vertex
fn vs_main(@builtin(instance_index) inst: u32,
           @builtin(vertex_index)   vert: u32) -> VertexOutput {
    let atom_pos = particles[inst].pos;

    // Quad corners: (-1,-1), (1,-1), (-1,1), (1,1) in screen space
    let corners = array<vec2f,4>(
        vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(1,1)
    );
    let uv = corners[vert];

    // Project atom center + scale by atom_radius / camera_distance
    // ... (camera matrix math elided for brevity)
    // ...
    var out: VertexOutput;
    out.uv        = uv;
    out.atom_pos  = atom_pos;
    out.position  = /* projected corner */;
    return out;
}

// fragment shader: ray-sphere intersection for correct depth + lighting
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    // Ray from camera through this pixel; intersect with sphere at atom_pos
    // Phong shading with a directional "lab light"
    // Encode depth into gl_FragDepth for correct z-ordering
    let r2 = dot(in.uv, in.uv);
    if (r2 > 1.0) { discard; }  // outside the sphere

    let z      = sqrt(1.0 - r2);
    let normal = vec3f(in.uv, z);       // sphere normal at this pixel
    let light  = normalize(vec3f(1.0, 2.0, 3.0));
    let diff   = max(dot(normal, light), 0.0);

    // Color by element (CPK coloring: Ar = light blue)
    let color = vec3f(0.4, 0.7, 1.0);  // argon blue
    return vec4f(color * (0.1 + 0.9 * diff), 1.0);
}
```

This renders N atoms as N fully-lit, correctly depth-sorted spheres at 60+ fps for N up to ~100,000 on a modern GPU. The same particle buffer feeds both compute (forces) and rendering (visual) — no copies.

## A tiny code excerpt — Dawn in Chromium (3 min)

Open [`third_party/dawn/`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/dawn/) in Code Search. Show the directory: `include/dawn/`, `src/dawn/native/` (the implementation), `src/dawn/wire/` (the command serialization protocol). Dawn's wire protocol is what allows WebGPU commands to cross the renderer-to-GPU-process boundary safely.

## Live demo (10 min)

Open a pre-prepared HTML page containing the LJ force shader and renderer. Run with N = 100 (tiny, easy to see in console), N = 1000, N = 5000. Time each. Show the non-linear scaling (N² force evaluation) and the GPU's ability to keep it interactive up to thousands of atoms.

Then push N to 10,000 and show the GPU timing vs. a CPU reference implementation (a JS `for` loop):

```javascript
// CPU reference (naïve O(N²))
function cpuForces(positions, N, epsilon, sigma) {
    const forces = new Float32Array(N * 3);
    for (let i = 0; i < N; i++)
        for (let j = 0; j < N; j++) {
            if (i === j) continue;
            // same math as WGSL...
        }
    return forces;
}
```

Typical results: CPU ~20s for N=5000, GPU <50ms. 400× speedup from moving to the GPU.

## Scientific context — what this enables (5 min)

What does 400× speedup in the browser actually unlock?

- **Interactive molecular dynamics**: a researcher can change temperature, add a molecule, watch the system respond, all at 60 fps.
- **Teaching tool**: students in physical chemistry can see Lennard-Jones dynamics without installing anything. The browser is the platform.
- **Parameter sweeps**: for N=500 (fast), running thousands of simulations in parallel browser tabs is tractable. Distributed compute on student laptops.
- **Visualization of quantum chemistry output**: orbitals, electron density maps, isosurfaces — all renderable via WebGPU without a native viewer.

Real examples to mention:
- **3Dmol.js** and **NGL Viewer** — molecular viewers already running in browsers via WebGL, transitioning to WebGPU.
- **Atomify** (LAMMPS in WASM+three.js) — we'll see this in L24.
- **Avogadro Web** — porting the famous chemistry editor to the browser.

## Reading for next lecture

- webassembly.org: [WebAssembly overview](https://webassembly.org/getting-started/developers-guide/)
- emscripten.org: [Emscripten tutorial](https://emscripten.org/docs/getting_started/Tutorial.html)
- v8.dev: [WebAssembly compilation pipeline](https://v8.dev/blog/liftoff) and [WASM SIMD](https://v8.dev/blog/simd)
- github.com/andeplane/atomify — browse the codebase (LAMMPS + Emscripten + three.js)

## Instructor notes

- HW12 is assigned this lecture. It starts from a simplified version of the LJ shader above.
- The struct padding issue (`_pad` for `vec3`) is the single most common bug students hit. Warn them explicitly.
- The `crossOriginIsolated` requirement for SharedArrayBuffer (and thus WASM threads) is previewed here — we go deep in L24.
- If the classroom projector GPU is integrated (Intel), results will be slower but still dramatically faster than CPU. WebGPU works on Intel integrated graphics.

---

[← Unit VI README](./README.md) · [Next: L24 — WebAssembly →](./L24-webassembly.md)

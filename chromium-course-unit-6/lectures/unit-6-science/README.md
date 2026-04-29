# Unit VI — The Web Platform for Science

**Weeks 12–13 · Lectures 23–26**

This unit is the payoff for Chemistry and Chemical Engineering students — and a demonstration to CS students of how deep browser APIs have become. The web platform now supports:

- **GPU compute** at near-native speed (WebGPU, L23)
- **C/C++ scientific code** running in the browser via WebAssembly (L24)
- **Direct hardware access** — serial instruments, USB devices, Bluetooth sensors (L25)
- **Offline-first field apps** — progressive web apps that work in a basement lab with no network (L26)

Every lecture uses chemistry and physics as its primary domain. Examples include: Lennard-Jones molecular dynamics on the GPU, Schrödinger equation probability density visualization, LAMMPS compiled to WASM, NMR spectrometer control over Web Serial, and an offline field sample logging PWA.

## Lectures

| # | Title | Demo |
|---|---|---|
| [L23](./L23-webgpu.md) | GPU in the Browser: WebGL and WebGPU | Lennard-Jones MD on GPU via compute shader; atom sphere renderer |
| [L24](./L24-webassembly.md) | WebAssembly: Near-Native in the Browser | LAMMPS-in-browser (Atomify); compiling a custom C MD integrator with Emscripten |
| [L25](./L25-device-apis.md) | Device APIs for the Lab: WebUSB, Web Bluetooth, Web Serial | Live serial port read from an Arduino simulating a spectrometer |
| [L26](./L26-pwas.md) | Progressive Web Apps, Offline, and Field Science | Service worker + IndexedDB offline field logger |

## Unit learning outcomes

Students who complete Unit VI can:

1. Write a WebGPU compute shader in WGSL that performs a parallel chemistry computation (force summation, pair correlation, etc.).
2. Explain WGSL's execution model: workgroups, invocations, workgroup memory.
3. Compile a C/C++ scientific library to WASM using Emscripten and call it from JavaScript.
4. Explain why `crossOriginIsolated` (COOP + COEP) is required for WASM threads, and set it up.
5. Use Web Serial to open a port, configure baud rate, read lines, and parse instrument data.
6. Write a service worker that intercepts fetches and serves cached responses offline.
7. Store structured scientific data in IndexedDB for offline use and sync it when online.

## Associated homework

- [HW12 — Molecular Viewer in WebGPU](../../homework/HW12-webgpu-molecular-viewer.md) (assigned L23, due end of Week 12)
- [HW13 — Device API or PWA](../../homework/HW13-device-api-or-pwa.md) (assigned L25, due end of Week 13)

## The scientific computing arc

The four lectures form a deliberate stack:

```
Application layer:  L26  PWA + offline + sync
Device I/O layer:   L25  Web Serial / USB / Bluetooth  
Compute layer:      L23  WebGPU + L24 WASM
```

A real scientific web app sits at every layer simultaneously: it reads data from an instrument (L25), runs physics or chemistry on that data (L23, L24), and stores it offline-first (L26).

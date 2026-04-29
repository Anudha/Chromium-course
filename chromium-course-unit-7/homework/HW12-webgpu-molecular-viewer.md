# HW12 — Molecular Viewer in WebGPU

**Assigned:** Week 12 · **Due:** End of Week 12 · **Weight:** ~2.3% of course grade

## Goal

Build a working WebGPU application that renders atoms as shaded spheres and optionally runs a compute shader to simulate their motion. Starting from the Lennard-Jones force shader from L23, extend it into a real, interactive viewer.

## Background

In L23 we built a complete LJ force compute shader and a sphere imposter renderer. This HW takes that code as a starting point (provided below) and asks you to extend it with your own physics, your own visualization, or your own chemistry.

## Starter code

Download the starter from the course site: `hw12-starter.zip`. It contains:

```
hw12-starter/
├── index.html      ← loads the WebGPU app
├── main.js         ← WebGPU initialization, render loop
├── lj_forces.wgsl  ← the LJ force compute shader from lecture
├── render.wgsl     ← sphere imposter vertex + fragment shaders
└── server.py       ← python3 server.py (adds COOP+COEP headers)
```

Run it:

```bash
python3 server.py
# Open http://localhost:8080 in Chrome
```

You should see 100 argon atoms (random initial positions) rendered as blue spheres. The force compute shader runs but there's no integrator yet — atoms don't move.

## Required features

### Feature 1 — Implement the leapfrog integrator (30 pts)

Add a second WGSL compute shader file `integrate.wgsl` containing the leapfrog (Velocity Verlet) integrator from L23:

```wgsl
@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) gid: vec3u) {
    // YOUR IMPLEMENTATION
}
```

Wire it into the render loop: each animation frame runs `compute_forces` then `integrate`. Atoms should begin moving.

Verify correctness: the total energy (kinetic + potential) should remain roughly conserved over short simulations. Add a readback that samples KE and PE every 100 frames and prints them to the console. Drift under 5% over 1000 steps is acceptable.

### Feature 2 — Add CPK coloring by element (20 pts)

Extend the sphere renderer to color atoms by their element type using CPK colors. The starter code uses a single `species` field (an integer per atom) in the particle struct. Implement coloring for at least three elements:

| Element | CPK color |
|---|---|
| H (hydrogen) | White `rgb(1.0, 1.0, 1.0)` |
| C (carbon) | Dark grey `rgb(0.2, 0.2, 0.2)` |
| N (nitrogen) | Blue `rgb(0.2, 0.2, 0.8)` |
| O (oxygen) | Red `rgb(0.8, 0.1, 0.1)` |
| Ar (argon) | Light blue `rgb(0.4, 0.7, 1.0)` |
| S (sulfur) | Yellow `rgb(0.9, 0.8, 0.1)` |

In your `main.js`, initialize particles with at least two different species values. The renderer should select the right color in the fragment shader based on the `species` field.

### Feature 3 — Interactive camera (20 pts)

Add mouse/trackpad orbit controls. The camera should:
- **Orbit** around the origin on left-button drag.
- **Zoom** on scroll wheel.
- The sphere shader should use the camera's view-projection matrix (pass it as a uniform buffer).

Starter hint: compute a `view` matrix from spherical coordinates (azimuth, elevation, radius). Update the uniform buffer on each mouse event. Submit the updated matrix with each render.

### Feature 4 — A molecule of your choice (30 pts)

Replace (or supplement) the random argon atoms with a real molecule. Load its atom positions from a hardcoded array (you don't need a PDB parser — just copy coordinates by hand or from a source below).

Choose one:

**Option A — Water (H₂O)**: 3 atoms. Bond angle 104.45°, O-H bond 0.9572 Å. Use TIP3P geometry. Display the two hydrogens in white and oxygen in red.

**Option B — Methane (CH₄)**: 5 atoms. C at center, 4 H atoms at tetrahedral vertices, C-H bond 1.087 Å. Use tetrahedral angle (109.47°).

**Option C — Adenine (C₅H₅N₅)**: 15 atoms. A purine base relevant to DNA. Coordinates available from any PDB structure (e.g., PDB: 1DNX, adenine residue). Render each atom in CPK color.

**Option D — Buckminsterfullerene (C₆₀)**: 60 carbon atoms in an icosahedral cage. Hardcoded coordinates available from `fullerene.xyz` in the starter package. A true showpiece.

For your chosen molecule, render it centered in view with appropriate zoom. Run a short LJ-like simulation (with species-specific sigma/epsilon appropriate to your molecule, or just use Ar parameters as an approximation).

## Deliverables

Submit a zip `HW12-<unityID>.zip` containing:

```
HW12-<unityID>/
├── index.html
├── main.js
├── lj_forces.wgsl
├── integrate.wgsl
├── render.wgsl
├── server.py
├── report.md
├── screenshots/
│   ├── feature1-energy-conservation.png   ← console with KE/PE printout
│   ├── feature2-cpk-coloring.png          ← colored atoms
│   ├── feature3-camera.png                ← camera rotated to show orbit
│   └── feature4-molecule.png              ← your chosen molecule
└── AI-USAGE.md
```

In `report.md` (1–2 pages):
1. Which molecule did you choose and why?
2. What `σ` and `ε` parameters did you use for each species? Where did the values come from?
3. What energy conservation behavior did you observe? Show a sample KE/PE table.
4. If you had one more week, what would you add?

## Grading rubric

| Component | Points |
|---|---|
| Feature 1: integrator + energy conservation shown | 30 |
| Feature 2: CPK coloring correct for ≥3 elements | 20 |
| Feature 3: orbit camera works | 20 |
| Feature 4: real molecule rendered | 30 |
| **Total** | **100** |

## Bonus opportunities (+10 pts total, pick any)

- **Periodic boundary conditions**: wrap atom positions when they exit the simulation box (`% box_size` in the integrator). +5 pts.
- **Radial distribution function g(r)**: compute g(r) in a compute shader after equilibration and plot it. Should show the first peak of argon at ~3.4 Å. +5 pts.

## Hints

- WGSL `struct` alignment: always pad `vec3` fields to 16 bytes with a `_pad: f32`. Forgetting this is the #1 source of subtle corruption bugs.
- Chrome's WebGPU validation layer will log detailed errors in the console. Read them.
- For the orbit camera: `azimuth += dx * 0.01`, `elevation = clamp(elevation + dy * 0.01, -π/2, π/2)`, `x = r·cos(el)·sin(az)`, `y = r·sin(el)`, `z = r·cos(el)·cos(az)`.
- Test energy conservation with a small timestep (`dt = 0.0001 ps`) first. Large timesteps cause explosions.
- If C₆₀ is your molecule, you can find the 60 Cartesian coordinates at any reputable quantum chemistry database.

## AI usage policy

AI may help with WebGPU API calls, WGSL syntax errors, and coordinate geometry for the camera. The physics implementation (integrator, energy calculation, parameter choices) must be your own work. The molecule choice and scientific parameters must be yours. Cite AI usage in `AI-USAGE.md`.

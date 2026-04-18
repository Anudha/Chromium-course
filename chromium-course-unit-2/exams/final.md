# Final Exam

**When:** Exam week · **Duration:** 2 hours 50 minutes · **Weight:** 20%
**Covers:** Comprehensive (all units) + final project presentation
**Materials allowed:** two handwritten, one-sided 8.5×11 note sheets. No laptops, no phones, no AI.

## Format

Three parts, 100 points total.

| Part | Points | Time guide |
|---|---|---|
| A — Comprehensive short answer | 40 | 60 min |
| B — Design question (essay) | 40 | 70 min |
| C — Final project presentation score | 20 | (graded separately) |

---

## Part A — Comprehensive short answer (40 pts)

20 questions × 2 pts each, drawn from all seven units. Sample:

1. Distinguish Chromium from Chrome in one sentence.
2. What is a Mojo "message pipe"? What is a "capability" in this context?
3. Explain why `transform` animations are cheap and `top` animations are expensive, in one sentence.
4. What does the preload scanner do, and why does it exist?
5. What is the difference between a renderer process crashing and the browser process crashing?
6. Why is V8 written with Isolates rather than global state?
7. Name the four V8 compilation tiers.
8. What does `is_component_build` do?
9. What is the content layer, and what distinguishes it from the chrome layer?
10. Name two Chromium-based browsers and one non-browser Chromium-based application.
11. What is an OOPIF?
12. What is the purpose of `chrome://net-export`?
13. What distinguishes WebGPU from WebGL, in one sentence?
14. Name a browser API that lets a web page talk to a hardware device over serial.
15. What is a service worker, and why is it essential for offline PWAs?
16. Why does Chromium use its own pinned clang rather than the system compiler?
17. What is the CQ, and what happens if tryjobs fail?
18. Name one process type, besides renderer and browser, and state why it exists.
19. What is QUIC, and which transport-layer protocol does it replace?
20. What is ANGLE, and why does Chromium use it?

---

## Part B — Design question (40 pts)

A new web API scenario. You have ~70 minutes to write a thoughtful response.

> **Prompt:** You are proposing a new web API called `navigator.cpu.getTemperature()` that returns the current CPU temperature in Celsius. Walk through the end-to-end process of adding this API to Chromium, covering:
>
> 1. Specification — where would you write the spec? Who would you socialize it with?
> 2. Intent-to-implement — the Blink launch process, what you'd file, what privacy/security review would ask.
> 3. IDL — sketch the IDL entry.
> 4. Mojo interface — sketch a `.mojom` that crosses the renderer-browser boundary. Which process reads the actual CPU temperature?
> 5. Browser-side implementation — which platform APIs would you call on Linux, Windows, macOS?
> 6. Sandbox considerations — can the renderer read CPU temperature directly? Why or why not?
> 7. Privacy considerations — what fingerprinting risk does this API pose? How would you mitigate it?
> 8. Rollout — how would you use Finch / field trials to ship it gradually?

Graded on completeness (all 8 sections addressed), realism (can this actually ship?), and depth (do you understand the tradeoffs?).

Note: you are not being graded on whether this API is a good idea. (It is almost certainly a bad idea for privacy reasons, and this is a reasonable thing to note in your answer.)

---

## Part C — Final project presentation (20 pts)

Graded separately during presentation week (Week 14). The 20 pts here reflect:

| Component | Points |
|---|---|
| Presentation clarity (10 min, to class) | 5 |
| Technical depth of project | 8 |
| Quality of 5-page CL-style write-up | 5 |
| Q&A response | 2 |

See [project tracks in the syllabus](../SYLLABUS.md#final-project).

---

## Study guide

- Re-read every lecture's learning objectives.
- Re-do representative HW from each unit.
- Be fluent with the rendering pipeline diagram (L7, L11, L12).
- Be fluent with the multi-process diagram (L2, L17).
- Be fluent with V8's tier pipeline (L13).
- Practice writing out the full trace of a web API (a la HW3) for a novel API cold.

---

## Grading notes for instructor

- Part A: auto-gradable with an answer key. Accept variants.
- Part B: provide a rubric rather than a single correct answer. Strong responses cite Finch, identify the fingerprinting risk, locate CPU temperature reading in a utility or GPU/hardware service process rather than the renderer, and acknowledge that permission prompts may be warranted.
- Part C: aggregated from project presentations; done asynchronously if needed.

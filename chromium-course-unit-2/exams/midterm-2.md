# Midterm 2

**When:** Thursday, Week 11, in class · **Duration:** 80 minutes · **Weight:** 15%
**Covers:** Units III–V (V8, Security, Networking; Lectures 13–22)
**Materials allowed:** one handwritten, one-sided 8.5×11 note sheet. No laptops, no phones, no AI.

## Format

Four parts, 100 points total.

| Part | Points | Time guide |
|---|---|---|
| A — V8 internals short answer | 25 | 15 min |
| B — Security reasoning essay | 25 | 20 min |
| C — Reading a .mojom | 25 | 20 min |
| D — Netlog interpretation | 25 | 20 min |

---

## Part A — V8 internals short answer (25 pts)

Sample questions:

1. Name V8's four compilation tiers in order, from least to most optimized.
2. What is a hidden class (map)? Why does V8 use them?
3. What is a monomorphic inline cache? A polymorphic IC? A megamorphic IC?
4. What triggers a deoptimization in TurboFan? Give two concrete examples.
5. Briefly: what does V8's generational GC assume, and why is that assumption useful?
6. What is Oilpan, and which parts of Chromium use it?
7. Why does V8 have an Isolate? Can two Isolates share memory?

---

## Part B — Security reasoning essay (25 pts)

You will be given a scenario like this:

> "A bug in V8's JIT allows an attacker to corrupt memory within the renderer process. The user visits attacker.com, which exploits this bug. Walk through every Chromium defense the attacker must overcome, in order, to achieve each of the following goals: (a) steal cookies from bank.com, (b) read a file from the user's home directory, (c) execute arbitrary code outside the browser."
>
> Cite sandbox, Site Isolation, cross-origin read blocking, process model, and Mojo capability narrowing.

Write a 1–1.5 page essay. Graded on completeness and correctness of the defense chain.

---

## Part C — Reading a .mojom (25 pts)

A novel `.mojom` file (not seen in class) will be provided, roughly like:

```mojom
module some_feature.mojom;

interface WidgetFactory {
  CreateWidget(int32 id) => (pending_remote<Widget> widget);
};

interface Widget {
  SetColor(uint32 rgba);
  Render() => (bool success);
};
```

Answer:

1. Which interface is the "factory"? Why would you have a factory pattern here?
2. Which end (client or service) is typically more privileged — the one with `pending_remote<Widget>` or the one implementing `Widget`?
3. If `Render()` is called on a compromised renderer, what can the renderer send that the browser must validate?
4. If you added a new method `WriteFile(string path, array<uint8> data) => (bool ok)` to `Widget`, what would a security reviewer likely say? Explain.

---

## Part D — Netlog interpretation (25 pts)

A Netlog excerpt will be provided (JSON events from `chrome://net-export`). Answer:

1. How many DNS queries occurred? How many resolved from cache?
2. How many TCP (or QUIC) connections were established? How many were reused?
3. Did any request use HTTP/3? How can you tell?
4. Which request took the longest from URL-request-start to response-body-complete? What was the bottleneck (DNS, TCP, TLS, server response)?

---

## Study guide

- Review L13–L22.
- Re-do HW7–HW11.
- Be able to sketch V8's tier pipeline from memory.
- Read at least one real `.mojom` file in Code Search (you did this in HW10).
- Play with `chrome://net-export` on a real page load.

---

## Grading notes for instructor

- Part B rewards students who cite multiple defenses and get the order right. No penalty for minor misorderings; the chain matters more than the exact sequence.
- Part C's security question (Q4) has a range of acceptable answers — anything touching "that's a huge privilege expansion; this method would need extensive sandboxing or a separate broker" gets full credit.
- Part D: provide the Netlog excerpt on paper, pre-parsed into readable form.

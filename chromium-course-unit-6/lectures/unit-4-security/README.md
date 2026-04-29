# Unit IV — Process Model & Security

**Weeks 9–10 · Lectures 17–20**

This unit is about why Chromium is structured the way it is from a security perspective, and how the mechanisms that enforce that structure actually work. Students leaving Unit IV should be able to reason from first principles about what an attacker with a renderer compromise can and cannot do — and cite the specific mechanism that stops each action.

The four lectures form a deliberate arc:

1. **L17** — The multi-process architecture in depth: which processes exist, who spawns whom, and what each is allowed to do.
2. **L18** — Sandboxing: how the OS is told to restrict each process, with Linux (seccomp-bpf), macOS (Seatbelt), and Windows (AppContainer/Restricted Token) examined specifically.
3. **L19** — Site Isolation and Spectre: why one-site-per-process is a hard requirement post-2018, how OOPIF works, and what CORB/COOP/COEP add on top.
4. **L20** — Mojo IPC: the message-pipe layer that replaces privilege with narrow interfaces, and why the design of a `.mojom` file is a security decision.

## Lectures

| # | Title | Demo |
|---|---|---|
| [L17](./L17-multiprocess-architecture.md) | The Multi-Process Architecture | `chrome://process-internals`; Task Manager process walk |
| [L18](./L18-sandboxing.md) | Sandboxing Across Operating Systems | `strace` on a sandboxed renderer; `chrome://sandbox` |
| [L19](./L19-site-isolation-spectre.md) | Site Isolation and Spectre | Live OOPIF inspection; COOP header demo |
| [L20](./L20-mojo-ipc.md) | Mojo: IPC as a First-Class Citizen | `.mojom` file to generated C++ roundtrip |

## Unit learning outcomes

Students who complete Unit IV can:

1. Name every process type in Chromium, explain who spawns it and why.
2. Describe how seccomp-bpf, AppContainer, and Seatbelt restrict a renderer process at the syscall level.
3. Explain how Spectre breaks the same-process data isolation assumption, and why site-per-process is the correct architectural response.
4. Describe OOPIFs: how cross-site iframes render across process boundaries.
5. Explain what CORB, COOP, and COEP do and when each is relevant.
6. Read a `.mojom` file, identify its interface, find its C++ implementation, and trace a call end-to-end.
7. Reason about what an attacker with arbitrary renderer-process code execution can and cannot do.

## Associated homework

- [HW9 — Process Zoo](../../homework/HW09-process-zoo.md) (assigned L17, due end of Week 9)
- [HW10 — Read a .mojom](../../homework/HW10-read-a-mojom.md) (assigned L19, due end of Week 10)

## Midterm 2

**Thursday of Week 11, in class.** Covers Units III–V (L13–L22). See [exams/midterm-2.md](../../exams/midterm-2.md). Unit IV is the core of Part B (security reasoning essay) and Part C (read a .mojom).

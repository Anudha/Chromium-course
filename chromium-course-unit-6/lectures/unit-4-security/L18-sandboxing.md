# Lecture 18 — Sandboxing Across Operating Systems

| | |
|---|---|
| **Unit** | IV — Process Model & Security |
| **Week** | 9 |
| **Duration** | 1.5 hours |
| **Demo** | `strace` on sandboxed renderer; `chrome://sandbox`; seccomp filter inspection |

## Learning objectives

Students can:

1. Describe the principle of least privilege and how it applies to browser processes.
2. Explain how seccomp-bpf filters work at the Linux syscall level.
3. Describe the Windows sandbox's use of Restricted Tokens and AppContainer.
4. Describe macOS Seatbelt (sandbox profiles).
5. Identify which syscalls/capabilities a sandboxed Chromium renderer is and is not allowed.
6. Explain why "defense in depth" means the sandbox must also survive a kernel exploit.

## Opening hook (5 min)

Put this on the board:

```
You have found a memory-corruption bug in V8's JIT compiler.
You can execute arbitrary code in a renderer process.
What can you do?
```

Without a sandbox: essentially anything the browser process can do — read arbitrary files, access the network without restriction, call any OS API, escalate via the GPU driver.

With a proper sandbox: almost nothing. You can talk only over the pre-established Mojo channel. The OS itself refuses every system call you try. You're a prisoner with a telephone.

This lecture is the prison. The next two lectures are about what the telephone can and cannot transmit.

## The principle of least privilege (5 min)

**A process should have access only to the resources it needs to do its job — nothing more.**

A renderer process needs to:
- Execute JavaScript and run Blink.
- Communicate over Mojo with the browser.
- Read/write shared memory for paint output.

A renderer process does NOT need to:
- Open files.
- Create sockets.
- Spawn new processes.
- Call `ptrace`.
- Load kernel modules.
- Access hardware directly.

The sandbox's job: make the "does not need" list impossible. The kernel enforces this, not the browser. Even if the renderer is completely compromised, the kernel refuses.

## The Linux sandbox: seccomp-bpf (25 min)

Linux's sandbox mechanism is **seccomp** (Secure Computing mode) with a **BPF** (Berkeley Packet Filter) program that acts as a syscall filter.

### What seccomp does

`seccomp` is a Linux kernel feature that restricts which system calls a process may make. Once installed, it's irrevocable — a process cannot remove its own seccomp filter. Two modes:

- **SECCOMP_MODE_STRICT**: allows only `read`, `write`, `exit`, `sigreturn`. Very restrictive; not what Chromium uses directly.
- **SECCOMP_MODE_FILTER** (with BPF): allows installing a custom filter program. Any syscall the filter rejects causes the kernel to send SIGSYS or return `ENOSYS`, or (for Chromium) kill the process.

### BPF programs as syscall filters

A BPF filter is a small bytecode program that runs in the kernel on each syscall. It examines:
- The syscall number.
- The arguments (raw register values, subject to TOCTOU limitations).

The program returns an action code: `SECCOMP_RET_ALLOW`, `SECCOMP_RET_KILL_PROCESS`, `SECCOMP_RET_ERRNO(n)`, `SECCOMP_RET_TRAP`, or `SECCOMP_RET_USER_NOTIF`.

A Chromium renderer's filter looks conceptually like:

```
if syscall == read     → ALLOW
if syscall == write    → ALLOW
if syscall == mmap     → ALLOW (with restrictions on MAP_SHARED + PROT_EXEC)
if syscall == mprotect → ALLOW (but not adding PROT_EXEC to anonymous memory — prevents shellcode injection)
if syscall == futex    → ALLOW (needed for threading)
if syscall == clone    → ALLOW (with CLONE_THREAD; cannot create new processes)
if syscall == exit     → ALLOW
if syscall == restart_syscall → ALLOW
// many more allowed...

// critically blocked:
if syscall == open      → KILL  (cannot open files)
if syscall == openat    → KILL  (same, modern variant)
if syscall == socket    → KILL  (cannot create sockets)
if syscall == connect   → KILL  (cannot connect to network)
if syscall == execve    → KILL  (cannot exec new programs)
if syscall == ptrace    → KILL  (cannot debug other processes)
if syscall == mknod     → KILL  (cannot create device files)
default                → KILL
```

The actual filter is significantly more complex — there are ~400 Linux syscalls and many have subtle legitimate uses by V8 and Blink's runtime. Chromium's filter is in [`sandbox/linux/seccomp-bpf-helpers/syscall_parameters_restrictions.cc`](https://source.chromium.org/chromium/chromium/src/+/main:sandbox/linux/seccomp-bpf-helpers/) and the baseline policy in [`baseline_policy.cc`](https://source.chromium.org/chromium/chromium/src/+/main:sandbox/linux/seccomp-bpf-helpers/baseline_policy.cc).

### The two-phase Linux sandbox

Chromium uses a two-layer approach:

**Layer 1 — filesystem restriction (pre-exec):**

Before `execve` of the child process, the parent uses Linux namespaces (specifically a new mount namespace plus `pivot_root` or `chroot`) to restrict the renderer's filesystem view. The renderer sees only `tmpfs` and `/proc/self/` — no `/etc/passwd`, no `/home`, no `/tmp`.

**Layer 2 — syscall filter (post-exec):**

After the child is running and has set up its own Mojo channel, it calls `sandbox::Sandbox::SetBrokerClientConnected(...)` and then installs the seccomp-bpf filter. From this point, the kernel rejects any blocked syscall. This is the "zygote" model.

### The zygote process

To make renderer startup fast, Chromium uses a **zygote** process (Linux only). The zygote is a pre-initialized process containing a fully initialized Blink and V8 — all the expensive startup work done once. When a new renderer is needed:

1. The browser process sends a "spawn" message to the zygote.
2. The zygote calls `fork()` — fast, cheap, copies all initialized state.
3. The child applies its seccomp filter and begins its Mojo handshake with the browser.

Zygote avoids re-running the slow initialization for every new renderer. This is why Chrome startup times are reasonable despite the complexity. The zygote code is in [`content/browser/zygote_host/`](https://source.chromium.org/chromium/chromium/src/+/main:content/browser/zygote_host/).

## The Windows sandbox: Restricted Tokens and AppContainer (15 min)

Windows doesn't have seccomp. Its equivalent is a combination of mechanisms:

### Job Objects

A **Job Object** is a Windows kernel object grouping processes with shared constraints. Chromium creates a Job Object for each renderer and applies limits:
- `JOB_OBJECT_LIMIT_ACTIVE_PROCESS` = 1: the renderer cannot spawn child processes.
- Restricted handle inheritance: the renderer receives only the specific handles it needs (the Mojo channel pipe, shared memory handles).
- UI restrictions: cannot access the desktop window station, clipboard, etc. (UI is the #1 attack surface for desktop privilege escalation on Windows.)

### Restricted Token

Windows security tokens control what kernel objects a process can access. Chromium creates a **Restricted Token** for renderers with:
- Most default groups removed or denied (cannot access user files, network shares, registry keys).
- `SeDebugPrivilege`, `SeShutdownPrivilege`, and most other privileges stripped.
- The `RESTRICTED_SID` added, which means all deny-only ACLs apply.

A renderer with a Restricted Token that tries to open a file gets `ERROR_ACCESS_DENIED`. No file, no socket, no registry key.

### AppContainer (Windows 8+)

On Windows 8 and later, Chrome uses **AppContainer** (the Windows equivalent of a seccomp-like capability restriction). AppContainer:
- Assigns the process a unique AppContainer SID.
- Restricts network access (cannot make arbitrary socket calls without explicit capability grants).
- Restricts access to COM objects, WMI, and other system interfaces.
- Allows only capabilities explicitly granted in the AppContainer manifest.

Chromium grants renderers only the capabilities they need. The specifics are in [`sandbox/win/src/`](https://source.chromium.org/chromium/chromium/src/+/main:sandbox/win/src/).

### The Windows broker

Because a renderer with a Restricted Token can't do almost anything, it needs a helper for the few things it legitimately must do (e.g., reading fonts from the system font directory). The **broker** is a component in the browser process that receives requests from sandboxed renderers and performs specific, validated operations on their behalf. The broker validates each request against a policy list before doing anything.

This is similar in spirit to the Mojo IPC channel (which is why Mojo is replacing many legacy broker calls).

## The macOS sandbox: Seatbelt (10 min)

macOS uses **Seatbelt** (also called the `sandbox(7)` mechanism), an Apple-developed system based on TrustedBSD MAC (Mandatory Access Control) policies.

### Sandbox profiles

Seatbelt uses **profiles** — text-based policy files that specify what operations are allowed. A renderer's profile looks roughly like:

```scheme
(version 1)

(deny default)           ; deny everything not explicitly allowed

(allow signal)           ; allow signals to self
(allow mach-per-user-lookup)  ; Mach IPC bootstrap lookups
(allow file-read*)       ; read-only filesystem access (specific paths)
(file-read-data
    (subpath "/System/Library")   ; system libraries
    (subpath "/usr/lib"))

; explicitly deny sensitive operations:
(deny file-write*)       ; no file writes
(deny network*)          ; no network (renderer uses Mojo for all fetches)
(deny process-exec)      ; no exec
(deny process-fork)      ; no fork

; allow shared memory (needed for rendering output):
(allow ipc-posix-shm)
```

Chromium's renderer sandbox profile is in [`sandbox/mac/renderer.sb`](https://source.chromium.org/chromium/chromium/src/+/main:sandbox/mac/renderer.sb). Open it. It's readable — Seatbelt profiles are just Scheme-like policy expressions.

### The `sandbox_init` call

After spawning the child process, it calls `sandbox_init(profile_str, flags, &error)`. This installs the profile. The kernel then enforces it for every system call the process makes.

### What macOS renderers can and cannot do

**Can**: read specific system library paths, use Mach IPC for the pre-established Mojo channel, use shared memory, signal themselves.

**Cannot**: open files, make network connections, fork, exec, access IOKit (hardware), access most Mach services.

## GPU sandbox — a special case (5 min)

The GPU process is special. It needs to call GPU driver functions — which are often implemented as IOKit calls on macOS, ioctl calls on Linux, or D3D/DXGI calls on Windows. These are privileged APIs.

Chromium's GPU process sandbox:
- **macOS**: has a more permissive sandbox profile than the renderer — it allows IOKit device access for the GPU device.
- **Linux**: runs with a seccomp filter that allows the specific `ioctl` calls needed by the GPU driver but blocks most others.
- **Windows**: runs in a more permissive AppContainer than a renderer, allowing GPU-specific D3D calls.

Historically, GPU sandbox has been one of the weakest sandbox layers because GPU drivers are large, complex, buggy C code with huge API surfaces. A GPU driver exploit inside the GPU process can escape to something with more privilege than a renderer but less than the browser. This is an active area of hardening.

## `chrome://sandbox` — the self-report page (5 min)

Open `chrome://sandbox` on the projector. On Linux, it shows:

```
Renderer Sandbox
  Status: Enabled
  Zygote: Enabled
  PID Namespace: Yes
  ...

GPU Process
  Status: Enabled (partial)
  ...
```

This page is generated by the browser process polling each child process's sandbox state via Mojo. If the sandbox isn't fully enabled (e.g., certain Linux configurations or test builds), it shows degraded status. Good for verifying your own machine's sandbox configuration.

## Defense in depth — the limits of sandboxing (5 min)

The sandbox is one layer of defense, not the only one:

- **Kernel exploits bypass the sandbox.** If an attacker finds a Linux kernel vulnerability, a seccomp filter doesn't help — the kernel itself is compromised. This motivates Site Isolation (L19), ASLR, kernel CFI, and the V8 sandbox (a separate sandboxing layer inside V8 for security within the renderer).
- **The broker and Mojo channel are the sandbox's attack surface.** Every request a sandboxed renderer makes to the broker must be validated. Security bugs in Mojo message handlers are effective sandbox escapes.
- **IPC validation is therefore critical.** This is why the security team audits every new Mojo interface. It's why adding a method to a `.mojom` file that a renderer can call requires careful review. It's also what L20 is about.

## A tiny code excerpt — the baseline seccomp policy (5 min)

Open [`sandbox/linux/seccomp-bpf-helpers/baseline_policy.cc`](https://source.chromium.org/chromium/chromium/src/+/main:sandbox/linux/seccomp-bpf-helpers/baseline_policy.cc) in Code Search.

Show the switch block:

```cpp
ResultExpr BaselinePolicy::EvaluateSyscall(int sysno) const {
  switch (sysno) {
    case __NR_fcntl:
    case __NR_fstat:
    case __NR_lseek:
    case __NR_mmap:
    case __NR_mprotect:
    // ... many allowed syscalls ...
      return Allow();

    case __NR_open:
    case __NR_openat:
    case __NR_socket:
    case __NR_connect:
    case __NR_execve:
    case __NR_ptrace:
    // ... blocked syscalls ...
      return Error(EPERM);

    default:
      return RestrictedError(EPERM, SyscallSets::...);
  }
}
```

Point out: every syscall has a deliberate allow or deny. The switch must handle all ~350 Linux syscalls that exist on supported kernel versions. Missing a syscall is a security bug — the default action is to deny, which is safe, but an accidental deny of a needed syscall can crash the renderer. Both directions require careful maintenance.

## Live demo (15 min)

### Demo 1 — `chrome://sandbox`

Open on projector. Show the sandbox status. Toggle a sandbox flag in `chrome://flags` if any visible ones exist. Re-open and show changed status.

### Demo 2 — strace a renderer

On Linux, run:

```bash
chrome --renderer-process-limit=1 --disable-renderer-sandbox 2>/dev/null &
strace -e trace=open,openat,socket -p $(pgrep -f renderer) 2>&1 | head -30
```

Show the renderer without sandbox making syscalls freely. Then:

```bash
chrome --renderer-process-limit=1 2>/dev/null &
strace -e trace=open,openat,socket -p $(pgrep -f renderer) 2>&1 | head -30
```

With sandbox active, the syscalls are either absent or return `EPERM`. The contrast makes the sandbox real.

> **Warning**: `--disable-renderer-sandbox` is for educational demo only. Never run production code this way.

### Demo 3 — inspect the seccomp filter

```bash
PID=$(pgrep -f "type=renderer")
cat /proc/$PID/status | grep Seccomp
```

Output: `Seccomp: 2` means `SECCOMP_MODE_FILTER` is active on that process.

```bash
# Read the installed filter (requires root or ptrace capability)
# Use tools/seccomp-tools or BPF disassembler
```

Show students that the filter is a real BPF bytecode program installed in the kernel.

## Reading for next lecture

- Reis, Moshchuk, Oskov. *Site Isolation: Process Separation for Web Sites within the Browser.* USENIX Security 2019. [research.google](https://research.google/pubs/site-isolation-process-separation-for-web-sites-within-the-browser/)
- chromium.org: [Site Isolation design doc](https://www.chromium.org/developers/design-documents/site-isolation/)
- chromium.org: [Post-Spectre Web Development](https://www.chromium.org/Home/chromium-security/corb-for-developers/)

## Instructor notes

- The seccomp-bpf section is the most technical. If students haven't seen BPF before, the key concept is "a bytecode program that runs in the kernel on every syscall, deciding allow or deny" — that's enough.
- The macOS and Windows sections can be abbreviated if time is short. Emphasize: each OS has a different mechanism but the principle is the same — use the kernel's access control to restrict what the renderer can do.
- The `strace` demo is visceral. Worth doing live even if the network is slow.

---

[← L17](./L17-multiprocess-architecture.md) · [Unit IV README](./README.md) · [Next: L19 — Site Isolation & Spectre →](./L19-site-isolation-spectre.md)

# Lecture 20 — Mojo: IPC as a First-Class Citizen

| | |
|---|---|
| **Unit** | IV — Process Model & Security |
| **Week** | 10 |
| **Duration** | 1.5 hours |
| **Demo** | `.mojom` to generated C++; tracing a Mojo call end-to-end in Code Search |

## Learning objectives

Students can:

1. Explain what a Mojo message pipe is and what "location-transparent" means.
2. Read a `.mojom` file and identify interfaces, methods, parameters, and return types.
3. Describe how `.mojom` files are compiled to C++ `Remote<T>` / `Receiver<T>` pairs.
4. Locate the client-side call site and server-side handler for a real Mojo interface.
5. Reason about the trust implications of a Mojo interface — which end is trusted, which validates.
6. Explain why designing a `.mojom` correctly is a security decision.

## Opening hook (5 min)

Ask: *"Given what we know from L17 and L18 — a renderer is in a sandboxed process that can barely talk to the OS — how does it get anything done? It can't open files. It can't make network connections. It can't access cookies. Every useful thing a web page does requires something the renderer isn't allowed to do directly."*

The answer is the Mojo channel. The renderer's only real output is Mojo messages sent to the browser process or network service. The browser validates them and acts. The renderer is a computation engine; the browser is its executor of privileged operations.

Mojo is the interface between those two worlds. This lecture is how that interface is designed, compiled, and secured.

## What Mojo is (10 min)

**Mojo** is Chromium's inter-process communication layer. It replaced the legacy "Chrome IPC" system (which was a single serialized-message bus shared between all message types). Legacy IPC is deprecated; all new code uses Mojo.

Mojo provides three core primitives:

### 1. Message pipes

A **message pipe** is a bidirectional, reliable, ordered channel between two endpoints. Each endpoint is a `MojoHandle`. Messages sent from one end arrive at the other. Pipes are:

- **Location-transparent**: the API is identical whether the two endpoints are in the same process or different processes. You call a method on a `Remote<T>`; the implementation receives it in a `Receiver<T>`. You don't know and don't need to know whether the receiver is in-process or across an OS process boundary.
- **Efficiently intra-process**: if both ends are in the same process, no copying occurs — the write on one end directly modifies the other's message queue. Effectively a `PostTask` with serialization overhead.
- **Reliably cross-process**: if the ends are in different processes, the OS pipe (domain socket on Linux, named pipe on Windows, Mach port on macOS) carries bytes. The Mojo layer handles serialization, validation, and routing.

### 2. Data pipes

A **data pipe** is a one-way, high-throughput channel for bulk byte transfer (streaming). Used for: response bodies, image data, audio data. One end produces (`DataPipeProducer`), the other consumes (`DataPipeConsumer`). Backed by shared memory — zero-copy if both ends are in the same process, one-copy (shared memory segment) cross-process.

### 3. Shared buffers

A **shared buffer** is a region of memory visible to multiple processes simultaneously. Used for: compositor layers, paint output, audio buffers, IPC performance-sensitive paths.

## Mojom: the IDL (15 min)

Message pipes are powerful but low-level. For the vast majority of Chromium, the entry point is the **Mojom IDL** — a high-level language for defining typed interfaces.

### A minimal `.mojom` file

```mojom
// src/example/public/mojom/greeter.mojom

module example.mojom;

// An interface implemented by the browser process,
// called by renderers.
interface Greeter {
  // Synchronous: request and response in one mojom "message pair."
  // The "=>" syntax declares a response.
  SayHello(string name) => (string greeting);

  // Fire-and-forget: no response expected.
  Log(string message);
};
```

Mojom concepts:

| Concept | Explanation |
|---|---|
| `module` | Namespace for generated C++ code. `example::mojom::Greeter`. |
| `interface` | A named set of methods, compiled to a C++ abstract interface. |
| Method with `=>` | Request-response pair (async). One Mojo message for the request, one for the response callback. |
| Method without `=>` | Fire-and-forget. One Mojo message; caller gets no acknowledgment. |
| `string` | UTF-8 string. Validated on deserialization. |
| `int32`, `uint64`, `bool`, `float`, `double` | Primitive types. |
| `array<T>` | Sequence of T. |
| `map<K, V>` | Map of K → V. |
| `pending_remote<T>` | A pipe endpoint that, when passed to a method, grants the receiver a client-side handle to interface T. Transferable capability. |
| `pending_receiver<T>` | The server-side endpoint. |

### What the bindings generator produces

Running the Mojom compiler (`mojom_bindings_generator.py`) on `greeter.mojom` produces (in the build output directory):

- `greeter.mojom.h` — C++ header defining:
  - `class Greeter` — the pure-virtual abstract interface.
  - `class GreeterProxy` — the client-side stub (what you call).
  - `class GreeterStub` — the server-side dispatcher (what you implement).
  - The serialization/deserialization code for all method parameters.
- `greeter.mojom-shared.h` — data structures shared between languages.
- `greeter.mojom.cc` — serialization implementations.
- Optionally: `greeter.mojom.js`, `greeter.mojom.java` for other language bindings.

In modern Chromium, clients use the templated wrapper types:

```cpp
// Client side (e.g., in a renderer):
mojo::Remote<example::mojom::Greeter> greeter_remote;
// ... bind it somehow (see below) ...

greeter_remote->SayHello(
    "world",
    base::BindOnce([](const std::string& reply) {
      LOG(INFO) << "Server said: " << reply;
    }));

greeter_remote->Log("Just logging this.");
```

```cpp
// Server side (e.g., in a browser-process service):
class GreeterImpl : public example::mojom::Greeter {
 public:
  void SayHello(const std::string& name,
                SayHelloCallback callback) override {
    std::move(callback).Run("Hello, " + name + "!");
  }

  void Log(const std::string& message) override {
    LOG(INFO) << "[Renderer log] " << message;
  }
};

mojo::Receiver<example::mojom::Greeter> receiver_{this};
```

The callback pattern (`SayHelloCallback`) is how async responses work: the server holds the callback, can call it synchronously or post it to another thread.

### Binding: connecting Remote to Receiver

Before any messages flow, the `Remote` and `Receiver` must be bound — a pipe endpoint pair created and each end given to client and server respectively:

```cpp
// Common pattern: create the pipe pair and pass one end to the remote,
// the other to the implementation's receiver.
auto [receiver, remote] = mojo::PendingReceiver<example::mojom::Greeter>,
                           mojo::PendingRemote<example::mojom::Greeter>
                           /* created via MakeSelfOwnedReceiver or similar */;
```

More commonly in Chromium:

```cpp
mojo::PendingReceiver<example::mojom::Greeter> receiver;
mojo::Remote<example::mojom::Greeter> remote;
remote.Bind(receiver.InitWithNewPipeAndPassRemote());

// Pass `receiver` to the implementation (possibly in another process):
GetBrowserInterfaceBroker()->GetInterface(std::move(receiver));
```

The `BrowserInterfaceBroker` is how renderers obtain handles to browser-side services — it's the entry point for renderer-to-browser capability acquisition.

## Mojo as a security boundary (15 min)

This is the most important part of the lecture.

### The validator runs on deserialization

Every Mojo message is **validated on deserialization** before being dispatched to the handler. The Mojom compiler generates the validation code automatically. For example:

- `string` fields cannot be null if not marked `nullable`.
- `array<T>` sizes cannot exceed `uint32_t` limits.
- `enum` values must be within the defined range.
- `url` type aliases can be restricted to valid URLs.
- `pending_remote<T>` / `pending_receiver<T>` handles must be valid pipe handles.

A renderer cannot send a malformed message and cause undefined behavior in the browser. Malformed messages are rejected and the sender is killed (BadMessage).

### What the browser process must still validate

The Mojom type system handles type safety, not semantic safety. The browser must still validate:

- **Origin/site**: does the requesting renderer have permission to perform this action for this origin? A renderer locked to `evil.com` cannot legitimately request cookies for `bank.com`.
- **Capability**: has this renderer been granted the capability to call this interface? Not all interfaces are available to all renderers.
- **Argument semantics**: a string parameter that represents a file path must be checked for path traversal, even though Mojo ensures it's a valid UTF-8 string.

**Every Mojo handler in the browser process is a potential privilege-escalation vector.** Security review for new Mojo interfaces is extensive.

### `[RuntimeFeature]`, `[RequiresContext]`, and other attributes

Mojom has a number of security-relevant attributes:

```mojom
interface ClipboardHost {
  // Only available with user gesture:
  [RequiresContextType=kFrame]
  ReadText() => (string text);

  // Requires explicit permission:
  [RequiresFeature=ClipboardReadWrite]
  ReadRichText() => (ClipboardData data);
};
```

These don't enforce by themselves — they're annotations that security reviewers check. The enforcement is in the handler.

### The privilege principle in `.mojom` design

**A renderer should never be able to trigger an action in the browser that it hasn't already been granted explicit permission to trigger.**

Rules of thumb for `.mojom` security:

1. **Don't give renderers raw file paths.** If a browser-side function takes a path, construct the path in the browser based on a renderer-provided key, not the raw path.
2. **Don't trust renderer-provided process IDs.** PIDs are guessable; use channel identity instead.
3. **Validate origin on every call.** The renderer's `RenderFrameHost` knows its committed origin; check it.
4. **Keep interfaces narrow.** One specific capability per interface. Don't create a `PowerfulBrowserHelper` that does 50 unrelated things.
5. **Fire-and-forget methods must be idempotent or rate-limited.** A compromised renderer can call them in a loop.

### The `BadMessage` mojo reporter

When the browser process detects a rule violation from a renderer (wrong origin, unexpected call order, invalid argument semantics), it calls `bad_message::ReceivedBadMessage(render_process_host, BadMessageReason::...)`. This:
1. Logs the incident.
2. Sends a `SIGTERM` (Linux) / `TerminateProcess` (Windows) to the renderer.
3. Kills the offending renderer process.

This is the last line of defense against a compromised renderer abusing Mojo. The renderer is dead; other processes continue unaffected.

## A tiny code excerpt — a real Mojo interface (5 min)

Open [`third_party/blink/public/mojom/frame/frame.mojom`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/public/mojom/frame/frame.mojom) on the projector.

This is the main `Frame` interface — the channel between `RenderFrameImpl` (renderer) and `RenderFrameHostImpl` (browser). Show students:

- The `module` declaration.
- A few methods, e.g. `DidCommitProvisionalLoad`, `OpenURL`, `DidChangeName`.
- The parameter types — many are themselves mojom structs defined in other files.
- The `=>` callbacks where the browser must acknowledge.

Then find the handler. Search Code Search for `RenderFrameHostImpl::OpenURL`. Find the C++ implementation. Show the validation checks at the start of the function body:

```cpp
void RenderFrameHostImpl::OpenURL(blink::mojom::OpenURLParamsPtr params) {
  // Validate that this renderer is allowed to trigger this navigation.
  if (!CanSubframeNavigate(this, params->url, ...)) {
    bad_message::ReceivedBadMessage(GetProcess(), ...);
    return;
  }
  // ... proceed with navigation
}
```

This pattern — validate immediately, kill on failure, proceed if valid — is everywhere in `RenderFrameHostImpl`. It's the entire security model of the browser-renderer trust boundary made concrete.

## Live demo — `.mojom` to C++ to call site roundtrip (20 min)

### Demo 1 — find a simple `.mojom`

Navigate to [`third_party/blink/public/mojom/frame/user_activation_notification_type.mojom`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/public/mojom/frame/user_activation_notification_type.mojom) — a simple enum mojom. Then [`third_party/blink/public/mojom/frame/frame.mojom`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/public/mojom/frame/frame.mojom) — a complex interface. Show the structural difference.

### Demo 2 — find the generated headers

In a Chromium build output directory:

```bash
ls out/Default/gen/third_party/blink/public/mojom/frame/
# → frame.mojom.h, frame.mojom-shared.h, frame.mojom.cc, frame.mojom-blink.h, ...
```

Open `frame.mojom.h`. Show the generated `Remote<Frame>` / `Receiver<Frame>` specializations, the callback types, the serialization code. Students see what the IDL compiles to.

### Demo 3 — trace `frame.mojom`'s `OpenURL` end-to-end

Use Code Search:

1. In `frame.mojom`: find `OpenURL` method declaration.
2. In Code Search, search for `RemoteFrame::OpenURL` (the generated remote stub call).
3. Find where it's called from in the renderer: `content/renderer/render_frame_impl.cc` — `RenderFrameImpl::OpenURL`. Show it calls `GetRemoteFrame()->OpenURL(...)`.
4. Find the browser-side handler: `content/browser/renderer_host/render_frame_host_impl.cc` — `RenderFrameHostImpl::OpenURL`. Show the validation.

This is a complete IPC round-trip, visible in source code:

```
Renderer:  RenderFrameImpl::OpenURL
             ↓ mojom Remote<Frame>::OpenURL(params)
[PIPE]         ↓ [serialized, transported across process boundary]
Browser:   RenderFrameHostImpl::OpenURL(params)
             ↓ validate
             ↓ begin navigation
```

### Demo 4 — inspect a `.mojom` file for HW10 preview

Open [`third_party/blink/public/mojom/payments/payment_request.mojom`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/public/mojom/payments/payment_request.mojom). This is one of the `.mojom` files students may choose for HW10. Walk through:

- Which interface is the renderer-side caller?
- Which is the browser-side implementer?
- What validations would you expect in the handler?
- Name one method call that, if accepted without validation, could be a security bug.

Give students 5 minutes to read and discuss in pairs before you explain.

## Reading for next unit

Unit IV ends here. Next up is Unit V: Networking & Storage. Reading:

- chromium.org: [Network Stack design doc](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/net/docs/)
- chromium.org: [Life of a URLRequest](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/net/docs/life-of-a-url-request.md)

## Instructor notes

- HW10 (Read a .mojom) is assigned this lecture.
- The "Mojo as a security boundary" section is the most important part. Students need to understand that every Mojo handler in the browser process is a potential privilege escalation. Dwell on it.
- The `OpenURL` roundtrip demo works best with two browser windows open — Code Search on one side, the source file on the other. Live navigation through the call chain is more compelling than slides.
- Remind students: Midterm 2 is at the end of Week 11. Unit IV is the core of Part B (security reasoning essay) and Part C (read a `.mojom`).

---

[← L19](./L19-site-isolation-spectre.md) · [Unit IV README](./README.md) · **End of Unit IV** · Next: Unit V coming soon

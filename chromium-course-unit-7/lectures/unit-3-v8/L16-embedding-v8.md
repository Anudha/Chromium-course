# Lecture 16 — Embedding V8: The API That Runs Half the Internet

| | |
|---|---|
| **Unit** | III — V8 and JavaScript |
| **Week** | 8 |
| **Duration** | 1.5 hours |
| **Demo** | 40-line C++ program that embeds V8, reads input, exposes a function, handles an exception |

## Learning objectives

Students can:

1. Describe the C++ API primitives: `Isolate`, `Context`, `HandleScope`, `Local<T>`, `Global<T>`.
2. Compile and link a small V8 embedder program.
3. Expose a C++ function to JavaScript and call it.
4. Handle uncaught JavaScript exceptions from C++.
5. Reason about lifetime and GC safety in embedding code.

## Opening hook (5 min)

Ask the class: *"Who uses Node.js?"* Hands go up. *"Deno? Cloudflare Workers? Edge Functions? Electron? Bun?"* Most hands stay up.

*"All of these are V8 embedders.* (Technically Bun and Hermes use different engines; Cloudflare Workers is V8; Deno is V8; Node is V8; Electron is V8 + Chromium's content layer.) *Each one is a C++ or Rust program that includes V8 as a library, creates an Isolate, and runs JavaScript inside it. This lecture is the API they're all built on."*

By the end of class, students will have built a tiny V8 embedder themselves. HW8 takes it further.

## The embedding API — overview (10 min)

V8's public headers live in [`v8/include/`](https://source.chromium.org/chromium/chromium/src/+/main:v8/include/). The main one is [`v8.h`](https://source.chromium.org/chromium/chromium/src/+/main:v8/include/v8.h). Every embedder starts by including it.

The core types, which we'll use repeatedly:

| Type | What it is |
|---|---|
| `v8::Platform` | A process-global object providing threading + task scheduling to V8 |
| `v8::Isolate` | One V8 instance (heap, tiers, state). Must be entered by one thread at a time. |
| `v8::Context` | One JS execution environment (globals, builtins). Created within an Isolate. |
| `v8::HandleScope` | A stack-based scope that owns local handles. Created on the C++ stack. |
| `v8::Local<T>` | A handle to a V8 object, valid only inside the innermost HandleScope. |
| `v8::Global<T>` | A handle to a V8 object that outlives HandleScopes. Manually managed. |
| `v8::MaybeLocal<T>` | A Local that may be empty (V8 API returns these when an operation can fail). |
| `v8::TryCatch` | Catches JS exceptions into C++. |

### Why handles?

V8 objects live in the GC heap. They can **move** during GC. A raw pointer you saved five minutes ago may now point to garbage or to a different object. V8's API refuses to let you hold raw pointers.

A `Local<T>` is actually a pointer to a pointer — to a slot in the HandleScope's side table. When GC moves objects, it updates the side table, and your `Local<T>` transparently continues to work. When the HandleScope is destroyed (C++ RAII), all its locals are invalidated.

`Global<T>` is used when you want a handle to outlive the current HandleScope — e.g., stored in a C++ data structure. You must explicitly `Reset()` it when done.

### Why contexts?

Within one Isolate, you can have multiple Contexts. Each has its own globals (its own `window`, its own `Array`, its own `Object.prototype`). JS code runs in exactly one Context at a time, established by entering it (`Context::Scope`).

Chromium uses one Context per frame. Node.js uses (typically) one Context per `vm.createContext()` or per worker thread. This is how you isolate untrusted scripts from your embedder's own code.

## Lifetime and initialization (10 min)

The full lifecycle of a V8 embedder program:

```cpp
// 1. Initialize the V8 platform (global, once per process).
v8::V8::InitializeICUDefaultLocation(argv[0]);
v8::V8::InitializeExternalStartupData(argv[0]);
std::unique_ptr<v8::Platform> platform = v8::platform::NewDefaultPlatform();
v8::V8::InitializePlatform(platform.get());
v8::V8::Initialize();

// 2. Create an Isolate.
v8::Isolate::CreateParams create_params;
create_params.array_buffer_allocator =
    v8::ArrayBuffer::Allocator::NewDefaultAllocator();
v8::Isolate* isolate = v8::Isolate::New(create_params);

{
  v8::Isolate::Scope isolate_scope(isolate);   // enter the isolate on this thread

  // 3. Create a HandleScope — any Locals below live in here.
  v8::HandleScope handle_scope(isolate);

  // 4. Create a Context.
  v8::Local<v8::Context> context = v8::Context::New(isolate);

  // 5. Enter the context.
  v8::Context::Scope context_scope(context);

  // 6. Now we can run JS. Source → Script → Run.
  v8::Local<v8::String> source =
      v8::String::NewFromUtf8(isolate, "'Hello, ' + (5 + 7)").ToLocalChecked();
  v8::Local<v8::Script> script =
      v8::Script::Compile(context, source).ToLocalChecked();
  v8::Local<v8::Value> result = script->Run(context).ToLocalChecked();

  // 7. Read the result back out.
  v8::String::Utf8Value utf8(isolate, result);
  printf("%s\n", *utf8);
}

// 8. Dispose cleanup.
isolate->Dispose();
v8::V8::Dispose();
v8::V8::DisposePlatform();
delete create_params.array_buffer_allocator;
```

This is verbatim the structure of [`v8/samples/hello-world.cc`](https://source.chromium.org/chromium/chromium/src/+/main:v8/samples/hello-world.cc). Open it on the projector.

Notes on the above:

- **`Isolate::Scope`, `HandleScope`, `Context::Scope`** are RAII wrappers. When they go out of scope (C++ destructor), they exit the thing they entered. This is how V8 ensures you haven't forgotten to leave.
- **`ToLocalChecked()`** converts a `MaybeLocal<T>` to a `Local<T>` — crashes if empty. Good for demo/quick code, use proper error handling in production.
- **`Utf8Value`** copies a V8 string out to a C-string. Necessary because V8 strings are V8-owned and can move.

## Exposing a C++ function to JavaScript (15 min)

The usual reason to embed V8: expose C++ functionality. Example: a JS script that calls a C++ `printThing` to log, or a C++ `getTemperature` to read a sensor.

### Define the callback

```cpp
void PrintThing(const v8::FunctionCallbackInfo<v8::Value>& args) {
  v8::Isolate* isolate = args.GetIsolate();

  // args is an array-like of the JS arguments.
  for (int i = 0; i < args.Length(); i++) {
    v8::HandleScope handle_scope(isolate);   // local handle scope for this iteration
    v8::Local<v8::String> s = args[i]->ToString(isolate->GetCurrentContext()).ToLocalChecked();
    v8::String::Utf8Value utf8(isolate, s);
    printf("%s%s", i > 0 ? " " : "", *utf8);
  }
  printf("\n");

  // Set return value (optional; defaults to undefined).
  args.GetReturnValue().SetUndefined();
}
```

Signature must be exactly `void(const v8::FunctionCallbackInfo<v8::Value>&)`. V8 invokes callbacks with this signature when JS calls the function.

### Install it on the global object

After creating the Context:

```cpp
v8::Local<v8::Context> context = v8::Context::New(isolate);
v8::Context::Scope scope(context);

// Create a Function from the callback.
v8::Local<v8::FunctionTemplate> tmpl = v8::FunctionTemplate::New(isolate, PrintThing);
v8::Local<v8::Function> fn = tmpl->GetFunction(context).ToLocalChecked();

// Attach it to the global object under the name "printThing".
v8::Local<v8::Object> global = context->Global();
global->Set(context,
            v8::String::NewFromUtf8(isolate, "printThing").ToLocalChecked(),
            fn).Check();
```

Now JS code in this Context can call `printThing(1, "two", {})`, and the C++ callback runs.

### Expanded variants

- **Arguments of complex types**: use `args[i]->IsString()`, `args[i]->IsNumber()`, etc., then convert.
- **Pass C++ object instances back to JS**: wrap in `v8::External::New(isolate, ptr)` and attach as an internal field on a JS object. Common pattern; Node.js and Chromium do this everywhere (a DOM node is a JS wrapper around a C++ `Node*`).
- **Asynchronous callbacks**: schedule a task with `v8::Platform::GetForegroundTaskRunner(isolate)`, which will run it on the Isolate's thread.

## Running JS from C++ — strings, compiled scripts, modules (5 min)

Three granularities:

```cpp
// One-shot: compile + run a string.
v8::Local<v8::String> src = v8::String::NewFromUtf8(isolate, "1 + 1").ToLocalChecked();
v8::Local<v8::Script> script = v8::Script::Compile(context, src).ToLocalChecked();
v8::Local<v8::Value> result = script->Run(context).ToLocalChecked();

// Compile once, run many times (cheaper for hot code):
v8::Local<v8::Script> precompiled = v8::Script::Compile(context, src).ToLocalChecked();
for (int i = 0; i < 1000; i++) {
  precompiled->Run(context).ToLocalChecked();
}

// ES modules: separate API, requires a loader callback.
v8::ScriptOrigin origin(/* module-flagged options */);
v8::ScriptCompiler::Source src_module(source_str, origin);
v8::Local<v8::Module> mod = v8::ScriptCompiler::CompileModule(isolate, &src_module).ToLocalChecked();
mod->InstantiateModule(context, ResolveCallback).Check();
v8::Local<v8::Value> result = mod->Evaluate(context).ToLocalChecked();
```

Modules require a bit of plumbing — a `ResolveCallback` that tells V8 how to fetch module dependencies. For most embedders (including this class's HW8), one-shot Script is plenty.

## Handling JS exceptions in C++ (10 min)

JS throws exceptions. If your embedder ignores them, the `MaybeLocal<T>` returned by `Run()` will be empty, and `ToLocalChecked()` will crash. Proper code uses `v8::TryCatch`.

```cpp
v8::TryCatch try_catch(isolate);

v8::Local<v8::String> src = v8::String::NewFromUtf8(
    isolate, "throw new Error('boom');").ToLocalChecked();
v8::MaybeLocal<v8::Script> maybe_script = v8::Script::Compile(context, src);
v8::Local<v8::Script> script;
if (!maybe_script.ToLocal(&script)) {
  // Compile error — syntax error, etc.
  ReportException(isolate, &try_catch);
  return;
}

v8::MaybeLocal<v8::Value> maybe_result = script->Run(context);
v8::Local<v8::Value> result;
if (!maybe_result.ToLocal(&result)) {
  // Runtime error.
  ReportException(isolate, &try_catch);
  return;
}

// Success — use `result`.
```

The `ReportException` helper:

```cpp
void ReportException(v8::Isolate* isolate, v8::TryCatch* try_catch) {
  v8::HandleScope hs(isolate);
  v8::Local<v8::Context> ctx = isolate->GetCurrentContext();
  v8::String::Utf8Value exception(isolate, try_catch->Exception());
  v8::Local<v8::Message> msg = try_catch->Message();
  if (msg.IsEmpty()) {
    fprintf(stderr, "JS exception: %s\n", *exception);
    return;
  }
  v8::String::Utf8Value filename(isolate,
      msg->GetScriptResourceName()->ToString(ctx).ToLocalChecked());
  int line = msg->GetLineNumber(ctx).FromJust();
  fprintf(stderr, "%s:%d: %s\n", *filename, line, *exception);

  v8::Local<v8::Value> stack_trace;
  if (try_catch->StackTrace(ctx).ToLocal(&stack_trace)) {
    v8::String::Utf8Value stack(isolate, stack_trace);
    fprintf(stderr, "%s\n", *stack);
  }
}
```

This gives you a proper filename:line:error + stack trace, just like Node's.

## Building and linking (5 min)

To actually compile an embedder, you need:

- V8 headers (`v8/include/`).
- V8 libraries, built with the same configuration as your link target. Component build → `libv8.so`, `libv8_libplatform.so`, `libv8_libbase.so` plus dependencies; static/monolithic → one big library.
- ICU, zlib, and a few other transitive deps unless they're statically linked in.

Recommended for HW8: use `v8_monolithic = true` and `use_custom_libcxx = false` in your V8 `args.gn`. This builds a single `libv8_monolith.a` you can link against without pulling in V8's internal libc++.

Then:

```bash
g++ -Iv8/include -pthread \
    hello-embedder.cc \
    v8/out/x64.release/obj/libv8_monolith.a \
    -o hello-embedder -ldl
./hello-embedder
```

Exact invocation varies. V8's [`samples/` directory](https://source.chromium.org/chromium/chromium/src/+/main:v8/samples/) has working Makefile-style examples.

## A tiny code excerpt — the full embedder, under 40 lines (5 min)

This is what HW8 starts from (students extend it). Display on the projector:

```cpp
// hello-embedder.cc
#include <cstdio>
#include <libplatform/libplatform.h>
#include <v8.h>

void Greet(const v8::FunctionCallbackInfo<v8::Value>& args) {
  v8::Isolate* isolate = args.GetIsolate();
  v8::String::Utf8Value name(isolate, args[0]);
  printf("Hello from C++, %s!\n", *name);
  args.GetReturnValue().Set(v8::Integer::New(isolate, 42));
}

int main(int argc, char* argv[]) {
  v8::V8::InitializeICUDefaultLocation(argv[0]);
  v8::V8::InitializeExternalStartupData(argv[0]);
  auto platform = v8::platform::NewDefaultPlatform();
  v8::V8::InitializePlatform(platform.get());
  v8::V8::Initialize();

  v8::Isolate::CreateParams params;
  params.array_buffer_allocator = v8::ArrayBuffer::Allocator::NewDefaultAllocator();
  v8::Isolate* isolate = v8::Isolate::New(params);
  {
    v8::Isolate::Scope is(isolate);
    v8::HandleScope hs(isolate);
    v8::Local<v8::Context> ctx = v8::Context::New(isolate);
    v8::Context::Scope cs(ctx);

    // expose Greet
    v8::Local<v8::FunctionTemplate> t = v8::FunctionTemplate::New(isolate, Greet);
    ctx->Global()->Set(ctx,
        v8::String::NewFromUtf8(isolate, "greet").ToLocalChecked(),
        t->GetFunction(ctx).ToLocalChecked()).Check();

    // run some JS
    v8::Local<v8::String> src = v8::String::NewFromUtf8(isolate,
        "const n = greet('world'); `JS got back: ${n}`;"
    ).ToLocalChecked();
    v8::Local<v8::Script> script = v8::Script::Compile(ctx, src).ToLocalChecked();
    v8::Local<v8::Value> result = script->Run(ctx).ToLocalChecked();
    v8::String::Utf8Value out(isolate, result);
    printf("%s\n", *out);
  }
  isolate->Dispose();
  v8::V8::Dispose();
  v8::V8::DisposePlatform();
  delete params.array_buffer_allocator;
  return 0;
}
```

Running produces:

```
Hello from C++, world!
JS got back: 42
```

38 lines of C++. We've now built a JavaScript runtime. Point out — this is, structurally, the shape of Node.js's main.

## Live demo — build and run the embedder (15 min)

### Demo 1 — build

Pre-prepare a V8 monolithic build on your machine (this takes an hour; do it before class).

```bash
cd /path/to/v8/v8
gn gen out/embedder --args='is_debug=false v8_monolithic=true use_custom_libcxx=false'
autoninja -C out/embedder v8_monolith
```

Then compile the example:

```bash
g++ -std=c++20 -Iinclude -pthread \
    samples/my-embedder.cc \
    out/embedder/obj/libv8_monolith.a \
    -o my-embedder -ldl
./my-embedder
```

Show it runs. The printout proves JS → C++ → JS roundtripped.

### Demo 2 — add a TryCatch

Modify the C++ to run broken JS:

```cpp
v8::Local<v8::String> src = v8::String::NewFromUtf8(isolate,
    "throw new Error('kaboom');"
).ToLocalChecked();
```

Without `TryCatch`: the `ToLocalChecked()` call will crash the process. Show the crash.

Add the `TryCatch` pattern. Show it reports "kaboom" gracefully.

### Demo 3 — pass in a C++ object

Modify to expose a C++ counter:

```cpp
struct Counter { int value = 0; };
static Counter g_counter;

void IncrementCounter(const v8::FunctionCallbackInfo<v8::Value>& args) {
  g_counter.value++;
  args.GetReturnValue().Set(v8::Integer::New(args.GetIsolate(), g_counter.value));
}
```

Install, call from JS:

```javascript
for (let i = 0; i < 5; i++) console.log(increment());
```

Output: 1, 2, 3, 4, 5. Mundane-looking but demonstrates that C++ state persists across calls, as it would for any real native binding.

### Demo 4 — the performance story

With the embedder, run a trivial benchmark:

```cpp
v8::Local<v8::String> src = v8::String::NewFromUtf8(isolate,
    "let s = 0; for (let i = 0; i < 1e8; i++) s += i; s"
).ToLocalChecked();
```

Time it. On a laptop: around 80 ms. Compare with the same loop in plain C++. Typically 2–3× slower — remarkable for a dynamic language.

## Where embedders live (5 min)

Quick tour of real embedders for context:

- **Node.js** — [github.com/nodejs/node](https://github.com/nodejs/node). Read `src/node_main.cc` — it's recognizable.
- **Deno** — Rust-based, uses V8 via `rusty_v8` bindings.
- **Cloudflare Workers** — proprietary, but Kenton Varda has given public talks about the architecture.
- **Electron** — Chromium content layer + Node, exposing both JS worlds in the same process.
- **Chromium itself** — the biggest embedder. [`third_party/blink/renderer/bindings/`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/bindings/) is the code-generator-and-runtime for all the IDL-based web API bindings. Students traced through this in HW3.

## Reading for next lecture

Unit III is done after this lecture — next up is Unit IV (Process Model & Security). Reading:

- chromium.org: [Multi-process architecture design doc](https://www.chromium.org/developers/design-documents/multi-process-architecture/)
- chromium.org: [Process model and site isolation](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/process_model_and_site_isolation.md)

## Instructor notes

- HW8 is assigned this lecture.
- Pre-build a V8 monolith on your instructor machine. The live build demo is only reasonable if compile is already done.
- Some students won't have built V8. Offer fallback: they can use a Docker image you provide with V8 pre-built.
- The lecture flow is "motivation → API tour → full example → demos." If time is tight, compress the API tour and emphasize the example.

---

[← L15](./L15-garbage-collection.md) · [Unit III README](./README.md) · **End of Unit III** · Next: Unit IV coming soon

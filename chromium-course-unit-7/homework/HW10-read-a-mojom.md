# HW10 — Read a .mojom

**Assigned:** Week 10 · **Due:** End of Week 10 · **Weight:** ~2.3% of course grade

## Goal

Navigate from a `.mojom` interface definition to its C++ implementation on both the renderer and browser sides, reason about trust boundaries, and identify a potential security concern in its design.

## Background

In L20 we traced `frame.mojom`'s `OpenURL` end-to-end: from mojom IDL → generated C++ → renderer call site → browser-process handler → validation. This assignment asks you to do the same trace for a `.mojom` file you haven't seen in class.

## Choose one `.mojom` file from this list

Pick one you haven't analyzed before:

- [`third_party/blink/public/mojom/payments/payment_request.mojom`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/public/mojom/payments/payment_request.mojom)
- [`third_party/blink/public/mojom/notifications/notification_service.mojom`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/public/mojom/notifications/notification_service.mojom)
- [`third_party/blink/public/mojom/geolocation/geolocation_service.mojom`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/public/mojom/geolocation/geolocation_service.mojom)
- [`third_party/blink/public/mojom/clipboard/clipboard.mojom`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/public/mojom/clipboard/clipboard.mojom)
- [`third_party/blink/public/mojom/quota/quota_manager_host.mojom`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/public/mojom/quota/quota_manager_host.mojom)
- [`third_party/blink/public/mojom/mediastream/media_stream.mojom`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/public/mojom/mediastream/media_stream.mojom)

If you want to do a different `.mojom`, check with the instructor first.

## Deliverables

Submit `HW10-<unityID>.md` containing:

## Section 1 — Interface summary (20 pts)

State:
- Which `.mojom` file you chose and its full path.
- The module name.
- Every interface defined in the file (name + purpose in one sentence).
- Every struct and enum defined (name + purpose in one sentence).
- The total number of methods across all interfaces.

## Section 2 — Client/server identification (15 pts)

For each interface in the file, identify:

- **Which side implements it**: browser process or renderer process?
- **Which side calls it**: renderer or browser?
- **How you determined this**: state the evidence. (Hint: look at file paths like `content/browser/` vs `content/renderer/`, or `blink/renderer/` vs `chrome/browser/`. `ChromeContentBrowserClient` and `BrowserInterfaceBroker` are browser-side. `RenderFrameImpl` and `BlinkInterfaceRegistry` are renderer-side.)

If the file has multiple interfaces, identify all of them. Some `.mojom` files have both a renderer-implemented and a browser-implemented interface (a callback pattern).

## Section 3 — End-to-end trace of one method (30 pts)

Pick one method from any interface in the file. Trace it fully:

1. **The `.mojom` declaration**: paste the method signature. Explain each parameter type.
2. **The renderer call site**: the file path + line number where the renderer calls this method via the generated `Remote<T>`. Paste 5-10 lines of context. Code Search link required.
3. **The generated remote stub** (optional if too deep): in your build's `out/Default/gen/`, find the generated `.mojom.h` and locate the generated `Remote<T>::MethodName` stub.
4. **The browser-process handler**: the file path + line number of the C++ method that handles this. Paste 5-10 lines. Code Search link required.
5. **The trust boundary**: between steps 2 and 4, which process boundary is crossed? How?

Draw a simple diagram showing the flow:

```
[renderer process]                   [browser process]
RenderFrameImpl::TriggerX()
  → remote_->MethodName(params)
      ↓ (Mojo pipe)
                               → HandlerImpl::MethodName(params)
                                     ↓ validate
                                     ↓ execute
                                     ↓ callback(result)
      ← (Mojo pipe) ←
  callback(result) received
```

## Section 4 — Validation analysis (20 pts)

In the browser-process handler, identify at least **two validations** the code performs before acting on the request. For each:

1. What is being validated?
2. What happens if the validation fails? (`bad_message::ReceivedBadMessage`? Return early? Reject the request?)
3. What attack would succeed if this validation were missing?

If the handler you picked has fewer than two validations, pick a different method within the same `.mojom` file.

## Section 5 — Security analysis (15 pts)

Answer one of these, in 3–5 sentences:

**Option A**: Identify one method in this `.mojom` that you believe has insufficient validation in its handler. Explain what argument or precondition could be abused by a compromised renderer, and what the impact would be.

**Option B**: Identify one method that you believe is particularly well-secured. Explain what the design does right — e.g., narrow capability, strong validation, origin-locked, rate-limited, etc.

You may need to read the handler code carefully to answer either option. Being specific is required; "it doesn't validate the URL" with no URL example is not full credit.

## Submission

Submit as `HW10-<unityID>.md`. All Code Search links must be working at submission time.

## Why this is AI-resistant

AI assistants routinely hallucinate file paths and method names in Chromium. Every Code Search link you provide is verified by the grader. A fabricated path is immediately obvious. The security analysis requires reasoning about trust that doesn't appear verbatim in any documentation.

## Grading rubric

| Component | Points |
|---|---|
| Interface summary complete and accurate | 20 |
| Client/server identification correct with evidence | 15 |
| End-to-end trace: all 4 steps with working links | 30 |
| Validation analysis: 2 validations correctly identified | 20 |
| Security analysis: substantive and specific | 15 |
| **Total** | **100** |

## Hints

- Code Search's "Callers" panel for a method is your best friend. Start from the `.mojom` declaration, find the generated code's receiver class, find all callsites.
- For browser-side handlers, search for `<ClassName>::<MethodName>` in Code Search where `ClassName` is the C++ class that implements the Mojom interface (often found by searching for `: public mojom::<InterfaceName>` in files under `content/browser/`).
- The `BrowserInterfaceBroker` is where renderers obtain browser-side interface endpoints. Searching for your interface name in `browser_interface_binders.cc` or similar often leads to the registration site.

## AI usage policy

You may use AI to explain Mojom syntax, find related concepts, or clarify C++ patterns. All file paths, line numbers, and links must be verified by you in Code Search. The security analysis must be your own reasoning. Cite AI usage in `AI-USAGE.md`.

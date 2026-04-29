# HW4 — Parser Pathology

**Assigned:** Week 4 · **Due:** End of Week 4 · **Weight:** ~2.3% of course grade

## Goal

Discover how Chromium's HTML parser handles pathological input, by predicting, testing, and citing the spec.

## Background

In L8 we saw that `<p><div></div></p>` produces three sibling nodes, not nested ones. The HTML spec defines exactly how the parser recovers from malformed markup. This HW asks you to explore five cases hands-on.

## Deliverables

Submit a single markdown or PDF file containing **five pathological HTML cases**. For each case:

### 1. The input

A 1-3 line HTML snippet that produces a non-obvious DOM.

### 2. Your prediction

Before testing, write down what you expect the DOM tree to be. Be specific — use nesting indentation. If you're confident, say so; if you're unsure, note your uncertainty.

### 3. The actual output

Paste the HTML into a page (or use the console: `document.body.innerHTML = '...'`), then run `document.body.outerHTML` (or use DevTools Elements panel). Show the actual DOM as a code block. If your prediction was wrong, **do not go back and edit it** — wrong predictions are scientifically interesting and the HW is not graded on prediction accuracy.

### 4. The spec citation

Point to the specific step in the [HTML Living Standard §13 — Parsing](https://html.spec.whatwg.org/multipage/parsing.html) that explains the behavior. Cite the section number and quote (briefly) or paraphrase the rule.

## Required case coverage

Your five cases must collectively include at least:

- [ ] One case involving implicit tag closing (e.g., `<p>` implicitly closed by a block element)
- [ ] One case involving foster parenting (mis-placed content inside `<table>`)
- [ ] One case involving character references or weird text patterns (e.g., `&notreal;`, CDATA-like content)
- [ ] One case involving `</br>` vs `<br/>` vs `<br>` (they parse differently!)
- [ ] One case of your choice — something you find surprising

Suggestions if stuck:

- `<p>text<p>more text<p>even more</p></p></p>`
- `<table>Hello<tr><td>World</td></tr></table>`
- `<form><form>nested</form></form>`
- `<b>1<i>2</b>3</i>4`
- `<!--><!-- comment -->`
- `<script>alert('hi')</script>` vs `<script><!--alert('hi')--></script>`
- `<ul><li>1<li>2<li>3</ul>`

## Submission

Submit as `HW4-<unityID>.md` or `.pdf`. Include working links to spec sections.

## Why this is AI-resistant

AI assistants frequently get HTML parsing wrong. The spec citations require you to actually read the spec. Your predictions are unique to you and not falsifiable. The actual DOM output is verifiable by the grader.

## Grading rubric

| Component | Points |
|---|---|
| 5 distinct cases covering required categories | 25 |
| Clear "before" prediction for each | 15 |
| Verified actual output for each | 20 |
| Spec citations correctly identify the relevant rule | 30 |
| Reflection on prediction-vs-reality (at least one case) | 10 |
| **Total** | **100** |

## AI usage policy

You may use AI to discuss *why* the parser behaves a certain way, but **predictions must be yours** (written before testing). Cite AI usage in `AI-USAGE.md`.

# HW1 — Browser Forensics

**Assigned:** Week 1 · **Due:** End of Week 1 · **Weight:** ~2.3% of course grade

## Goal

Get familiar with Chromium by exploring the introspection pages built into Chrome itself. Every deliverable is unique to your machine, so AI cannot fabricate the answer.

## Background

Chromium exposes roughly 80 internal `chrome://` pages that reveal its state: version info, active experiments, registered URL handlers, field trials, component versions, tracing, and more. This assignment forces you to actually look at some of them.

## Deliverables

Produce a single PDF or markdown file (1–2 pages) containing the following, each with a screenshot:

### 1. Your exact Chromium/Chrome version and V8 version

Visit `chrome://version`. Include a screenshot showing:

- Chrome (or Chromium) version
- Revision hash
- OS version
- JavaScript engine (V8) version
- Command line
- User Agent string

### 2. Three active field trials on your machine

Visit `chrome://version/?show-variations-cmd`. Pick any three variations ("field trials") and for each:

- Name the field trial
- State which group you're in
- Briefly describe (in your own words, one sentence) what the feature likely does based on its name

### 3. The list of registered URL schemes

Visit `chrome://chrome-urls`. List all URL schemes shown. Identify three `chrome://` pages you find most interesting and explain in one sentence each why.

### 4. One flag in `chrome://flags` you'd enable and why

Visit `chrome://flags`. Pick one flag you would enable (don't actually enable it unless you want to). Explain:

- What the flag controls
- Why you might want it
- One reasonable risk of enabling it

## Submission

Submit via the course LMS as a PDF or `.md` file named `HW1-<unityID>.pdf` or `.md`.

## Why this is AI-resistant

Your Chrome version, field trial assignments, and installed profile state are unique to your machine. An AI cannot produce these values without your screenshots.

## Grading rubric

| Component | Points |
|---|---|
| Version info screenshot with all required fields | 20 |
| Three field trials with sensible interpretations | 25 |
| URL scheme list + 3 interesting pages | 25 |
| Flag writeup | 25 |
| Reproducibility (another student could follow your steps) | 5 |
| **Total** | **100** |

## AI usage policy

You may use AI to help interpret what a field trial name or flag does. Cite it in `AI-USAGE.md`.

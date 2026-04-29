# CSC/CHE 591: Inside Chromium

**Architecture, Engineering, and the Modern Web Platform**

A one-semester interdepartmental course at NC State, cross-listed between Computer Science, Chemical & Biomolecular Engineering, and Chemistry.

> Chromium powers Chrome, Edge, Brave, Opera, Arc, Electron (VS Code, Slack, Discord, Figma desktop), Android WebView, and more. It is one of the largest, most consequential open-source codebases in the world — and almost nothing is taught about it at the university level. This course fixes that.

## Quick links

- [Syllabus](./SYLLABUS.md)
- [Lectures](./lectures/)
  - [Unit I — Foundations (L1–L6)](./lectures/unit-1-foundations/)
  - [Unit II — The Rendering Pipeline (L7–L12)](./lectures/unit-2-rendering/)
  - [Unit III — V8 and JavaScript (L13–L16)](./lectures/unit-3-v8/)
  - [Unit IV — Process Model & Security (L17–L20)](./lectures/unit-4-security/)
  - Unit V — Networking & Storage (L21–L22) *(coming soon)*
  - Unit IV — Process Model & Security (L17–L20) *(coming soon)*
  - Unit V — Networking & Storage (L21–L22) *(coming soon)*
  - Unit VI — The Web Platform for Science (L23–L26) *(coming soon)*
  - Unit VII — Contribution & Ecosystem (L27–L28) *(coming soon)*
- [Homework assignments](./homework/)
- [Exams](./exams/)
- [Resources](./resources/)

## Course at a glance

| | |
|---|---|
| **Meeting times** | Tuesday & Thursday, 1.5 hours |
| **Duration** | 14 weeks (28 lectures) |
| **Prerequisites** | CSC 216 or equivalent; C++ and/or JavaScript familiarity; command line |
| **Cross-listed** | Computer Science / Chemical & Biomolecular Engineering / Chemistry |
| **Major assessments** | 13 weekly HW + 2 midterms + final exam + final project |

## How to use this repo

- **Instructors** adapting this course: fork it. Everything is CC-BY.
- **Students** enrolled: homework stubs and exam study guides are in their respective folders.
- **Self-learners**: work through the lectures in order. The build lab (Week 2) is the single highest-effort prerequisite; budget a weekend for it.

## Structure

```
chromium-course/
├── SYLLABUS.md                        # full course syllabus
├── README.md                          # this file
├── lectures/
│   └── unit-1-foundations/
│       ├── README.md                  # unit overview
│       ├── L01-what-is-chromium.md
│       ├── L02-browser-as-os.md
│       ├── L03-getting-the-source.md
│       ├── L04-gn-ninja-build.md
│       ├── L05-directory-archaeology.md
│       └── L06-coding-standards-reviews.md
├── homework/
│   ├── README.md                      # assignment overview
│   ├── HW01-browser-forensics.md
│   ├── HW02-the-build.md
│   └── ...
├── exams/
│   ├── midterm-1.md
│   ├── midterm-2.md
│   └── final.md
└── resources/
    └── primary-sources.md             # curated link list
```

## License

Course materials: [CC-BY-4.0](./LICENSE). Use, remix, teach.

## Acknowledgments

Built with references drawn exclusively from primary sources — chromium.org, source.chromium.org, v8.dev, web.dev, W3C/WHATWG specs, and peer-reviewed research. No third-party blogs.

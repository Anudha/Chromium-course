# Lecture 4: Layout & Paint

## Topics
- Layout
- Paint
- Reflow

## Demo Code

let div = document.createElement("div");
document.body.appendChild(div);

for (let i = 0; i < 10000; i++) {
  div.style.width = i + "px";
}

## Observe
Performance slowdown

## Concept
Layout thrashing

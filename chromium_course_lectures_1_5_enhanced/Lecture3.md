# Lecture 3: Blink & DOM

## Topics
- HTML parsing
- DOM tree

## Demo Code
Create file: test.html

<html>
  <body>
    <script>
      console.time("parse");
    </script>
    <div>Test</div>
    <script>
      console.timeEnd("parse");
    </script>
  </body>
</html>

Open in Chrome and observe timing

## Concept
Parsing is incremental

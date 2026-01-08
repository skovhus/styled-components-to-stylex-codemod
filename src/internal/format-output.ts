export function formatOutput(code: string): string {
  // Recast sometimes inserts blank lines between object properties when values are multiline.
  // Our fixtures are formatted without those blank lines; normalize conservatively.
  let out = code.replace(
    /(\n\s*\},)\n\n(\s+(?:[a-zA-Z_$][a-zA-Z0-9_$]*|["'].*?["']|::[a-zA-Z-]+|@[a-zA-Z-]+|:[a-zA-Z-]+)\s*:)/g,
    "$1\n$2",
  );
  // General: remove blank lines after commas (prettier-style objects don't use them).
  out = out.replace(/,\n\n(\s+(?:[a-zA-Z_$]|["']|::|@|:))/g, ",\n$1");
  // Also remove blank lines after commas when the next line is a leading block comment.
  out = out.replace(/,\n\n(\s*\/\*)/g, ",\n$1");

  // If a trailing line comment got detached onto its own line immediately above an object property,
  // re-attach it inline after the property's comma:
  //
  //   // comment
  //   prop: value,
  //
  // -> prop: value, // comment
  out = out.replace(
    /\n\n?(\s*)\/\/\s*([^\n]+)\n\1((?:[a-zA-Z_$][a-zA-Z0-9_$]*|["'][^"']+["']))\s*:\s*([^\n]*?),/g,
    (_m, indent, comment, key, value) => `\n${indent}${key}: ${value}, // ${comment}`,
  );
  // Normalize `content` strings: prefer `'\"...\"'` form (matches fixtures) over escaped double-quotes.
  // Case 1: content: "\"X\""  (double-quoted with escapes)
  out = out.replace(/content:\s+"\\"([\s\S]*?)\\""/g, "content: '\"$1\"'");
  // Case 2: content: \"'X'\"   (double-quoted string that includes single quotes)
  out = out.replace(/content:\s+"'\s*([\s\S]*?)\s*'"/g, "content: '\"$1\"'");

  // Avoid extra blank line before a return in tiny wrapper components:
  //   const { ... } = props;
  //
  //   return (...)
  // ->
  //   const { ... } = props;
  //   return (...)
  out = out.replace(/\n(\s*(?:const|let|var)\s+[^\n]+;\n)\s*\n(\s*return\b)/g, "\n$1$2");
  // More generally, if there's an empty line immediately before a `return`, remove it.
  // This keeps wrapper components compact and matches our fixture formatting.
  out = out.replace(/\n[ \t]*\n(\s*return\b)/g, "\n$1");

  // Ensure there is a blank line after the final top-level import (when imports exist).
  // Some of our fixtures assert this formatting (especially after `import * as stylex ...`).
  out = (() => {
    const lines = out.split("\n");
    // Find the last consecutive import line at the top of the file (after optional leading comments).
    let i = 0;
    while (
      i < lines.length &&
      (lines[i]?.startsWith("//") || lines[i]?.startsWith("/*") || lines[i] === "")
    ) {
      // Stop on first non-comment/non-empty if we haven't started imports yet.
      // (We only care about top-of-file import blocks.)
      // If we see an import, we break out of this loop below.
      if (lines[i]?.startsWith("import ")) {
        break;
      }
      i++;
    }
    // Now consume consecutive import lines.
    let lastImportIdx = -1;
    for (; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (line.startsWith("import ")) {
        lastImportIdx = i;
        continue;
      }
      break;
    }
    if (lastImportIdx >= 0) {
      const next = lines[lastImportIdx + 1];
      if (next !== undefined && next.trim() !== "") {
        lines.splice(lastImportIdx + 1, 0, "");
      }
    }
    return lines.join("\n");
  })();

  // Normalize EOF: trim all trailing whitespace, then ensure a single trailing newline.
  return out.trimEnd() + "\n";
}

export function formatOutput(code: string): string {
  // Recast sometimes inserts blank lines between object properties when values are multiline.
  // Our fixtures are formatted without those blank lines; normalize conservatively.
  let out = code.replace(
    /(\n\s*\},)\n\n(\s+(?:[a-zA-Z_$][a-zA-Z0-9_$]*|["'].*?["']|::[a-zA-Z-]+|@[a-zA-Z-]+|:[a-zA-Z-]+)\s*:)/g,
    "$1\n$2",
  );
  // Remove blank lines between style properties inside stylex.create objects.
  // Matches: comma + blank line(s) + indented property/comment (4+ spaces indent suggests object interior)
  out = out.replace(/,\n\n+(    +(?:[a-zA-Z_$"']|\/\/|\/\*))/g, ",\n$1");

  // Normalize `content` strings: prefer `'\"...\"'` form (matches fixtures) over escaped double-quotes.
  // Case 1: content: "\"X\""  (double-quoted with escapes)
  out = out.replace(/content:\s+"\\"([\s\S]*?)\\""/g, "content: '\"$1\"'");
  // Case 2: content: \"'X'\"   (double-quoted string that includes single quotes)
  out = out.replace(/content:\s+"'\s*([\s\S]*?)\s*'"/g, "content: '\"$1\"'");

  // Normalize import spacing at the top of the file:
  // - Keep React and StyleX imports adjacent (no blank line between them).
  // - Ensure a blank line after the final top-level import.
  out = (() => {
    const lines = out.split("\n");
    const isImportLine = (line: string) => line.startsWith("import ");
    const isBlankLine = (line: string) => line.trim() === "";
    const isReactImport = (line: string) =>
      /^import\s+.*\s+from\s+["']react["'];?$/.test(line.trim());
    const isStylexImport = (line: string) =>
      /^import\s+.*\s+from\s+["']@stylexjs\/stylex["'];?$/.test(line.trim());

    // Find the top import block (allowing blank lines between imports).
    let importStart = -1;
    let importEnd = -1;
    let i = 0;
    for (; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const trimmed = line.trim();
      if (isImportLine(line)) {
        importStart = i;
        importEnd = i;
        i++;
        break;
      }
      if (
        trimmed === "" ||
        trimmed.startsWith("//") ||
        trimmed.startsWith("/*") ||
        trimmed.startsWith("*")
      ) {
        continue;
      }
      break;
    }

    if (importStart >= 0) {
      for (; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (isImportLine(line)) {
          importEnd = i;
          continue;
        }
        if (isBlankLine(line)) {
          continue;
        }
        break;
      }

      // Remove blank lines between React and StyleX imports.
      for (let idx = importStart; idx <= importEnd; idx++) {
        if (!isReactImport(lines[idx] ?? "")) {
          continue;
        }
        let nextIdx = idx + 1;
        while (nextIdx <= importEnd && isBlankLine(lines[nextIdx] ?? "")) {
          nextIdx++;
        }
        if (nextIdx <= importEnd && isStylexImport(lines[nextIdx] ?? "")) {
          const blanksToRemove = nextIdx - idx - 1;
          if (blanksToRemove > 0) {
            lines.splice(idx + 1, blanksToRemove);
            importEnd -= blanksToRemove;
          }
        }
        break;
      }

      // Ensure a blank line after the last import line in the block.
      const next = lines[importEnd + 1];
      if (next !== undefined && next.trim() !== "") {
        lines.splice(importEnd + 1, 0, "");
      }
    }

    return lines.join("\n");
  })();

  // Normalize EOF: trim all trailing whitespace, then ensure a single trailing newline.
  return out.trimEnd() + "\n";
}
